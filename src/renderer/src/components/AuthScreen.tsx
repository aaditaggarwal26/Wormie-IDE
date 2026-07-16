import { useState } from 'react'
import { ArrowRight, BookOpenText, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import type { CloudAuthCredentials } from '@shared/contracts'

type AuthScreenProps = {
  busy: boolean
  confirmationRequired: boolean
  error: string | null
  loading: boolean
  onSubmit: (mode: 'sign-in' | 'sign-up', credentials: CloudAuthCredentials) => void
}

export function AuthScreen({ busy, confirmationRequired, error, loading, onSubmit }: AuthScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return <main className="auth-screen">
    <section className="auth-story" aria-label="About Wormie">
      <div className="auth-brand"><span className="auth-worm"><i /><i /><i /></span><b>Wormie</b></div>
      <div className="auth-story-copy">
        <span className="auth-kicker"><BookOpenText size={14} /> Learn before you code</span>
        <h1>Your classroom lives beside the code.</h1>
        <p>Teach, practice, and build inside one focused workbench. AI helps only after the ideas make sense.</p>
      </div>
      <div className="auth-principles">
        <span><b>01</b> Join the room</span>
        <span><b>02</b> Learn the system</span>
        <span><b>03</b> Ship the work</span>
      </div>
    </section>

    <section className="auth-entry">
      <div className="auth-card">
        <span className="auth-card-index">ACCOUNT / 001</span>
        <h2>{mode === 'sign-in' ? 'Welcome back.' : 'Create your account.'}</h2>
        <p>{mode === 'sign-in' ? 'Sign in to open your classrooms and assignments.' : 'One account can teach in one classroom and learn in another.'}</p>

        {confirmationRequired && <div className="auth-notice" role="status"><Mail size={16} /><span>Check your email to confirm the account, then sign in.</span></div>}
        {error && <div className="auth-error" role="alert">{error}</div>}

        <form onSubmit={(event) => {
          event.preventDefault()
          onSubmit(mode, { email, password })
        }}>
          <label><span>Email</span><div><Mail size={15} /><input autoComplete="email" disabled={busy || loading} maxLength={320} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} /></div></label>
          <label><span>Password</span><div><KeyRound size={15} /><input autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} disabled={busy || loading} maxLength={128} minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required type="password" value={password} /></div></label>
          <button disabled={busy || loading} type="submit">
            <span>{loading ? 'Restoring session...' : busy ? 'Connecting...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</span><ArrowRight size={15} />
          </button>
        </form>

        <button className="auth-mode-switch" disabled={busy || loading} onClick={() => setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in')} type="button">
          {mode === 'sign-in' ? 'New to Wormie? Create an account' : 'Already have an account? Sign in'}
        </button>
        <div className="auth-security"><ShieldCheck size={13} /><span>Your password goes directly to Supabase Auth. Wormie never stores it.</span></div>
      </div>
    </section>
  </main>
}
