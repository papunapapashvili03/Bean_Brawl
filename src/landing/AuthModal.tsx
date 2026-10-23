import { useEffect, useState, type FormEvent } from 'react'
import {
  CODE_LENGTH,
  RESEND_AFTER,
  checkCode,
  checkEmail,
  checkUsername,
  playAsGuest,
  sendRegisterCode,
  sendSignInCode,
  useAuth,
  verifyCode,
  type CodeFor,
} from './auth'
import { MailIcon } from './icons'
import { Modal } from './Modal'

// Signing in or registering (./auth), with the two as tabs along the top, in two steps: your email (and,
// registering, a username), then the code Supabase emails you. Or straight in as a guest. It closes once
// you're in. Registering while signed in as a guest keeps the guest's account, adding the email to it.

export type AuthTab = 'signin' | 'register'
type Busy = 'send' | 'verify' | 'resend' | 'guest' | null
// Where the code went, and what for
type Sent = { email: string; codeFor: CodeFor }

export function AuthModal({ initialTab, onClose }: { initialTab: AuthTab; onClose: () => void }) {
  const [tab, setTab] = useState<AuthTab>(initialTab)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<Sent | null>(null)
  const [wait, setWait] = useState(0) // seconds until a code can be sent again
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const registering = tab === 'register'
  const guest = useAuth().account?.kind === 'guest'

  useEffect(() => {
    if (wait <= 0) return
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(id)
  }, [wait])

  // Send the code (again, with `again`), and on to entering it
  const send = async (again = false) => {
    const address = (again && sent ? sent.email : email).trim().toLowerCase()
    const problem = (registering ? checkUsername(username.trim()) : null) ?? checkEmail(address)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(again ? 'resend' : 'send')
    setError(null)
    const result = registering ? await sendRegisterCode(username.trim(), address) : { problem: await sendSignInCode(address), codeFor: 'email' as const }
    setBusy(null)
    if (result.problem) {
      setError(result.problem)
      return
    }
    setSent({ email: address, codeFor: result.codeFor })
    setCode('')
    setWait(RESEND_AFTER)
  }

  const verify = async (value = code) => {
    if (!sent) return
    const problem = checkCode(value)
    if (problem) {
      setError(problem)
      return
    }
    setBusy('verify')
    setError(null)
    const failed = await verifyCode(sent.email, value, sent.codeFor)
    if (failed) {
      setBusy(null)
      setError(failed)
    } else onClose()
  }

  const guestIn = async () => {
    setBusy('guest')
    setError(null)
    const problem = await playAsGuest()
    if (problem) {
      setBusy(null)
      setError(problem)
    } else onClose()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (sent) verify()
    else send()
  }

  const switchTo = (next: AuthTab) => {
    setTab(next)
    setSent(null)
    setError(null)
  }

  // Typing the code: digits only, and in as soon as it's all there
  const typeCode = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    setCode(digits)
    if (digits.length === CODE_LENGTH && busy !== 'verify') verify(digits)
  }

  return (
    <Modal onClose={onClose} labelledBy="auth-title" className="auth-modal">
      <h2 id="auth-title" className="sr-only">
        {registering ? 'Register' : 'Sign in'}
      </h2>
      <div className="tabs auth-tabs" role="tablist">
        <button role="tab" aria-selected={!registering} className={`tab${registering ? '' : ' active'}`} onClick={() => switchTo('signin')}>
          Sign in
        </button>
        <button role="tab" aria-selected={registering} className={`tab${registering ? ' active' : ''}`} onClick={() => switchTo('register')}>
          Register
        </button>
      </div>

      {guest && registering && !sent && <p className="auth-note auth-keep">You’re playing as a guest: registering keeps this account and adds your email to it.</p>}

      <form className="auth-form" onSubmit={submit} noValidate>
        {sent ? (
          <>
            <div className="auth-sent">
              <MailIcon size={20} className="auth-sent-icon" />
              <div>
                <div className="auth-sent-title">Check your email</div>
                <div className="auth-sent-text">
                  We sent a {CODE_LENGTH}-digit code to <strong>{sent.email}</strong>. It can take a minute to arrive (check spam too).
                </div>
              </div>
            </div>
            <label className="auth-field">
              <span>Code</span>
              <input
                className="field auth-code"
                value={code}
                onChange={(e) => typeCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={10}
                placeholder={'•'.repeat(CODE_LENGTH)}
                aria-label={`${CODE_LENGTH}-digit code`}
              />
            </label>
          </>
        ) : (
          <>
            {registering && (
              <label className="auth-field">
                <span>Username</span>
                <input
                  className="field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={20}
                  placeholder="Pick a username"
                />
              </label>
            )}
            <label className="auth-field">
              <span>Email</span>
              <input
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="you@example.com"
              />
            </label>
          </>
        )}
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        <button className="auth-submit" type="submit" disabled={!!busy}>
          {sent
            ? busy === 'verify'
              ? 'Checking…'
              : registering
                ? 'Create account'
                : 'Sign in'
            : busy === 'send'
              ? 'Sending code…'
              : 'Send code'}
        </button>
      </form>

      {sent ? (
        <div className="auth-links">
          <button onClick={() => send(true)} disabled={!!busy || wait > 0}>
            {busy === 'resend' ? 'Sending…' : wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
          </button>
          <button
            onClick={() => {
              setSent(null)
              setError(null)
            }}
            disabled={!!busy}
          >
            Use a different email
          </button>
        </div>
      ) : (
        !guest && (
          <>
            <button className="auth-guest" onClick={guestIn} disabled={!!busy}>
              {busy === 'guest' ? 'Joining…' : 'Play as a guest'}
            </button>
            <p className="auth-note">Guests get a temporary name like guest123, and the account ends when they sign out.</p>
          </>
        )
      )}

      <p className="auth-switch">
        {registering ? 'Already have an account? ' : 'New here? '}
        <button onClick={() => switchTo(registering ? 'signin' : 'register')}>{registering ? 'Sign in' : 'Create an account'}</button>
      </p>
    </Modal>
  )
}
