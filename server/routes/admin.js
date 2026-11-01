export const registerAdminRoutes = (app, dependencies) => {
  const {
    Deposit,
    normalizeDepositDoc,
    ownerScopedQuerySchema,
    requireAdmin,
    requireAuth,
    resolvePortfolioContext,
    validateRequest,
    writeAdminAuditLog
  } = dependencies

  app.get(
    '/api/admin/export-data',
    requireAuth,
    validateRequest(ownerScopedQuerySchema, 'query'),
    resolvePortfolioContext,
    requireAdmin,
    async (request, response) => {
      const deposits = await Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean()
      await writeAdminAuditLog({
        actor: request.sessionUser,
        action: 'admin.exportData.download',
        targetType: 'portfolioExport',
        targetRecordId: request.portfolioContext.ownerUserId,
        targetOwnerUserId: request.portfolioContext.ownerUserId,
        metadata: {
          depositCount: deposits.length,
        },
      })
      response.json({
        deposits: deposits.map(normalizeDepositDoc),
      })
    },
  )
}
