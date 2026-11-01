export const registerBackupRoutes = (app, dependencies) => {
  const {
    Deposit,
    MasterData,
    SalarySaving,
    backupRestoreRateLimiter,
    buildBackupFilename,
    buildBackupWorkbookBuffer,
    getBackupSourceStatus,
    getMasterData,
    importRateLimiter,
    importUpload,
    mongoose,
    normalizeDepositDoc,
    normalizeMasterData,
    ownerScopedQuerySchema,
    parseBackupWorkbook,
    requireAuth,
    requirePortfolioWriteAccess,
    resolvePortfolioContext,
    sanitizeRestoredDepositPayload,
    validateBackupSnapshot,
    validateRequest,
    writeAdminAuditLog
  } = dependencies

  app.get(
    '/api/data-backup/export',
    requireAuth,
    validateRequest(ownerScopedQuerySchema, 'query'),
    resolvePortfolioContext,
    requirePortfolioWriteAccess,
    async (request, response) => {
      const [deposits, masterData, salarySavings] = await Promise.all([
        Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean(),
        getMasterData(request.portfolioContext.ownerUserId, { createIfMissing: true }),
        SalarySaving.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean(),
      ])

      const workbookBuffer = await buildBackupWorkbookBuffer({
        portfolioLabel: request.portfolioContext.ownerDisplayName || 'portfolio',
        ownerUserId: request.portfolioContext.ownerUserId,
        deposits,
        masterData,
        salarySavings,
      })

      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${buildBackupFilename(request.portfolioContext.ownerDisplayName || 'portfolio')}"`,
      )
      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      response.send(workbookBuffer)
    },
  )

  app.post(
    '/api/data-backup/preview',
    importRateLimiter,
    requireAuth,
    validateRequest(ownerScopedQuerySchema, 'query'),
    resolvePortfolioContext,
    requirePortfolioWriteAccess,
    importUpload.single('file'),
    async (request, response) => {
      if (!request.file) {
        response.status(400).json({ message: 'Choose a backup file first.' })
        return
      }

      if (!request.file.originalname?.toLowerCase().endsWith('.xlsx')) {
        response.status(400).json({ message: 'Only .xlsx backup files are supported.' })
        return
      }

      try {
        const parsed = await parseBackupWorkbook(request.file.buffer)
        const existingSalarySavings = parsed.salarySavingsSheetPresent
          ? []
          : await SalarySaving.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean()
        const validation = validateBackupSnapshot({ ...parsed, existingSalarySavings })
        const destinationPortfolio = {
          label: request.portfolioContext.ownerDisplayName || 'portfolio',
          ownerUserId: request.portfolioContext.ownerUserId,
        }
        response.json({
          fileName: request.file.originalname,
          destinationPortfolio,
          sourcePortfolioStatus: getBackupSourceStatus(
            validation.sourcePortfolio,
            destinationPortfolio.ownerUserId,
          ),
          ...validation,
        })
      } catch (error) {
        response.status(400).json({
          message: error.message,
        })
      }
    },
  )

  app.post(
    '/api/data-backup/restore',
    backupRestoreRateLimiter,
    requireAuth,
    validateRequest(ownerScopedQuerySchema, 'query'),
    resolvePortfolioContext,
    requirePortfolioWriteAccess,
    importUpload.single('file'),
    async (request, response) => {
      if (!request.file) {
        response.status(400).json({ message: 'Choose a backup file first.' })
        return
      }

      if (!request.file.originalname?.toLowerCase().endsWith('.xlsx')) {
        response.status(400).json({ message: 'Only .xlsx backup files are supported.' })
        return
      }

      let validation
      let existingSalarySavings
      try {
        const parsed = await parseBackupWorkbook(request.file.buffer)
        existingSalarySavings = await SalarySaving.find({
          ownerUserId: request.portfolioContext.ownerUserId,
        }).lean()
        validation = validateBackupSnapshot({
          ...parsed,
          existingSalarySavings: parsed.salarySavingsSheetPresent ? [] : existingSalarySavings,
        })
      } catch (error) {
        response.status(400).json({
          message: error.message,
        })
        return
      }

      const sourcePortfolioStatus = getBackupSourceStatus(
        validation.sourcePortfolio,
        request.portfolioContext.ownerUserId,
      )
      if (sourcePortfolioStatus !== 'match' && request.body.confirmSourceIdentity !== 'true') {
        response.status(409).json({
          message: 'Confirm that you intend to restore this backup into a different or unidentified portfolio.',
          sourcePortfolio: validation.sourcePortfolio,
          sourcePortfolioStatus,
        })
        return
      }

      if (validation.hasErrors) {
        response.status(400).json({
          message: 'Backup file has validation issues. Review the preview before restoring.',
          ...validation,
        })
        return
      }

      const currentState = await Promise.all([
        Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean(),
        getMasterData(request.portfolioContext.ownerUserId, { createIfMissing: true }),
      ])

      const previousDeposits = currentState[0].map(normalizeDepositDoc)
      const previousMasterData = normalizeMasterData(currentState[1])
      const session = await mongoose.startSession()

      try {
        await session.startTransaction()

        await Deposit.deleteMany({ ownerUserId: request.portfolioContext.ownerUserId }, { session })
        await SalarySaving.deleteMany({ ownerUserId: request.portfolioContext.ownerUserId }, { session })

        const restoredDeposits = validation.snapshot.deposits.map((deposit) => {
          const snapshot = sanitizeRestoredDepositPayload(deposit)
          if (snapshot.createdAt) snapshot.createdAt = new Date(snapshot.createdAt)
          if (snapshot.updatedAt) snapshot.updatedAt = new Date(snapshot.updatedAt)

          return {
            ...snapshot,
            ownerUserId: request.portfolioContext.ownerUserId,
            createdByUserId: String(snapshot.createdByUserId || request.sessionUser.id),
            updatedByUserId: String(snapshot.updatedByUserId || request.sessionUser.id),
          }
        })

        if (restoredDeposits.length > 0) {
          await Deposit.collection.insertMany(restoredDeposits, { session })
        }
        const restoredSalarySavings = (validation.snapshot.salarySavings || []).map((saving) => {
          const snapshot = { ...saving }
          delete snapshot._id
          delete snapshot.__v
          if (snapshot.createdAt) snapshot.createdAt = new Date(snapshot.createdAt)
          if (snapshot.updatedAt) snapshot.updatedAt = new Date(snapshot.updatedAt)
          return {
            ...snapshot,
            ownerUserId: request.portfolioContext.ownerUserId,
            createdByUserId: String(snapshot.createdByUserId || request.sessionUser.id),
            updatedByUserId: String(snapshot.updatedByUserId || request.sessionUser.id),
          }
        })
        if (restoredSalarySavings.length > 0) {
          await SalarySaving.collection.insertMany(restoredSalarySavings, { session })
        }

        await MasterData.findOneAndUpdate(
          { ownerUserId: request.portfolioContext.ownerUserId },
          {
            ownerUserId: request.portfolioContext.ownerUserId,
            ...validation.snapshot.masterData,
          },
          {
            session,
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
          },
        )

        await writeAdminAuditLog({
          actor: request.sessionUser,
          action: 'admin.backup.restore',
          targetType: 'portfolioBackup',
          targetRecordId: request.portfolioContext.ownerUserId,
          targetOwnerUserId: request.portfolioContext.ownerUserId,
          before: {
            depositCount: previousDeposits.length,
            salarySavingsCount: existingSalarySavings.length,
            masterData: previousMasterData,
          },
          after: {
            depositCount: restoredDeposits.length,
            salarySavingsCount: restoredSalarySavings.length,
            masterData: validation.snapshot.masterData,
          },
          metadata: {
            fileName: request.file.originalname,
            summary: validation.summary,
          },
          session,
        })

        await session.commitTransaction()
      } catch (error) {
        if (session.inTransaction()) {
          await session.abortTransaction()
        }
        throw error
      } finally {
        await session.endSession()
      }

      response.json({
        message: 'Backup restored successfully.',
        summary: validation.summary,
      })
    },
  )
}
