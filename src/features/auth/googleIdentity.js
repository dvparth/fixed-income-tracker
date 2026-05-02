const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

let googleScriptPromise = null

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

export const requestGoogleAccessToken = async ({
  clientId,
  scope,
  prompt = 'consent',
}) => {
  if (!clientId) {
    throw new Error('Google Drive save is unavailable because the Google client ID is missing.')
  }

  await loadGoogleIdentityScript()

  if (!globalThis.google?.accounts?.oauth2) {
    throw new Error('Google authorization is not available right now.')
  }

  return new Promise((resolve, reject) => {
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

        resolve(response.access_token)
      },
    })

    tokenClient.requestAccessToken({ prompt })
  })
}
