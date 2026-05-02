const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const GOOGLE_TOKEN_STORAGE_PREFIX = 'yieldflow.google-token'

let googleScriptPromise = null
const googleTokenCache = new Map()

export const loadGoogleIdentityScript = () => {
  if (globalThis.google?.accounts?.id && globalThis.google?.accounts?.oauth2) {
    return Promise.resolve()
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`)
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('Failed to load Google services')), {
          once: true,
        })
        return
      }

      const script = document.createElement('script')
      script.src = GOOGLE_SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Google services'))
      document.head.append(script)
    })
  }

  return googleScriptPromise
}

const buildTokenCacheKey = (clientId, scope) => `${String(clientId || '').trim()}::${String(scope || '').trim()}`

const readStoredToken = (cacheKey) => {
  try {
    const rawValue = globalThis.sessionStorage?.getItem(
      `${GOOGLE_TOKEN_STORAGE_PREFIX}:${cacheKey}`,
    )
    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue)
    if (!parsed?.accessToken || !Number.isFinite(parsed?.expiresAt)) {
      globalThis.sessionStorage?.removeItem(`${GOOGLE_TOKEN_STORAGE_PREFIX}:${cacheKey}`)
      return null
    }

    return parsed
  } catch {
    return null
  }
}

const storeToken = (cacheKey, tokenEntry) => {
  try {
    globalThis.sessionStorage?.setItem(
      `${GOOGLE_TOKEN_STORAGE_PREFIX}:${cacheKey}`,
      JSON.stringify(tokenEntry),
    )
  } catch {
    // Ignore storage issues and keep the in-memory cache path working.
  }
}

const clearStoredToken = (cacheKey) => {
  try {
    globalThis.sessionStorage?.removeItem(`${GOOGLE_TOKEN_STORAGE_PREFIX}:${cacheKey}`)
  } catch {
    // Ignore storage issues.
  }
}

const getCachedAccessToken = (cacheKey) => {
  const cached = googleTokenCache.get(cacheKey) || readStoredToken(cacheKey)
  if (!cached?.accessToken || !Number.isFinite(cached.expiresAt)) {
    googleTokenCache.delete(cacheKey)
    clearStoredToken(cacheKey)
    return ''
  }

  if (Date.now() >= cached.expiresAt) {
    googleTokenCache.delete(cacheKey)
    clearStoredToken(cacheKey)
    return ''
  }

  googleTokenCache.set(cacheKey, cached)
  return cached.accessToken
}

const requestGoogleAccessTokenOnce = ({ clientId, scope, prompt, cacheKey, loginHint = '' }) =>
  new Promise((resolve, reject) => {
    const tokenClient = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (response?.error) {
          reject(new Error(response.error_description || response.error || 'Google authorization failed.'))
          return
        }

        if (!response?.access_token) {
          reject(new Error('Google did not return an access token.'))
          return
        }

        const expiresInSeconds = Number(response.expires_in || 0)
        const expiresAt =
          expiresInSeconds > 0 ? Date.now() + Math.max(expiresInSeconds - 60, 0) * 1000 : Date.now()

        const tokenEntry = {
          accessToken: response.access_token,
          expiresAt,
        }

        googleTokenCache.set(cacheKey, tokenEntry)
        storeToken(cacheKey, tokenEntry)

        resolve(response.access_token)
      },
    })

    tokenClient.requestAccessToken({
      prompt,
      hint: loginHint || undefined,
      login_hint: loginHint || undefined,
    })
  })

export const requestGoogleAccessToken = async ({
  clientId,
  scope,
  prompt = '',
  loginHint = '',
}) => {
  if (!clientId) {
    throw new Error('Google Drive save is unavailable because the Google client ID is missing.')
  }

  await loadGoogleIdentityScript()

  if (!globalThis.google?.accounts?.oauth2) {
    throw new Error('Google authorization is not available right now.')
  }

  const cacheKey = buildTokenCacheKey(clientId, scope)
  const cachedAccessToken = getCachedAccessToken(cacheKey)
  if (cachedAccessToken) {
    return cachedAccessToken
  }

  try {
    return await requestGoogleAccessTokenOnce({
      clientId,
      scope,
      prompt,
      cacheKey,
      loginHint,
    })
  } catch (error) {
    const normalizedMessage = String(error?.message || '').toLowerCase()
    const shouldRetryWithConsent =
      prompt !== 'consent' &&
      (normalizedMessage.includes('consent') ||
        normalizedMessage.includes('interaction_required') ||
        normalizedMessage.includes('login_required'))

    if (!shouldRetryWithConsent) {
      throw error
    }

    return requestGoogleAccessTokenOnce({
      clientId,
      scope,
      prompt: 'consent',
      cacheKey,
      loginHint,
    })
  }
}
