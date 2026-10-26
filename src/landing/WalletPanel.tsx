import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Buffer } from 'buffer'
import bs58 from 'bs58'
import { WalletReadyState } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, clusterApiUrl } from '@solana/web3.js'
import {
  LAMPORTS,
  claimDeposit,
  pendingDeposits,
  depositMemo,
  devCredit,
  explorer,
  linkMessage,
  linkWallet,
  loadMoney,
  shortAddress,
  sol,
  useMoney,
  withdraw,
  type Line,
  type Me,
  type MoneyConfig,
} from './money'

// The wallet dialog's insides (./WalletModal loads this when it's first opened: the Solana libraries are
// big). Your balance on the site; your Solana wallet (Phantom, Solflare, Backpack...: whichever are installed),
// connected here and linked to your account by signing a message, so withdrawals know where to go; putting SOL
// in (your wallet sends it to the site's, with a memo saying it's yours, and the game server counts it once
// it's confirmed on the chain); taking it out; and what's come in and gone out.

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const QUICK = [0.05, 0.1, 0.5]
type Tab = 'deposit' | 'withdraw' | 'history'

export default function WalletPanel({ onSignIn, onRegister }: { onSignIn: () => void; onRegister: () => void }) {
  const { config } = useMoney()
  const network = config?.network ?? 'devnet'
  const endpoint = useMemo(() => clusterApiUrl(network), [network])
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <Panel onSignIn={onSignIn} onRegister={onRegister} />
      </WalletProvider>
    </ConnectionProvider>
  )
}

