export const registerInvestmentRoutes = (app, dependencies) => {
  const {
    Deposit,
    SalarySaving,
    backupRestoreRateLimiter,
    buildUpdateQuery,
    crypto,
    depositWriteBodySchema,
    getArchiveDependents,
    idParamSchema,
    investmentRenewalBodySchema,
    mongoose,
    normalizeDepositDoc,
    ownerScopedQuerySchema,
    removeFundingLinksForDeletedDeposit,
    requireAdmin,
    requireAuth,
    requirePortfolioWriteAccess,
    resolvePortfolioContext,
    sanitizeDepositWritePayload,
    validateRequest,
    writeAdminAuditLog,
    writeRateLimiter
  } = dependencies

  app.post('/api/deposits', writeRateLimiter, requireAuth, validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, requirePortfolioWriteAccess, validateRequest(depositWriteBodySchema), async (request, response) => {
    const depositPayload = sanitizeDepositWritePayload(request.body)
    delete depositPayload.parentInvestmentId
    const created = await Deposit.create({
      ...depositPayload,
      ownerUserId: request.portfolioContext.ownerUserId,
      createdByUserId: request.sessionUser.id,
      updatedByUserId: request.sessionUser.id,
    })

    await writeAdminAuditLog({
      actor: request.sessionUser,
      action: 'admin.investment.create',
      targetType: 'investment',
      targetRecordId: created.id,
      targetOwnerUserId: request.portfolioContext.ownerUserId,
      after: normalizeDepositDoc(created.toObject()),
    })

    response.status(201).json(normalizeDepositDoc(created.toObject()))
  })

  app.put('/api/deposits/:id', writeRateLimiter, requireAuth, validateRequest(idParamSchema, 'params'), validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, requirePortfolioWriteAccess, validateRequest(depositWriteBodySchema), async (request, response) => {
    const existing = await Deposit.findOne(
      buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
    ).lean()

    if (!existing) {
      response.status(404).json({ message: 'Deposit not found' })
      return
    }

    const depositPayload = sanitizeDepositWritePayload(request.body)
    depositPayload.parentInvestmentId = existing.parentInvestmentId || ''
    const updated = await Deposit.findOneAndUpdate(
      buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
      {
        ...depositPayload,
        ownerUserId: request.portfolioContext.ownerUserId,
        updatedByUserId: request.sessionUser.id,
      },
      { new: true, upsert: false },
    ).lean()

    await writeAdminAuditLog({
      actor: request.sessionUser,
      action: 'admin.investment.update',
      targetType: 'investment',
      targetRecordId: request.params.id,
      targetOwnerUserId: request.portfolioContext.ownerUserId,
      before: normalizeDepositDoc(existing),
      after: normalizeDepositDoc(updated),
    })

    response.json(normalizeDepositDoc(updated))
  })

  app.post('/api/deposits/:id/renew', writeRateLimiter, requireAuth, validateRequest(idParamSchema, 'params'), validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, requirePortfolioWriteAccess, validateRequest(investmentRenewalBodySchema), async (request, response) => {
    const ownerUserId = request.portfolioContext.ownerUserId
    const parentInvestmentId = request.params.id
    const existingParent = await Deposit.findOne(
      buildUpdateQuery(parentInvestmentId, ownerUserId),
    ).lean()
    if (!existingParent) {
      response.status(404).json({ message: 'Investment not found.' })
      return
    }
    if (String(existingParent.status || '').toLowerCase() === 'closed') {
      response.status(409).json({ message: 'A closed investment cannot be renewed again.' })
      return
    }

    const closedInvestment = sanitizeDepositWritePayload(request.body.closedInvestment)
    const successorInvestment = sanitizeDepositWritePayload(request.body.successorInvestment)
    if (closedInvestment.id !== parentInvestmentId || closedInvestment.status !== 'Closed') {
      response.status(400).json({ message: 'Renewal must close the selected parent investment.' })
      return
    }
    if (!successorInvestment.id || successorInvestment.id === parentInvestmentId) {
      response.status(400).json({ message: 'Renewal must create a distinct successor investment.' })
      return
    }
    successorInvestment.parentInvestmentId = parentInvestmentId
    if (String(successorInvestment.status || '').toLowerCase() === 'closed') {
      response.status(400).json({ message: 'A renewal successor must be open.' })
      return
    }

    const requestedAllocations = request.body.salaryAllocations || []
    const requestedSavingIds = new Set()
    for (const allocation of requestedAllocations) {
      if (requestedSavingIds.has(allocation.salarySavingId)) {
        response.status(400).json({ message: 'A salary month can only be assigned once per renewal.' })
        return
      }
      requestedSavingIds.add(allocation.salarySavingId)
    }
    const assignedTotal = requestedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0)
    if (assignedTotal > Number(successorInvestment.principalAmount || 0) + 0.0001) {
      response.status(400).json({ message: 'Salary amounts assigned to the successor cannot exceed its principal.' })
      return
    }

    const savings = await SalarySaving.find({ ownerUserId }).lean()
    const portfolioInvestments = await Deposit.find({ ownerUserId }).lean()
    const investmentById = new Map(portfolioInvestments.map((investment) => [investment.id, investment]))
    const linkedBySavingId = new Map()
    savings.forEach((saving) => {
      const linkedAmount = (saving.investmentAllocations || [])
        .filter((link) => link.investmentId === parentInvestmentId && !link.isHistorical)
        .reduce((sum, link) => sum + Number(link.amount || 0), 0)
      if (linkedAmount > 0) linkedBySavingId.set(saving.id, { saving, linkedAmount })
    })

    for (const allocation of requestedAllocations) {
      if (allocation.amount === 0) continue
      const source = linkedBySavingId.get(allocation.salarySavingId)
      if (!source) {
        response.status(400).json({ message: 'Salary allocations must come from salary months linked to the parent investment.' })
        return
      }
      if (allocation.amount > source.linkedAmount + 0.0001) {
        response.status(400).json({ message: `Salary allocation for ${source.saving.salaryMonth} cannot exceed its amount linked to the parent investment (${source.linkedAmount}).` })
        return
      }
      const otherActiveAmount = (source.saving.investmentAllocations || [])
        .filter((link) => {
          const linkedInvestment = investmentById.get(link.investmentId)
          return link.investmentId !== parentInvestmentId &&
            !link.isHistorical &&
            linkedInvestment &&
            String(linkedInvestment.status || '').toLowerCase() !== 'closed'
        })
        .reduce((sum, link) => sum + Number(link.amount || 0), 0)
      const unavailableAmount = (source.saving.unavailable || [])
        .reduce((sum, item) => sum + Number(item.amount || 0), 0)
      if (otherActiveAmount + unavailableAmount + allocation.amount > Number(source.saving.amount || 0) + 0.0001) {
        response.status(400).json({ message: `Salary allocations for ${source.saving.salaryMonth} exceed its target amount.` })
        return
      }
    }

    const session = await mongoose.startSession()
    let savedParent
    let savedSuccessor
    try {
      await session.withTransaction(async () => {
        savedParent = await Deposit.findOneAndUpdate(
          { ...buildUpdateQuery(parentInvestmentId, ownerUserId), status: { $ne: 'Closed' } },
          {
            ...closedInvestment,
            ownerUserId,
            updatedByUserId: request.sessionUser.id,
          },
          { new: true, upsert: false, session },
        ).lean()
        if (!savedParent) {
          const conflict = new Error('The parent investment was closed or changed before renewal.')
          conflict.statusCode = 409
          throw conflict
        }

        const [createdSuccessor] = await Deposit.create([{
          ...successorInvestment,
          ownerUserId,
          createdByUserId: request.sessionUser.id,
          updatedByUserId: request.sessionUser.id,
        }], { session })
        savedSuccessor = normalizeDepositDoc(createdSuccessor.toObject())

        for (const allocation of requestedAllocations) {
          if (allocation.amount <= 0) continue
          const source = linkedBySavingId.get(allocation.salarySavingId)
          const updatedSaving = await SalarySaving.findOneAndUpdate(
            { id: allocation.salarySavingId, ownerUserId },
            {
              $push: {
                investmentAllocations: {
                  id: crypto.randomUUID(),
                  investmentId: savedSuccessor.id,
                  amount: allocation.amount,
                },
              },
              updatedByUserId: request.sessionUser.id,
            },
            { new: true, session },
          ).lean()
          if (!updatedSaving || !source) {
            throw new Error(`Could not update salary month ${source?.saving.salaryMonth || allocation.salarySavingId}.`)
          }
        }

        await writeAdminAuditLog({
          actor: request.sessionUser,
          action: 'admin.investment.update',
          targetType: 'investment',
          targetRecordId: parentInvestmentId,
          targetOwnerUserId: ownerUserId,
          before: normalizeDepositDoc(existingParent),
          after: normalizeDepositDoc(savedParent),
          session,
        })
        await writeAdminAuditLog({
          actor: request.sessionUser,
          action: 'admin.investment.create',
          targetType: 'investment',
          targetRecordId: savedSuccessor.id,
          targetOwnerUserId: ownerUserId,
          after: savedSuccessor,
          session,
        })
      })
    } finally {
      await session.endSession()
    }

    response.status(201).json({
      parent: normalizeDepositDoc(savedParent),
      successor: savedSuccessor,
    })
  })

  app.post('/api/deposits/:id/archive', writeRateLimiter, requireAuth, validateRequest(idParamSchema, 'params'), validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, requirePortfolioWriteAccess, async (request, response) => {
    const existing = await Deposit.findOne(
      buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
    ).lean()

    if (!existing) {
      response.status(404).json({ message: 'Deposit not found' })
      return
    }

    const normalizedExisting = normalizeDepositDoc(existing)
    if (normalizedExisting.isDeleted) {
      response.json(normalizedExisting)
      return
    }

    const salaryLinks = await SalarySaving.find({
      ownerUserId: request.portfolioContext.ownerUserId,
      'investmentAllocations.investmentId': request.params.id,
    }).lean()
    if (salaryLinks.length > 0) {
      response.status(409).json({
        message: 'Cannot archive this investment while it is linked to salary savings. Remove or reassign the salary link first.',
      })
      return
    }

    const ownerDeposits = (
      await Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean()
    ).map(normalizeDepositDoc)
    const dependents = getArchiveDependents(normalizedExisting, ownerDeposits)

    if (dependents.length > 0) {
      const dependentLabels = dependents
        .map((deposit) => deposit.accountNumber || deposit.bankName || deposit.id)
        .join(', ')

      response.status(409).json({
        message: `Cannot archive this investment because it is still used as a funding source by: ${dependentLabels}`,
        dependents,
      })
      return
    }

    const archived = await Deposit.findOneAndUpdate(
      buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
      {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        updatedByUserId: request.sessionUser.id,
      },
      { new: true, upsert: false },
    ).lean()

    await writeAdminAuditLog({
      actor: request.sessionUser,
      action: 'admin.investment.archive',
      targetType: 'investment',
      targetRecordId: request.params.id,
      targetOwnerUserId: request.portfolioContext.ownerUserId,
      before: normalizedExisting,
      after: normalizeDepositDoc(archived),
    })

    response.json(normalizeDepositDoc(archived))
  })

  app.delete(
    '/api/deposits/:id',
    backupRestoreRateLimiter,
    requireAuth,
    validateRequest(idParamSchema, 'params'),
    validateRequest(ownerScopedQuerySchema, 'query'),
    resolvePortfolioContext,
    requireAdmin,
    async (request, response) => {
      const existing = await Deposit.findOne(
        buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
      ).lean()

      if (!existing) {
        response.status(404).json({ message: 'Deposit not found' })
        return
      }

      const normalizedExisting = normalizeDepositDoc(existing)
      const salaryLinks = await SalarySaving.countDocuments({
        ownerUserId: request.portfolioContext.ownerUserId,
        'investmentAllocations.investmentId': request.params.id,
      })
      if (salaryLinks > 0) {
        response.status(409).json({
          message: 'Cannot permanently delete this investment while it is linked to salary savings. Remove or reassign the salary link first.',
        })
        return
      }
      const cleanedChildren = await removeFundingLinksForDeletedDeposit({
        deletedDeposit: normalizedExisting,
        ownerUserId: request.portfolioContext.ownerUserId,
        actor: request.sessionUser,
      })

      await Deposit.deleteOne({
        id: request.params.id,
        ownerUserId: request.portfolioContext.ownerUserId,
      })

      await writeAdminAuditLog({
        actor: request.sessionUser,
        action: 'admin.investment.delete',
        targetType: 'investment',
        targetRecordId: request.params.id,
        targetOwnerUserId: request.portfolioContext.ownerUserId,
        before: normalizedExisting,
        metadata: {
          cleanedFundingLinks: cleanedChildren,
        },
      })

      response.json({ ok: true })
    },
  )
}
