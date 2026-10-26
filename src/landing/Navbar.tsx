import type { ComponentType } from 'react'
import type { Account } from './auth'
import { Avatar } from './Avatar'
import { MODES, type ModeId } from './data'
import { ChevronDownIcon, CrosshairIcon, FlagIcon, SolanaIcon, WalletIcon } from './icons'
import { shortAddress, sol, useMoney } from './money'

// The bar along the top: the logo (home), the two modes (each opens its page), and on the right either Sign
// in and Register or, signed in, your balance (in SOL, on the site: ./money), your wallet (the linked one's
// address, or Connect Wallet) and your profile (which opens the account page). The balance and the wallet
// both open the wallet dialog. Nothing shows there until the saved session has been checked, so it doesn't
// flicker.

const MODE_ICONS: Record<ModeId, ComponentType<{ size?: number }>> = {
  'party-games': FlagIcon,
  'shoot-out': CrosshairIcon,
}

type Props = {
  mode: ModeId | null // the mode whose page is open
  account: Account | null
  ready: boolean
  onHome: () => void
  onMode: (mode: ModeId) => void
  onSignIn: () => void
  onRegister: () => void
  onWallet: () => void
  onProfile: () => void
}

export function Navbar({ mode, account, ready, onHome, onMode, onSignIn, onRegister, onWallet, onProfile }: Props) {
  const money = useMoney()
  return (
    <header className="nav">
      <button className="nav-logo" onClick={onHome}>
        Fallguy
      </button>
      <nav className="nav-links">
        {MODES.map((m) => {
          const Icon = MODE_ICONS[m.id]
          return (
            <button key={m.id} className={`nav-link${mode === m.id ? ' active' : ''}`} onClick={() => onMode(m.id)}>
              <Icon size={17} />
              {m.title}
            </button>
          )
        })}
      </nav>
      {ready && !account && (
        <div className="nav-right">
          <button className="nav-signin" onClick={onSignIn}>
            Sign in
          </button>
          <button className="nav-register" onClick={onRegister}>
            Register
          </button>
        </div>
      )}
      {ready && account && (
        <div className="nav-right">
          <button className="nav-balance" onClick={onWallet} aria-label={money.me ? `Balance: ${sol(money.me.balance)} SOL` : 'Balance'}>
            <SolanaIcon size={18} />
            {money.me ? sol(money.me.balance) : '—'}
            {money.config && money.config.network !== 'mainnet-beta' && <span className="nav-devnet">devnet</span>}
            <ChevronDownIcon size={16} className="nav-chevron" />
          </button>
          <button className="nav-wallet" onClick={onWallet}>
            <WalletIcon size={18} />
            <span>{money.me?.wallet ? shortAddress(money.me.wallet) : 'Connect Wallet'}</span>
          </button>
          <button className="nav-profile" onClick={onProfile} aria-label={`Account settings for ${account.name}`}>
            <Avatar account={account} />
          </button>
        </div>
      )}
    </header>
  )
}
