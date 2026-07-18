import { useState } from 'react'
import { ArrowRight, KeyRound, Mail } from 'lucide-react'
import type { CloudAuthCredentials } from '@shared/contracts'

type AuthScreenProps = {
  busy: boolean
  confirmationRequired: boolean
  error: string | null
  googleBusy: boolean
  loading: boolean
  passwordResetRequired: boolean
  resetEmailSent: boolean
  onGoogleSignIn: () => void
  onRequestPasswordReset: (email: string) => void
  onSubmit: (mode: 'sign-in' | 'sign-up', credentials: CloudAuthCredentials) => void
  onUpdatePassword: (password: string) => void
}

function GoogleMark(): React.JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 18 18">
    <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.878 2.684-6.614Z" fill="#4285f4" />
    <path d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.91-2.258c-.805.54-1.835.859-3.046.859-2.344 0-4.328-1.585-5.036-3.714H.957v2.332A9 9 0 0 0 9 18Z" fill="#34a853" />
    <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.282-1.706V4.962H.957A9 9 0 0 0 0 9c0 1.452.347 2.827.957 4.038l3.007-2.332Z" fill="#fbbc05" />
    <path d="M9 3.58c1.322 0 2.508.454 3.441 1.346l2.582-2.582C13.463.892 11.425 0 9 0A9 9 0 0 0 .957 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z" fill="#ea4335" />
  </svg>
}

export function AuthScreen({ busy, confirmationRequired, error, googleBusy, loading, onGoogleSignIn, onRequestPasswordReset, onSubmit, onUpdatePassword, passwordResetRequired, resetEmailSent }: AuthScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return <main className="auth-screen">
    <section className="auth-entry">
      <div className="auth-card">
        <div className="auth-brand"><span className="auth-worm"><i /><i /><i /></span><b>Wormie</b></div>
        <h2>{passwordResetRequired ? 'Set a new password' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</h2>

        {confirmationRequired && <div className="auth-notice" role="status"><Mail size={16} /><span>If this is a new account, check your email to confirm it. Otherwise, sign in.</span></div>}
        {resetEmailSent && <div className="auth-notice" role="status"><Mail size={16} /><span>Check your email for a password reset link.</span></div>}
        {error && <div className="auth-error" role="alert">{error}</div>}

        {!passwordResetRequired && <>
          <button className="auth-google" disabled={busy || loading} onClick={onGoogleSignIn} type="button">
            <GoogleMark />
            <span>{googleBusy ? 'Opening browser...' : 'Continue with Google'}</span>
          </button>
          <div className="auth-divider"><span>or</span></div>
        </>}

        <form onSubmit={(event) => {
          event.preventDefault()
          if (passwordResetRequired) onUpdatePassword(password)
          else onSubmit(mode, { email, password })
        }}>
          {!passwordResetRequired && <label><span>Email</span><div><Mail size={15} /><input autoComplete="email" disabled={busy || loading} maxLength={320} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} /></div></label>}
          <label><span>{passwordResetRequired ? 'New password' : 'Password'}</span><div><KeyRound size={15} /><input autoComplete={mode === 'sign-in' && !passwordResetRequired ? 'current-password' : 'new-password'} disabled={busy || loading} maxLength={128} minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required type="password" value={password} /></div></label>
          <button disabled={busy || loading} type="submit">
            <span>{loading ? 'Restoring session...' : busy ? 'Connecting...' : passwordResetRequired ? 'Update password' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</span><ArrowRight size={15} />
          </button>
        </form>

        {!passwordResetRequired && <>
          {mode === 'sign-in' && <button className="auth-mode-switch" disabled={busy || loading} onClick={() => onRequestPasswordReset(email)} type="button">Forgot password?</button>}
          <button className="auth-mode-switch" disabled={busy || loading} onClick={() => setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in')} type="button">
            {mode === 'sign-in' ? 'New to Wormie? Create an account' : 'Already have an account? Sign in'}
          </button>
        </>}
      </div>
    </section>
  </main>
}
