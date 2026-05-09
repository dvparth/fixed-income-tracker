import { useEffect, useRef } from 'react'
import { loadGoogleIdentityScript } from './googleIdentity.js'
let initializedGoogleClientId = ''

const getApiUrl = (path) => {
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
  return apiBaseUrl && path.startsWith('/') ? `${apiBaseUrl}${path}` : path
}
const GOOGLE_SIGN_IN_UX_MODE =
  String(import.meta.env.VITE_GOOGLE_SIGN_IN_UX_MODE || '').trim().toLowerCase() === 'redirect'
    ? 'redirect'
    : 'popup'

export default function AuthView({ onAuthenticate, error, isAuthenticating, themeClass }) {
  const buttonRef = useRef(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const appHomeUrl = 'https://getyieldflow.netlify.app'

  useEffect(() => {
    let isMounted = true

    if (!googleClientId || !buttonRef.current) {
      return undefined
    }

    loadGoogleIdentityScript()
      .then(() => {
        if (!isMounted || !globalThis.google?.accounts?.id || !buttonRef.current) {
          return
        }

        const loginUri =
          GOOGLE_SIGN_IN_UX_MODE === 'redirect'
            ? getApiUrl('/api/auth/google/redirect')
            : ''
        const initializationKey = `${googleClientId}:${GOOGLE_SIGN_IN_UX_MODE}:${loginUri}`

        if (initializedGoogleClientId !== initializationKey) {
          globalThis.google.accounts.id.initialize({
            client_id: googleClientId,
            ux_mode: GOOGLE_SIGN_IN_UX_MODE,
            ...(loginUri ? { login_uri: loginUri } : {}),
            callback: ({ credential }) => {
              if (credential) {
                onAuthenticate(credential)
              }
            },
          })
          initializedGoogleClientId = initializationKey
        }

        buttonRef.current.replaceChildren()
        globalThis.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: 280,
          text: 'signin_with',
        })
      })
      .catch((loadError) => {
        console.error(loadError)
      })

    return () => {
      isMounted = false
    }
  }, [googleClientId, onAuthenticate])

  return (
    <div className={`shell ${themeClass}`}>
      <section className="auth-shell">
        <article className="panel auth-card">
          <div className="auth-copy">
            <p className="eyebrow">YieldFlow</p>
            <h1>Secure portfolio access with Google sign-in.</h1>
            <p className="hero-copy">
              Sign in to open your own investments, review portfolios shared with you in read-only
              mode, and unlock Admin export if your account is allowlisted.
            </p>
          </div>

          {!googleClientId ? (
            <div className="status-banner error">
              Missing <code>VITE_GOOGLE_CLIENT_ID</code>. Add it to the frontend environment before
              signing in.
            </div>
          ) : (
            <div className="auth-actions">
              <div ref={buttonRef} />
              {isAuthenticating && <p className="field-help">Signing you in...</p>}
            </div>
          )}

          {error && <div className="status-banner error">{error}</div>}

          <div className="auth-legal-links">
            <a href={`${appHomeUrl}/privacy`}>Privacy</a>
            <span aria-hidden="true">•</span>
            <a href={`${appHomeUrl}/terms`}>Terms</a>
          </div>
        </article>
      </section>
    </div>
  )
}
