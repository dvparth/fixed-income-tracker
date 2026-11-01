export const registerSystemRoutes = (app, dependencies) => {
  const {
    DEMO_ENABLED,
    DEMO_OWNER_ID,
    DEMO_PORTFOLIO_LABEL,
    Deposit,
    buildDemoPortfolioSnapshot,
    buildDetailedHealthPayload,
    buildHealthPayload,
    buildTaxEstimationInvestmentInput,
    canonicalizeDepositAgainstMasterData,
    demoRateLimiter,
    generateOwnerWiseFYTaxSummary,
    getMasterData,
    normalizeDepositDoc,
    normalizeMasterData,
    parseFinancialYearLabel,
    validateHealthDetailAccess,
    validateRequest,
    z
  } = dependencies

  const requireDemoEnabled = (_request, response, next) => {
    if (!DEMO_ENABLED) {
      response.status(404).json({ message: 'Not found' })
      return
    }

    next()
  }

  const loadDemoPortfolioSnapshot = async () => {
    const [deposits, masterData] = await Promise.all([
      Deposit.find({ ownerUserId: DEMO_OWNER_ID }).lean(),
      getMasterData(DEMO_OWNER_ID, { createIfMissing: false }),
    ])
    const normalizedMasterData = normalizeMasterData(masterData)
    const normalizedDeposits = deposits.map((deposit) =>
      canonicalizeDepositAgainstMasterData(normalizeDepositDoc(deposit), normalizedMasterData),
    )
    const investmentById = new Map(normalizedDeposits.map((investment) => [investment.id, investment]))
    const demoSnapshot = buildDemoPortfolioSnapshot(DEMO_OWNER_ID)
    const salarySavings = demoSnapshot.salarySavings.map((saving) => ({
      ...saving,
      unavailableAmount: saving.unavailable.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      investmentAllocations: saving.investmentAllocations.map((allocation) => {
        const investment = investmentById.get(allocation.investmentId)
        const isHistorical = Boolean(
          allocation.isHistorical ||
          !investment ||
          String(investment.status || '').toLowerCase() === 'closed',
        )
        return {
          ...allocation,
          isHistorical,
          investmentLabel: investment
            ? `${investment.bankName || 'Investment'} · ${investment.accountNumber || investment.id}`
            : 'Archived or removed investment',
          investmentDate: investment?.investmentDate || '',
          parentInvestmentId: investment?.parentInvestmentId || '',
          parentInvestmentLabel: investmentById.get(investment?.parentInvestmentId)?.bankName || '',
        }
      }),
    }))

    return {
      portfolio: {
        ownerUserId: DEMO_OWNER_ID,
        label: DEMO_PORTFOLIO_LABEL,
        mode: 'demo',
      },
      deposits: normalizedDeposits,
      masterData: normalizedMasterData,
      salarySavings,
    }
  }

  app.get('/api/health', (_request, response) => {
    const payload = buildHealthPayload()
    response.status(payload.ok ? 200 : 503).json(payload)
  })

  app.get(
    '/api/health/details',
    validateRequest(z.object({ token: z.string().trim().optional() }).strict(), 'query'),
    validateHealthDetailAccess,
    (_request, response) => {
      const payload = buildDetailedHealthPayload()
      response.status(payload.ok ? 200 : 503).json(payload)
    },
  )

  app.get('/api/demo/portfolio', demoRateLimiter, requireDemoEnabled, async (_request, response) => {
    response.json(await loadDemoPortfolioSnapshot())
  })

  app.get(
    '/api/demo/tax-estimation',
    demoRateLimiter,
    requireDemoEnabled,
    validateRequest(z.object({ fy: z.string().trim().min(1).max(12).optional() }).strict(), 'query'),
    async (request, response) => {
      const fy = parseFinancialYearLabel(String(request.query.fy || ''))
      const snapshot = await loadDemoPortfolioSnapshot()
      const activeDemoDeposits = snapshot.deposits.filter((deposit) => !deposit.isDeleted)
      const summary = generateOwnerWiseFYTaxSummary(
        activeDemoDeposits.map((deposit) => buildTaxEstimationInvestmentInput(deposit)),
        fy,
        snapshot.masterData.owners || [],
      )

      response.json(summary)
    },
  )
}
