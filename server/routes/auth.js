export const registerAuthRoutes = (app, dependencies) => {
  const {
    SESSION_COOKIE_NAME,
    YieldflowSession,
    authRateLimiter,
    authenticateGoogleCredential,
    buildSessionResponse,
    buildSessionTokenHash,
    clearSessionCookie,
    createSession,
    getSafeAuthRedirectUrl,
    googleAuthBodySchema,
    googleRedirectAuthBodySchema,
    parseCookies,
    setSessionCookie,
    validateRequest,
    writeRateLimiter
  } = dependencies

  app.get('/api/auth/session', async (request, response) => {
    if (!request.sessionUser) {
      response.json({ authenticated: false })
      return
    }

    response.json(await buildSessionResponse(request.sessionUser))
  })

  app.post('/api/auth/google', authRateLimiter, validateRequest(googleAuthBodySchema), async (request, response) => {
    const normalizedUser = await authenticateGoogleCredential(request.body?.credential)
    const { token } = await createSession(normalizedUser.id)
    setSessionCookie(response, token)
    response.json(await buildSessionResponse(normalizedUser))
  })

  app.post(
    '/api/auth/google/redirect',
    authRateLimiter,
    validateRequest(googleRedirectAuthBodySchema),
    async (request, response) => {
      const redirectUrl = getSafeAuthRedirectUrl(request)
      const bodyCsrfToken = String(request.body?.g_csrf_token || '').trim()
      const cookieCsrfToken = String(parseCookies(request).g_csrf_token || '').trim()

      if (!bodyCsrfToken || !cookieCsrfToken || bodyCsrfToken !== cookieCsrfToken) {
        response.redirect(303, redirectUrl)
        return
      }

      const normalizedUser = await authenticateGoogleCredential(request.body?.credential)
      const { token } = await createSession(normalizedUser.id)
      setSessionCookie(response, token)
      response.redirect(303, redirectUrl)
    },
  )

  app.post('/api/auth/logout', writeRateLimiter, async (request, response) => {
    const sessionToken = parseCookies(request)[SESSION_COOKIE_NAME]
    if (sessionToken) {
      await YieldflowSession.deleteOne({ tokenHash: buildSessionTokenHash(sessionToken) })
    }

    clearSessionCookie(response)
    response.json({ ok: true })
  })
}
