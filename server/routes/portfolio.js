export const registerPortfolioRoutes = (app, dependencies) => {
  const {
    Deposit,
    MasterData,
    SalarySaving,
    buildBranchRenameEffects,
    buildMasterRenameMap,
    buildTaxEstimationInvestmentInput,
    canonicalizeDepositAgainstMasterData,
    crypto,
    emptyMasterData,
    findMasterReferenceViolations,
    generateOwnerWiseFYTaxSummary,
    getMasterData,
    idParamSchema,
    masterDataBodySchema,
    normalizeDepositDoc,
    normalizeMasterData,
    ownerScopedQuerySchema,
    parseFinancialYearLabel,
    propagateMasterRenames,
    reconcileDepositsWithMasterData,
    requireAuth,
    requirePortfolioWriteAccess,
    resolvePortfolioContext,
    salarySavingBodySchema,
    taxQuerySchema,
    validateRequest,
    writeAdminAuditLog,
    writeRateLimiter
  } = dependencies

  const normalizeSalarySaving = (saving, investmentById = new Map()) => {
    const unavailable = Array.isArray(saving.unavailable) ? saving.unavailable : []
    const investmentAllocations = Array.isArray(saving.investmentAllocations)
      ? saving.investmentAllocations
      : []
    const unavailableAmount = unavailable.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const allocationsWithHistory = investmentAllocations.map((item) => {
      const investment = investmentById.get(item.investmentId)
      const isHistorical = Boolean(
        item.isHistorical ||
        (investmentById.size > 0 &&
          (!investment || String(investment.status || '').toLowerCase() === 'closed'))
      )
      return {
        ...item,
        isHistorical,
        investmentLabel: investment?.label || 'Archived or removed investment',
        investmentDate: investment?.investmentDate || '',
        investmentStatus: investment?.status || '',
        parentInvestmentId: investment?.parentInvestmentId || '',
        parentInvestmentLabel: investmentById.get(investment?.parentInvestmentId)?.label || '',
      }
    })
    const investedAmount = allocationsWithHistory.reduce(
      (sum, item) => sum + (item.isHistorical ? 0 : Number(item.amount || 0)),
      0,
    )
    const historicalAmount = allocationsWithHistory.reduce(
      (sum, item) => sum + (item.isHistorical ? Number(item.amount || 0) : 0),
      0,
    )
    return {
      ...saving,
      unavailable,
      investmentAllocations: allocationsWithHistory,
      unavailableAmount,
      investedAmount,
      historicalAmount,
      remainingAmount: Math.max(Number(saving.amount || 0) - unavailableAmount - investedAmount, 0),
    }
  }

  const normalizeSalarySavingForOwner = async (saving, ownerUserId) => {
    const investmentIds = [...new Set(
      (saving.investmentAllocations || []).map((allocation) => allocation.investmentId),
    )]
    const investments = investmentIds.length > 0
      ? await Deposit.find({ ownerUserId, id: { $in: investmentIds } }).lean()
      : []
    const investmentById = new Map(investments.map((investment) => [investment.id, {
      status: investment.status,
      label: `${investment.bankName || 'Investment'} · ${investment.accountNumber || investment.id}`,
      investmentDate: investment.investmentDate,
      parentInvestmentId: investment.parentInvestmentId,
    }]))
    investmentById.forEach((investment) => {
      investment.parentInvestmentLabel = investmentById.get(investment.parentInvestmentId)?.label || ''
    })
    return normalizeSalarySaving(saving, investmentById)
  }

  const sanitizeSalarySavingPayload = async (payload, ownerUserId, excludedSavingId = '') => {
    const parsed = salarySavingBodySchema.parse(payload)
    const unavailable = (parsed.unavailable || []).map((item) => ({
      id: item.id || crypto.randomUUID(), amount: item.amount, reason: item.reason,
    }))
    const submittedAllocations = (parsed.investmentAllocations || []).map((item) => ({
      id: item.id || crypto.randomUUID(), investmentId: item.investmentId, amount: item.amount,
    }))
    const existingSaving = excludedSavingId
      ? await SalarySaving.findOne({ ownerUserId, id: excludedSavingId }).lean()
      : null
    const existingInvestmentIds = (existingSaving?.investmentAllocations || []).map((item) => item.investmentId)
    const investmentIds = [...new Set([
      ...submittedAllocations.map((item) => item.investmentId),
      ...existingInvestmentIds,
    ])]
    const investments = investmentIds.length > 0
      ? await Deposit.find({
        ownerUserId,
        id: { $in: investmentIds },
        isDeleted: { $ne: true },
      }).lean()
      : []
    const investmentsById = new Map(investments.map((investment) => [investment.id, investment]))
    const unavailableInvestment = submittedAllocations.find((allocation) =>
      String(investmentsById.get(allocation.investmentId)?.status || '').toLowerCase() === 'closed',
    )
    if (unavailableInvestment) {
      throw new Error('Closed investments are history only and cannot receive new salary allocations.')
    }
    const submittedInvestmentIds = new Set(submittedAllocations.map((item) => item.investmentId))
    const historicalAllocations = (existingSaving?.investmentAllocations || []).filter((item) => {
      const investment = investmentsById.get(item.investmentId)
      return !submittedInvestmentIds.has(item.investmentId) &&
        (!investment || String(investment.status || '').toLowerCase() === 'closed' || item.isHistorical)
    })
    const investmentAllocations = [...submittedAllocations, ...historicalAllocations]
    const currentAllocations = submittedAllocations
    const allocated = [
      ...unavailable,
      ...currentAllocations,
    ].reduce((sum, item) => sum + Number(item.amount || 0), 0)
    if (allocated > parsed.amount + 0.0001) {
      throw new Error('Invested and unavailable amounts cannot exceed the monthly savings amount.')
    }
    const submittedIds = [...new Set(submittedAllocations.map((item) => item.investmentId))]
    if (submittedIds.length > 0 && submittedIds.some((investmentId) => !investmentsById.has(investmentId))) {
        throw new Error('One or more selected investments are unavailable.')
    }
    const activeInvestmentIds = submittedIds.filter((investmentId) =>
      String(investmentsById.get(investmentId)?.status || '').toLowerCase() !== 'closed',
    )
    if (activeInvestmentIds.length > 0) {
      const otherSavings = await SalarySaving.find({
        ownerUserId,
        ...(excludedSavingId ? { id: { $ne: excludedSavingId } } : {}),
        'investmentAllocations.investmentId': { $in: activeInvestmentIds },
      }).lean()
      const linkedByInvestment = new Map()
      otherSavings.forEach((saving) => (saving.investmentAllocations || []).forEach((link) => {
        if (activeInvestmentIds.includes(link.investmentId)) {
          linkedByInvestment.set(link.investmentId, (linkedByInvestment.get(link.investmentId) || 0) + Number(link.amount || 0))
        }
      }))
      currentAllocations.forEach((link) => {
        linkedByInvestment.set(link.investmentId, (linkedByInvestment.get(link.investmentId) || 0) + Number(link.amount || 0))
      })
      const overAllocated = investments.find((investment) =>
        activeInvestmentIds.includes(investment.id) &&
        (linkedByInvestment.get(investment.id) || 0) > Number(investment.principalAmount || 0) + 0.0001,
      )
      if (overAllocated) {
        const linkedAmount = linkedByInvestment.get(overAllocated.id) || 0
        throw new Error(`Salary links for ${overAllocated.bankName || 'this investment'} cannot exceed its investment amount (${Number(overAllocated.principalAmount || 0)}). Currently linked: ${linkedAmount}.`)
      }
    }
    return { ...parsed, unavailable, investmentAllocations }
  }

  app.get('/api/deposits', requireAuth, validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, async (request, response) => {
    const [deposits, masterData] = await Promise.all([
      Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean(),
      getMasterData(request.portfolioContext.ownerUserId, {
        createIfMissing: request.portfolioContext.isOwner,
      }),
    ])
    response.json(
      deposits.map((deposit) =>
        canonicalizeDepositAgainstMasterData(normalizeDepositDoc(deposit), masterData),
      ),
    )
  })

  app.get('/api/salary-savings', requireAuth, validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, async (request, response) => {
    const [savings, investments] = await Promise.all([
      SalarySaving.find({ ownerUserId: request.portfolioContext.ownerUserId }).sort({ salaryMonth: -1 }).lean(),
      Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId, isDeleted: { $ne: true } }).lean(),
    ])
    const investmentById = new Map(investments.map((item) => [item.id, {
      status: item.status,
      label: `${item.bankName || 'Investment'} · ${item.accountNumber || item.id}`,
      investmentDate: item.investmentDate,
      parentInvestmentId: item.parentInvestmentId,
    }]))
    investmentById.forEach((investment) => {
      investment.parentInvestmentLabel = investmentById.get(investment.parentInvestmentId)?.label || ''
    })
    response.json(savings.map((saving) => normalizeSalarySaving(saving, investmentById)))
  })

  app.post('/api/salary-savings', writeRateLimiter, requireAuth, validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, requirePortfolioWriteAccess, validateRequest(salarySavingBodySchema), async (request, response) => {
    try {
      const payload = await sanitizeSalarySavingPayload(request.body, request.portfolioContext.ownerUserId)
      const created = await SalarySaving.create({
        ...payload,
        id: `salary-${crypto.randomUUID()}`,
        ownerUserId: request.portfolioContext.ownerUserId,
        createdByUserId: request.sessionUser.id,
        updatedByUserId: request.sessionUser.id,
      })
      response.status(201).json(await normalizeSalarySavingForOwner(created.toObject(), request.portfolioContext.ownerUserId))
    } catch (error) {
      response.status(error?.code === 11000 ? 409 : 400).json({ message: error?.code === 11000 ? 'A savings record already exists for this month.' : error.message })
    }
  })

  app.put('/api/salary-savings/:id', writeRateLimiter, requireAuth, validateRequest(idParamSchema, 'params'), validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, requirePortfolioWriteAccess, validateRequest(salarySavingBodySchema), async (request, response) => {
    try {
      const payload = await sanitizeSalarySavingPayload(request.body, request.portfolioContext.ownerUserId, request.params.id)
      const updated = await SalarySaving.findOneAndUpdate(
        { id: request.params.id, ownerUserId: request.portfolioContext.ownerUserId },
        { ...payload, updatedByUserId: request.sessionUser.id },
        { new: true },
      ).lean()
      if (!updated) {
        response.status(404).json({ message: 'Salary savings record not found' })
        return
      }
      response.json(await normalizeSalarySavingForOwner(updated, request.portfolioContext.ownerUserId))
    } catch (error) {
      response.status(error?.code === 11000 ? 409 : 400).json({ message: error?.code === 11000 ? 'A savings record already exists for this month.' : error.message })
    }
  })

  app.get('/api/master-data', requireAuth, validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, async (request, response) => {
    response.json(
      await getMasterData(request.portfolioContext.ownerUserId, {
        createIfMissing: request.portfolioContext.isOwner,
      }),
    )
  })

  app.get('/api/tax-estimation', requireAuth, validateRequest(taxQuerySchema, 'query'), resolvePortfolioContext, async (request, response) => {
    const fy = parseFinancialYearLabel(String(request.query.fy || ''))
    const [deposits, masterData] = await Promise.all([
      Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId, isDeleted: { $ne: true } }).lean(),
      getMasterData(request.portfolioContext.ownerUserId, {
        createIfMissing: request.portfolioContext.isOwner,
      }),
    ])

    const summary = generateOwnerWiseFYTaxSummary(
      deposits.map((deposit) => buildTaxEstimationInvestmentInput(normalizeDepositDoc(deposit))),
      fy,
      masterData.owners || [],
    )

    response.json(summary)
  })

  app.put(
    '/api/master-data',
    writeRateLimiter,
    requireAuth,
    validateRequest(ownerScopedQuerySchema, 'query'),
    resolvePortfolioContext,
    requirePortfolioWriteAccess,
    validateRequest(masterDataBodySchema),
    async (request, response) => {
      const normalized = normalizeMasterData(request.body || {})
      const previous = await MasterData.findOne({
        ownerUserId: request.portfolioContext.ownerUserId,
      }).lean()
      const previousNormalized = previous ? normalizeMasterData(previous) : emptyMasterData
      const deposits = await Deposit.find({
        ownerUserId: request.portfolioContext.ownerUserId,
        isDeleted: { $ne: true },
      }).lean()
      const referenceViolations = findMasterReferenceViolations(
        deposits,
        previousNormalized,
        normalized,
      )

      if (referenceViolations.length > 0) {
        response.status(400).json({
          error: `Cannot delete referenced master data. ${referenceViolations.join(' ')}`,
        })
        return
      }

      const ownerRenameMap = buildMasterRenameMap(previousNormalized.owners || [], normalized.owners || [])
      const institutionRenameMap = buildMasterRenameMap(
        previousNormalized.institutions || [],
        normalized.institutions || [],
      )
      const instrumentTypeRenameMap = buildMasterRenameMap(
        previousNormalized.instrumentTypes || [],
        normalized.instrumentTypes || [],
      )
      const branchRenameEffects = buildBranchRenameEffects(
        previousNormalized.institutions || [],
        normalized.institutions || [],
      )
      const updated = await MasterData.findOneAndUpdate(
        { ownerUserId: request.portfolioContext.ownerUserId },
        {
          ownerUserId: request.portfolioContext.ownerUserId,
          ...normalized,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean()
      const updatedNormalized = normalizeMasterData(updated)
      const renamedDepositCount = await propagateMasterRenames(
        request.portfolioContext.ownerUserId,
        {
          ownerRenameMap,
          institutionRenameMap,
          instrumentTypeRenameMap,
          branchRenameEffects,
        },
      )
      const reconciledDepositCount = await reconcileDepositsWithMasterData(
        request.portfolioContext.ownerUserId,
        updatedNormalized,
      )

      await writeAdminAuditLog({
        actor: request.sessionUser,
        action: previous ? 'admin.masterData.update' : 'admin.masterData.create',
        targetType: 'masterData',
        targetRecordId: String(updated._id),
        targetOwnerUserId: request.portfolioContext.ownerUserId,
        before: previous ? previousNormalized : null,
        after: updatedNormalized,
        metadata:
          renamedDepositCount > 0 || reconciledDepositCount > 0
            ? {
                renamedDepositCount,
                reconciledDepositCount,
                ownerRenameMap,
                institutionRenameMap,
                instrumentTypeRenameMap,
                branchRenameEffects,
              }
            : undefined,
      })

      response.json({
        ...updatedNormalized,
        renameEffects: {
          owners: ownerRenameMap,
          institutions: institutionRenameMap,
          instrumentTypes: instrumentTypeRenameMap,
          branches: branchRenameEffects,
          renamedDepositCount,
          reconciledDepositCount,
        },
      })
    },
  )
}
