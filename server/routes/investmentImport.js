export const registerInvestmentImportRoutes = (app, dependencies) => {
  const {
    Deposit,
    MasterData,
    buildImportMasterChanges,
    crypto,
    getMasterData,
    importQuerySchema,
    importRateLimiter,
    importUpload,
    mergeMasterDataForImport,
    mongoose,
    normalizeDepositDoc,
    parseImportWorkbook,
    requireAuth,
    requirePortfolioWriteAccess,
    resolvePortfolioContext,
    validateAndNormalizeImportRows,
    validateRequest,
    writeAdminAuditLog
  } = dependencies

  app.post(
    '/api/investment-import',
    importRateLimiter,
    requireAuth,
    validateRequest(importQuerySchema, 'query'),
    resolvePortfolioContext,
    requirePortfolioWriteAccess,
    importUpload.single('file'),
    async (request, response) => {
      if (!request.file?.buffer) {
        response.status(400).json({ message: 'Upload an .xlsx file in the "file" field.' })
        return
      }

      if (!request.file.originalname?.toLowerCase().endsWith('.xlsx')) {
        response.status(400).json({ message: 'Only .xlsx files are supported.' })
        return
      }

      const dryRun = String(request.query.dryRun || 'true').trim().toLowerCase() !== 'false'
      let rows

      try {
        rows = (await parseImportWorkbook(request.file.buffer)).rows
      } catch (error) {
        response.status(400).json({ message: error.message })
        return
      }
      const existingDeposits = (
        await Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean()
      ).map(normalizeDepositDoc)
      const validation = validateAndNormalizeImportRows({
        rows,
        existingDeposits,
      })
      const masterData = await getMasterData(request.portfolioContext.ownerUserId, {
        createIfMissing: request.portfolioContext.isOwner || request.sessionUser.systemRole === 'admin',
      })
      const masterChanges = buildImportMasterChanges(validation.validRows, masterData)
      const rowErrors = [
        ...validation.errors.map((message) => ({
          rowNumber: null,
          messages: [message],
        })),
        ...validation.rows
          .filter((row) => row.errors.length > 0)
          .map((row) => ({
            rowNumber: row.rowNumber,
            messages: row.errors,
          })),
      ]

      const previewPayload = {
        dryRun,
        parsedRowCount: rows.length,
        validRowCount: validation.validRows.length,
        hasErrors: rowErrors.length > 0,
        rowErrors,
        previewRows: validation.rows.map((row) => ({
          rowNumber: row.rowNumber,
          errors: row.errors,
          investment: row.normalized,
        })),
        masterChanges,
      }

      if (dryRun) {
        response.json(previewPayload)
        return
      }

      if (rowErrors.length > 0) {
        response.status(422).json(previewPayload)
        return
      }

      const highestSrNo = existingDeposits.reduce((max, deposit) => {
        const srNo = Number(deposit.srNo)
        return Number.isFinite(srNo) ? Math.max(max, srNo) : max
      }, 0)

      const session = await mongoose.startSession()

      try {
        let createdCount = 0

        await session.withTransaction(async () => {
          const nextMasterData = mergeMasterDataForImport(masterData, masterChanges)

          await MasterData.findOneAndUpdate(
            { ownerUserId: request.portfolioContext.ownerUserId },
            {
              ownerUserId: request.portfolioContext.ownerUserId,
              ...nextMasterData,
            },
            { new: true, upsert: true, setDefaultsOnInsert: true, session },
          ).lean()

          const investmentDocuments = validation.validRows.map((row, index) => ({
            id: `fd-${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${index}`,
            srNo: highestSrNo + index + 1,
            bankName: row.bankName,
            branchCity: row.branchCity,
            holderName: row.holderName,
            fundingSource: row.fundingSource,
            instrumentType: row.instrumentType,
            payoutMode: row.payoutMode,
            yearlyPayoutMonthDay: row.yearlyPayoutMonthDay,
            interestPayoutBeforeTds: row.interestPayoutBeforeTds,
            interestPayoutAfterTds: row.interestPayoutAfterTds,
            accountNumber: row.accountNumber,
            tenureYears: row.tenureYears,
            tenureMonths: row.tenureMonths,
            tenureDays: row.tenureDays,
            interestRate: row.interestRate,
            principalAmount: row.principalAmount,
            investmentDate: row.investmentDate,
            maturityDate: row.maturityDate,
            maturityBeforeTax: row.maturityBeforeTax,
            maturityAfterTax: row.maturityAfterTax,
            totalInterestEarned: row.totalInterestEarned,
            tdsPercent: row.tdsPercent,
            tdsAmount: row.tdsAmount,
            status: row.status,
            allocations: [],
            notes: row.notes,
            ownerUserId: request.portfolioContext.ownerUserId,
            createdByUserId: request.sessionUser.id,
            updatedByUserId: request.sessionUser.id,
            isDeleted: false,
          }))

          const created = await Deposit.create(investmentDocuments, { session, ordered: true })
          createdCount = created.length

          if (request.sessionUser.systemRole === 'admin') {
            await writeAdminAuditLog({
              actor: request.sessionUser,
              action: 'admin.masterData.bulkCreate',
              targetType: 'masterData',
              targetRecordId: request.portfolioContext.ownerUserId,
              targetOwnerUserId: request.portfolioContext.ownerUserId,
              after: nextMasterData,
              metadata: {
                createdValues: masterChanges,
              },
              session,
            })

            await writeAdminAuditLog({
              actor: request.sessionUser,
              action: 'admin.investment.bulkImport',
              targetType: 'investment',
              targetRecordId: '',
              targetOwnerUserId: request.portfolioContext.ownerUserId,
              metadata: {
                importedCount: created.length,
                createdValues: masterChanges,
                fileName: request.file.originalname,
              },
              session,
            })
          }
        })

        response.json({
          importedCount: createdCount,
          masterChanges,
          message: `${createdCount} investments imported successfully.`,
        })
      } finally {
        await session.endSession()
      }
    },
  )
}
