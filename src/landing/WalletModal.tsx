import { Suspense, lazy } from 'react'
import { Modal } from './Modal'

// The wallet dialog (the balance and Connect Wallet buttons): your SOL on the site, and your Solana wallet.
// Its insides (./WalletPanel) come with the Solana libraries, so they're loaded the first time it's opened.

const WalletPanel = lazy(() => import('./WalletPanel'))

export function WalletModal({ onClose, onSignIn, onRegister }: { onClose: () => void; onSignIn: () => void; onRegister: () => void }) {
  return (
    <Modal onClose={onClose} labelledBy="wallet-title" className="wallet-modal">
      <Suspense fallback={<p className="wallet-note">Loading the wallet…</p>}>
        <WalletPanel
          onSignIn={() => {
            onClose()
            onSignIn()
          }}
          onRegister={() => {
            onClose()
            onRegister()
          }}
        />
      </Suspense>
    </Modal>
  )
}
