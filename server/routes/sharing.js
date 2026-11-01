export const registerSharingRoutes = (app, dependencies) => {
  const {
    PortfolioShare,
    YieldflowUser,
    idParamSchema,
    normalizeUserDoc,
    requireAuth,
    requireUserRole,
    shareCreateBodySchema,
    validateRequest,
    writeAdminAuditLog,
    writeRateLimiter
  } = dependencies

  app.get('/api/shares', requireAuth, requireUserRole, async (request, response) => {
    const ownerShares = await PortfolioShare.find({
      ownerUserId: request.sessionUser.id,
      status: 'active',
    }).lean()
    const sharedWithMe = await PortfolioShare.find({
      guestUserId: request.sessionUser.id,
      status: 'active',
    }).lean()

    const guestIds = ownerShares.map((share) => share.guestUserId)
    const ownerIds = sharedWithMe.map((share) => share.ownerUserId)
    const relatedUsers = await YieldflowUser.find({ _id: { $in: [...guestIds, ...ownerIds] } }).lean()
    const userLookup = new Map(relatedUsers.map((user) => [String(user._id), normalizeUserDoc(user)]))

    response.json({
      ownerShares: ownerShares.map((share) => {
        const guestUser = userLookup.get(String(share.guestUserId))
        return {
          id: String(share._id),
          ownerUserId: String(share.ownerUserId),
          guestUserId: String(share.guestUserId),
          guestEmail: share.guestEmail,
          guestDisplayName: guestUser?.displayName || share.guestEmail,
          permission: share.permission,
          status: share.status,
        }
      }),
      sharedWithMe: sharedWithMe.map((share) => {
        const ownerUser = userLookup.get(String(share.ownerUserId))
        return {
          id: String(share._id),
          ownerUserId: String(share.ownerUserId),
          ownerDisplayName: ownerUser?.displayName || 'Shared portfolio',
          ownerEmail: ownerUser?.email || '',
          permission: share.permission,
          status: share.status,
        }
      }),
    })
  })

  app.post('/api/shares', writeRateLimiter, requireAuth, requireUserRole, validateRequest(shareCreateBodySchema), async (request, response) => {
    const guestEmail = String(request.body?.guestEmail || '').trim().toLowerCase()
    if (!guestEmail) {
      response.status(400).json({ message: 'Guest email is required' })
      return
    }

    if (guestEmail === request.sessionUser.email) {
      response.status(400).json({ message: 'You cannot share a portfolio with yourself' })
      return
    }

    const guestUser = await YieldflowUser.findOne({ email: guestEmail }).lean()
    if (!guestUser) {
      response.status(404).json({ message: 'That Google user has not signed in to YieldFlow yet' })
      return
    }

    const savedShare = await PortfolioShare.findOneAndUpdate(
      {
        ownerUserId: request.sessionUser.id,
        guestUserId: String(guestUser._id),
      },
      {
        $set: {
          guestEmail,
          permission: 'read',
          status: 'active',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean()

    await writeAdminAuditLog({
      actor: request.sessionUser,
      action: 'share.create',
      targetType: 'portfolioShare',
      targetRecordId: String(savedShare._id),
      targetOwnerUserId: request.sessionUser.id,
      metadata: {
        guestUserId: String(guestUser._id),
        permission: 'read',
        status: 'active',
      },
    })

    response.status(201).json({
      id: String(savedShare._id),
      ownerUserId: String(savedShare.ownerUserId),
      guestUserId: String(savedShare.guestUserId),
      guestEmail: savedShare.guestEmail,
      guestDisplayName: guestUser.displayName || guestEmail,
      permission: savedShare.permission,
      status: savedShare.status,
    })
  })

  app.delete('/api/shares/:id', writeRateLimiter, requireAuth, requireUserRole, validateRequest(idParamSchema, 'params'), async (request, response) => {
    const deleted = await PortfolioShare.findOneAndDelete({
      _id: request.params.id,
      ownerUserId: request.sessionUser.id,
    }).lean()

    if (!deleted) {
      response.status(404).json({ message: 'Share not found' })
      return
    }

    await writeAdminAuditLog({
      actor: request.sessionUser,
      action: 'share.delete',
      targetType: 'portfolioShare',
      targetRecordId: String(deleted._id),
      targetOwnerUserId: request.sessionUser.id,
      metadata: {
        guestUserId: String(deleted.guestUserId),
        permission: deleted.permission,
        status: deleted.status,
      },
    })

    response.json({ ok: true })
  })
}
