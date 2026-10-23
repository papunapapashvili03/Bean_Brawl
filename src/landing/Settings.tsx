import { useState, type FormEvent } from 'react'
import { NAME_MAX, changeName, checkName, signOut, type Account, type AccountKind } from './auth'
import { Avatar } from './Avatar'
import { CogIcon, LogoutIcon, ShieldIcon } from './icons'

// The account page (from the profile button): who you're signed in as (./auth): your profile (and changing
// the name you go by), the account's details (your email, how you sign in, its ID, when it was made and last
// used), security, and signing out here or everywhere. Signed out, it offers Sign in and Register. Two-factor
// sign-in, Affiliates and Transactions are still to come.

type Tab = 'account' | 'affiliates' | 'transactions'
const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'affiliates', label: 'Affiliates' },
  { id: 'transactions', label: 'Transactions' },
]

const METHOD: Record<AccountKind, string> = { email: 'Email code', guest: 'Guest (temporary)' }
const BADGE: Record<AccountKind, string> = { email: 'Player', guest: 'Guest' }

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const moment = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

type Handlers = { onSignIn: () => void; onRegister: () => void }

function SignedOut({ onSignIn, onRegister }: Handlers) {
  return (
    <>
      <div className="section-label">Profile</div>
      <div className="panel">
        <div className="row">
          <div className="row-title">You’re not signed in.</div>
          <div className="row-buttons">
            <button className="btn" onClick={onSignIn}>
              Sign in
            </button>
            <button className="btn btn-accent" onClick={onRegister}>
              Register
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="detail">
      <span className="detail-label">{label}</span>
      <span className={`detail-value${mono ? ' mono' : ''}${value ? '' : ' none'}`}>{value ?? '—'}</span>
    </div>
  )
}

type FieldSpec = { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; maxLength?: number }

// A small form in a row: a field (or two), Save and Cancel, and what went wrong
function InlineForm({ fields, saving, error, onSave, onCancel }: { fields: FieldSpec[]; saving: boolean; error: string | null; onSave: () => void; onCancel: () => void }) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave()
  }
  return (
    <form className="inline-form" onSubmit={submit} noValidate>
      {fields.map((f, i) => (
        <input
          key={f.label}
          className="field field-edit"
          aria-label={f.label}
          placeholder={f.label}
          type={f.type ?? 'text'}
          value={f.value}
          autoComplete={f.autoComplete}
          maxLength={f.maxLength}
          autoFocus={i === 0}
          onChange={(e) => f.onChange(e.target.value)}
        />
      ))}
      <div className="row-buttons">
        <button className="btn btn-accent" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
    </form>
  )
}

// Changing something about the account: open, saving, done (or what went wrong)
function useEditor(save: () => Promise<string | null>, check: () => string | null) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  return {
    open,
    saving,
    error,
    done,
    start: () => {
      setOpen(true)
      setError(null)
      setDone(false)
    },
    cancel: () => setOpen(false),
    save: async () => {
      const problem = check()
      if (problem) {
        setError(problem)
        return
      }
      setSaving(true)
      setError(null)
      const failed = await save()
      setSaving(false)
      setError(failed)
      if (!failed) {
        setOpen(false)
        setDone(true)
      }
    },
  }
}

function SignedIn({ account, onRegister }: { account: Account; onRegister: () => void }) {
  const [leaving, setLeaving] = useState<'local' | 'global' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(account.name)
  const guest = account.kind === 'guest'
  const nameEditor = useEditor(
    () => changeName(name),
    () => checkName(name),
  )
  const leave = async (scope: 'local' | 'global') => {
    setLeaving(scope)
    setError(null)
    const problem = await signOut(scope)
    setLeaving(null)
    setError(problem)
  }

  return (
    <>
      <div className="section-label">Profile</div>
      <div className="panel">
        <div className="row">
          <div className="row-title">
            <Avatar account={account} large />
            <div className="profile-name">
              {account.name}
              <span className={`badge badge-${account.kind}`}>{BADGE[account.kind]}</span>
              {nameEditor.done && <span className="row-saved">Saved</span>}
            </div>
          </div>
          {!nameEditor.open && (
            <button
              className="btn"
              onClick={() => {
                setName(account.name)
                nameEditor.start()
              }}
            >
              Edit Profile
            </button>
          )}
        </div>
        {nameEditor.open && (
          <div className="row row-stack">
            <div className="row-title">Display name</div>
            <InlineForm
              fields={[{ label: 'Display name', value: name, onChange: setName, maxLength: NAME_MAX, autoComplete: 'nickname' }]}
              saving={nameEditor.saving}
              error={nameEditor.error}
              onSave={nameEditor.save}
              onCancel={nameEditor.cancel}
            />
          </div>
        )}
        {guest && (
          <div className="row row-dark">
            <div className="row-note">This is a temporary guest account: it ends when you sign out. Register to keep a name of your own.</div>
            <button className="btn btn-accent" onClick={onRegister}>
              Register
            </button>
          </div>
        )}
      </div>

      <div className="section-label">Details</div>
      <div className="panel details">
        <Detail label="Display name" value={account.name} />
        <Detail label="Username" value={account.username} />
        <Detail label="Email" value={account.email} />
        <Detail label="Sign-in method" value={METHOD[account.kind]} />
        <Detail label="User ID" value={account.id} mono />
        <Detail label="Joined" value={day(account.createdAt)} />
        <Detail label="Last signed in" value={account.lastSignInAt && moment(account.lastSignInAt)} />
      </div>

      <div className="section-label">Security</div>
      <div className="panel">
        {!guest && (
          <div className="row">
            <div className="row-title">
              <ShieldIcon size={18} className="row-icon" />
              Two Factor Authentication
            </div>
            <button className="btn" disabled>
              Coming soon
            </button>
          </div>
        )}
        <div className="row row-dark">
          <div className="row-title">
            <LogoutIcon size={20} className="row-icon" />
            Logout
          </div>
          <div className="row-buttons">
            <button className="btn" onClick={() => leave('local')} disabled={!!leaving}>
              {leaving === 'local' ? 'Signing out…' : 'This Device'}
            </button>
            <button className="btn" onClick={() => leave('global')} disabled={!!leaving}>
              {leaving === 'global' ? 'Signing out…' : 'All Devices'}
            </button>
          </div>
        </div>
        {error && (
          <div className="row auth-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </>
  )
}

const Empty = ({ text }: { text: string }) => (
  <div className="panel panel-empty">
    <div className="row">{text}</div>
  </div>
)

export function Settings({ account, ready, onSignIn, onRegister }: Handlers & { account: Account | null; ready: boolean }) {
  const [tab, setTab] = useState<Tab>('account')
  return (
    <main className="settings">
      <div className="settings-column">
        <h1 className="settings-title">
          <CogIcon size={22} />
          Settings
        </h1>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'account' && ready && (account ? <SignedIn account={account} onRegister={onRegister} /> : <SignedOut onSignIn={onSignIn} onRegister={onRegister} />)}
        {tab === 'affiliates' && <Empty text="No affiliates yet." />}
        {tab === 'transactions' && <Empty text="No transactions yet." />}
      </div>
    </main>
  )
}