function Panel({ onSignIn, onRegister }: { onSignIn: () => void; onRegister: () => void }) {
  const { status, config, me, problem } = useMoney()
  const [tab, setTab] = useState<Tab>('deposit')

  return (
    <div className="wallet-panel">
      <div className="wallet-head">
        <h2 id="wallet-title" className="wallet-title">
          Wallet
        </h2>
        {config && config.network !== 'mainnet-beta' && <span className="wallet-net">Devnet · test SOL</span>}
      </div>
      {status === 'loading' && <p className="wallet-note">Loading…</p>}
      {status === 'signed-out' && (
        <>
          <p className="wallet-note">Sign in to keep a SOL balance and play shows for stakes.</p>
          <button className="auth-submit" onClick={onSignIn}>
            Sign in
          </button>
        </>
      )}
      {status === 'guest' && (
        <>
          <p className="wallet-note">Guest accounts can’t hold SOL (they end when you sign out). Register to keep a balance: your guest account carries over.</p>
          <button className="auth-submit" onClick={onRegister}>
            Register
          </button>
        </>
      )}
      {status === 'off' && <p className="wallet-note">Playing for SOL isn’t switched on yet. Free shows are open to everyone.</p>}
      {status === 'failed' && (
        <>
          <p className="wallet-note">{problem}</p>
          <button className="auth-submit" onClick={() => void loadMoney()}>
            Try again
          </button>
        </>
      )}
      {status === 'ready' && config && me && (
        <>
          <div className="wallet-balance">
            <span className="wallet-balance-label">Balance</span>
            <span className="wallet-balance-value">
              {sol(me.balance, 4)} <small>SOL</small>
            </span>
          </div>
          <WalletRow config={config} me={me} />
          <div className="tabs wallet-tabs" role="tablist">
            {(['deposit', 'withdraw', 'history'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t === 'deposit' ? 'Deposit' : t === 'withdraw' ? 'Withdraw' : 'History'}
              </button>
            ))}
          </div>
          {tab === 'deposit' && <Deposit config={config} me={me} />}
          {tab === 'withdraw' && <Withdraw config={config} me={me} />}
          {tab === 'history' && <History lines={me.history} network={config.network} />}
          {config.network !== 'mainnet-beta' && (
            <p className="wallet-fine">
              Devnet: nothing here is real money. Switch your wallet to Devnet, and get free test SOL at{' '}
              <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">
                faucet.solana.com
              </a>
              .
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The wallet: connecting one, and linking it to the account

function WalletRow({ me }: { config: MoneyConfig; me: Me }) {
  const { wallets, wallet, publicKey, connected, connecting, select, connect, disconnect, signMessage } = useWallet()
  const [want, setWant] = useState(false) // a wallet's been picked: connect to it
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const address = publicKey?.toBase58() ?? null
  const linked = me.wallet

  useEffect(() => {
    if (!want || !wallet || connected || connecting) return
    connect()
      .catch((e: Error) => setError(e.message || 'The wallet didn’t connect.'))
      .finally(() => setWant(false))
  }, [want, wallet, connected, connecting, connect])

  const link = async () => {
    if (!address || !signMessage) {
      setError('This wallet can’t sign messages.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const message = linkMessage(me.user, new Date().toISOString())
      const signature = await signMessage(new TextEncoder().encode(message))
      await linkWallet(address, bs58.encode(signature), message)
    } catch (e) {
      setError((e as Error).message || 'Not linked.')
    } finally {
      setBusy(false)
    }
  }

  const usable = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable)
  if (!connected) {
    const here = encodeURIComponent(window.location.href)
    const origin = encodeURIComponent(window.location.origin)
    return (
      <div className="wallet-section">
        <div className="wallet-section-title">{linked ? `Linked wallet: ${shortAddress(linked)}` : 'Connect a Solana wallet'}</div>
        {usable.length ? (
          <div className="wallet-choices">
            {usable.map((w) => (
              <button
                key={w.adapter.name}
                className="wallet-choice"
                disabled={connecting}
                onClick={() => {
                  setError(null)
                  select(w.adapter.name)
                  setWant(true)
                }}
              >
                <img src={w.adapter.icon} alt="" width={24} height={24} />
                {w.adapter.name}
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="wallet-note">No Solana wallet found in this browser. Install one, or on a phone, open this page in your wallet app:</p>
            <div className="wallet-choices">
              <a className="wallet-choice" href={`https://phantom.app/ul/browse/${here}?ref=${origin}`}>
                Open in Phantom
              </a>
              <a className="wallet-choice" href={`https://solflare.com/ul/v1/browse/${here}?ref=${origin}`}>
                Open in Solflare
              </a>
              <a className="wallet-choice" href="https://phantom.com/download" target="_blank" rel="noreferrer">
                Get Phantom
              </a>
            </div>
          </>
        )}
        {error && <div className="auth-error">{error}</div>}
      </div>
    )
  }
  return (
    <div className="wallet-section">
      <div className="wallet-connected">
        {wallet && <img src={wallet.adapter.icon} alt="" width={22} height={22} />}
        <span className="wallet-address">{address && shortAddress(address)}</span>
        {address === linked ? <span className="wallet-chip">Linked</span> : null}
        <button className="wallet-link-button" onClick={() => void disconnect()}>
          Disconnect
        </button>
      </div>
      {address !== linked && (
        <>
          <p className="wallet-note">
            {linked ? `Your account’s linked to ${shortAddress(linked)}. ` : ''}Link this wallet to take SOL out to it: your wallet asks you to sign a message (free, nothing’s sent).
          </p>
          <button className="auth-submit" onClick={link} disabled={busy}>
            {busy ? 'Waiting for your wallet…' : linked ? 'Link this wallet instead' : 'Link this wallet'}
          </button>
        </>
      )}
      {error && <div className="auth-error">{error}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// In and out

const parseSol = (text: string) => {
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * LAMPORTS) : 0
}

function Deposit({ config, me }: { config: MoneyConfig; me: Me }) {
  const { connection } = useConnection()
  const { publicKey, connected, sendTransaction } = useWallet()
  const [amount, setAmount] = useState('0.1')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(() => pendingDeposits())

  // Deposits sent but not counted yet (it took too long, or the page was closed): tried again
  const checkAgain = async (tries = 0) => {
    for (const signature of pendingDeposits()) {
      try {
        const added = await claimDeposit(signature, tries)
        setDone(`Added ${sol(added, 4)} SOL to your balance.`)
      } catch {
        // (still not confirmed: left for next time)
      }
    }
    setWaiting(pendingDeposits())
  }
  useEffect(() => {
    // (Once, as the wallet opens)
    if (!pendingDeposits().length) return
    const t = window.setTimeout(() => void checkAgain())
    return () => window.clearTimeout(t)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const lamports = parseSol(amount)
    if (lamports < config.minDeposit) {
      setError(`Deposit at least ${sol(config.minDeposit)} SOL.`)
      return
    }
    if (!publicKey || !config.house) return
    setError(null)
    setDone(null)
    try {
      setBusy('Approve it in your wallet…')
      const tx = new Transaction()
        .add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(config.house), lamports }))
        .add(new TransactionInstruction({ keys: [], programId: MEMO_PROGRAM, data: Buffer.from(depositMemo(me.user)) }))
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey
      const signature = await sendTransaction(tx, connection)
      setBusy('Confirming on the chain…')
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
      setBusy('Adding it to your balance…')
      const added = await claimDeposit(signature)
      setDone(`Added ${sol(added, 4)} SOL to your balance.`)
    } catch (e) {
      setError((e as Error).message || 'The deposit didn’t go through.')
    } finally {
      setBusy(null)
      setWaiting(pendingDeposits())
    }
  }

  return (
    <form className="wallet-form" onSubmit={submit} noValidate>
      <AmountField value={amount} onChange={setAmount} quick={QUICK} />
      <button className="auth-submit" type="submit" disabled={!connected || !!busy}>
        {busy ?? (connected ? `Deposit ${amount || 0} SOL` : 'Connect a wallet to deposit')}
      </button>
      {config.dev && (
        <button type="button" className="wallet-link-button" onClick={() => void devCredit(0.5 * LAMPORTS).catch((e: Error) => setError(e.message))}>
          Add 0.5 test SOL (try-it-out server)
        </button>
      )}
      {waiting.length > 0 && !busy && (
        <div className="auth-error">
          {waiting.length === 1 ? 'A deposit you sent hasn’t been counted yet' : `${waiting.length} deposits you sent haven’t been counted yet`} (the chain can be slow).{' '}
          <button type="button" className="wallet-link-button" onClick={() => void checkAgain(3)}>
            Check again
          </button>
        </div>
      )}
      {error && <div className="auth-error">{error}</div>}
      {done && <div className="wallet-done">{done}</div>}
    </form>
  )
}

function Withdraw({ config, me }: { config: MoneyConfig; me: Me }) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const lamports = parseSol(amount)
    if (lamports < config.minWithdraw) {
      setError(`Withdraw at least ${sol(config.minWithdraw)} SOL.`)
      return
    }
    if (lamports > me.balance) {
      setError('That’s more than your balance.')
      return
    }
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const signature = await withdraw(lamports)
      setDone(signature)
      setAmount('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!me.wallet) return <p className="wallet-note">Link a wallet first (above): that’s where withdrawals go.</p>
  return (
    <form className="wallet-form" onSubmit={submit} noValidate>
      <p className="wallet-note">To your linked wallet, {shortAddress(me.wallet)}.</p>
      <AmountField value={amount} onChange={setAmount} quick={[]} max={me.balance} />
      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? 'Sending…' : `Withdraw ${amount || 0} SOL`}
      </button>
      {error && <div className="auth-error">{error}</div>}
      {done && (
        <div className="wallet-done">
          Sent.{' '}
          <a href={explorer(done, config.network)} target="_blank" rel="noreferrer">
            See it on the explorer
          </a>
        </div>
      )}
    </form>
  )
}

function AmountField({ value, onChange, quick, max }: { value: string; onChange: (v: string) => void; quick: number[]; max?: number }) {
  return (
    <div className="wallet-amount">
      <label className="auth-field">
        <span>Amount (SOL)</span>
        <input className="field field-edit" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.10" />
      </label>
      <div className="wallet-quick">
        {quick.map((q) => (
          <button key={q} type="button" onClick={() => onChange(String(q))}>
            {q}
          </button>
        ))}
        {max !== undefined && (
          <button type="button" onClick={() => onChange(sol(max, 4))}>
            Max
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------

const KIND: Record<Line['kind'], string> = { deposit: 'Deposit', withdrawal: 'Withdrawal', stake: 'Stake', winnings: 'Winnings', refund: 'Refund' }

function History({ lines, network }: { lines: Line[]; network: string }) {
  if (!lines.length) return <p className="wallet-note">Nothing yet.</p>
  return (
    <ul className="wallet-history">
      {lines.map((l, i) => (
        <li key={`${l.kind}-${l.ref}-${i}`}>
          <span className="wallet-history-kind">{KIND[l.kind]}</span>
          <span className={`wallet-history-amount${l.lamports > 0 ? ' in' : ''}`}>
            {l.lamports > 0 ? '+' : ''}
            {sol(l.lamports, 4)}
          </span>
          <span className="wallet-history-when">
            {l.signature ? (
              <a href={explorer(l.signature, network)} target="_blank" rel="noreferrer">
                {l.created_at ? new Date(l.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'tx'}
              </a>
            ) : l.created_at ? (
              new Date(l.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
            ) : (
              ''
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
