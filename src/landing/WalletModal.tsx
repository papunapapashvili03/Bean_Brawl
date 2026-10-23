import { WalletIcon } from './icons'
import { Modal } from './Modal'

// What the wallet button shows for now

export function WalletModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} labelledBy="wallet-title" className="notice-modal">
      <div className="notice-icon">
        <WalletIcon size={26} />
      </div>
      <h2 id="wallet-title" className="notice-title">
        Coming soon!
      </h2>
      <p className="notice-text">
        We are testing game engagement. Thanks for your support <span className="notice-heart">❤︎</span>
      </p>
      <button className="auth-submit" onClick={onClose}>
        Got it
      </button>
    </Modal>
  )
}
