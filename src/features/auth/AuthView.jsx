import { useEffect, useRef } from 'react'

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

let googleScriptPromise = null
let initializedGoogleClientId = ''

const loadGoogleScript = () => {
  if (globalThis.google?.accounts?.id) {
    return Promise.resolve()
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`)
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')), {
          once: true,
        })
        return
      }

      const script = document.createElement('script')
      script.src = GOOGLE_SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Google Sign-In'))
      document.head.append(script)
    })
  }

  return googleScriptPromise
}

export default function AuthView({ onAuthenticate, error, isAuthenticating, themeClass }) {
  const buttonRef = useRef(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => {
    let isMounted = true

    if (!googleClientId || !buttonRef.current) {
      return undefined
    }

    loadGoogleScript()
      .then(() => {
        if (!isMounted || !globalThis.google?.accounts?.id || !buttonRef.current) {
          return
        }

        if (initializedGoogleClientId !== googleClientId) {
          globalThis.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: ({ credential }) => {
              if (credential) {
                onAuthenticate(credential)
              }
            },
          })
          initializedGoogleClientId = googleClientId
        }

        buttonRef.current.innerHTML = ''
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
        </article>
      </section>
    </div>
  )
}
