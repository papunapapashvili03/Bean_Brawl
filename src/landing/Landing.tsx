import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { AuthModal, type AuthTab } from './AuthModal'
import { MODES, type ModeId } from './data'
import { Home } from './Home'
import { HeadsetIcon } from './icons'
import { Navbar } from './Navbar'
import { Settings } from './Settings'
import { WalletModal } from './WalletModal'
import './landing.css'

// The landing page: the navbar over the home page (hero and the two modes), a mode's page (#party-games,
// #shoot-out: your bean and its wardrobe, the maps, and Play) or, from the profile button, the account page
// (#settings). Each is its own hash, so the back button and links work. Sign in and Register open the
// account dialog (./AuthModal) on their tab; the wallet opens a "coming soon" note.

// (A mode's page draws your bean in 3D: loaded when it's first needed, so the home page stays light)
const ModePage = lazy(() => import('./ModePage').then((m) => ({ default: m.ModePage })))

type Page = 'home' | 'settings' | ModeId
type Dialog = { kind: 'auth'; tab: AuthTab } | { kind: 'wallet' } | null
function pageFromHash(): Page {
  const hash = window.location.hash.slice(1)
  if (hash === 'settings') return 'settings'
  return MODES.some((m) => m.id === hash) ? (hash as ModeId) : 'home'
}

export function Landing() {
  const [page, setPage] = useState<Page>(pageFromHash)
  const [dialog, setDialog] = useState<Dialog>(null)
  const { ready, account } = useAuth()
  const closeDialog = useCallback(() => setDialog(null), [])
  const signIn = useCallback(() => setDialog({ kind: 'auth', tab: 'signin' }), [])
  const register = () => setDialog({ kind: 'auth', tab: 'register' })

  useEffect(() => {
    const onPop = () => setPage(pageFromHash())
    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onPop)
    }
  }, [])

  const go = (next: Page) => {
    if (next === page) return
    window.history.pushState(null, '', next === 'home' ? window.location.pathname : `#${next}`)
    setPage(next)
    window.scrollTo(0, 0)
  }

  const home = () => {
    go('home')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const mode = page === 'home' || page === 'settings' ? null : page
  return (
    <div className="landing">
      <Navbar
        mode={mode}
        account={account}
        ready={ready}
        onHome={home}
        onMode={go}
        onSignIn={signIn}
        onRegister={register}
        onWallet={() => setDialog({ kind: 'wallet' })}
        onProfile={() => go('settings')}
      />
      {page === 'home' && <Home onMode={go} />}
      {page === 'settings' && <Settings account={account} ready={ready} onSignIn={signIn} onRegister={register} />}
      {mode && (
        <Suspense fallback={<div className="mode-loading" aria-busy="true" />}>
          <ModePage key={mode} mode={mode} account={account} ready={ready} onSignIn={signIn} />
        </Suspense>
      )}
      <button className="support" aria-label="Support">
        <HeadsetIcon size={18} />
      </button>
      {dialog?.kind === 'auth' && <AuthModal key={dialog.tab} initialTab={dialog.tab} onClose={closeDialog} />}
      {dialog?.kind === 'wallet' && <WalletModal onClose={closeDialog} />}
    </div>
  )
}
