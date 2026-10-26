import { useSyncExternalStore } from 'react'
import { serverUrl } from '../game/net/client'
import { supabase } from './supabase'

// Your SOL on the site, from the game server (server/wallet.mjs): its settings (which network, the site's
// wallet that deposits go to, the stake tiers), your balance, the wallet you've linked, and what's come in and
// gone out. Kept for the page, and read again as you sign in or out and after each change. Plain requests
// only: the wallet itself (connecting, signing, sending) is ./WalletPanel's, loaded when it's opened.

export const LAMPORTS = 1_000_000_000

export type MoneyConfig = {
  on: boolean // the server has money switched on
  network: 'devnet' | 'mainnet-beta'
  house: string | null // the site's wallet
  tiers: number[] // the stakes a show can be played for (lamports; the first, 0, is free)
  fee: number // the site's share of a pot
  minDeposit: number
  minWithdraw: number
  dev: boolean // the server's in its try-it-out mode (balances in memory)
}
export type Line = { kind: 'deposit' | 'withdrawal' | 'stake' | 'winnings' | 'refund'; lamports: number; balance_after: number; ref: string; signature: string | null; created_at: string | null }
export type Me = { user: string; balance: number; wallet: string | null; history: Line[] }
// Signed out, a guest (who can't hold SOL), or couldn't tell
export type MoneyStatus = 'loading' | 'ready' | 'signed-out' | 'guest' | 'off' | 'failed'

export class MoneyError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const httpUrl = () => serverUrl().replace(/^ws/, 'http').replace(/\/+$/, '')

// Who's asking, for the game server: the sign-in's token. (Developing only, against a server in MONEY_DEV
// mode: ?devuser=<name> on the address is a test player of that name, no account needed.)
const DEV_USER = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('devuser') : null
export async function accessToken() {
  if (DEV_USER) return `dev:${DEV_USER}`
  return supabase ? ((await supabase.auth.getSession()).data.session?.access_token ?? null) : null
}

async function call<T>(path: string, body?: object): Promise<T> {
  const token = await accessToken()
  let res: Response
  try {
    // (Only what's needed in the headers: a plain read then needs no permission check first)
    res = await fetch(`${httpUrl()}/wallet/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new MoneyError('offline', 'Couldn’t reach the game server.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new MoneyError(data?.error ?? 'server', data?.message ?? 'The game server couldn’t do that.')
  return data as T
}

// ---------------------------------------------------------------------------------------------------------

type State = { status: MoneyStatus; config: MoneyConfig | null; me: Me | null; problem: string | null }
let state: State = { status: 'loading', config: null, me: null, problem: null }
const listeners = new Set<() => void>()
function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export function useMoney() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => state,
  )
}

// Everything, afresh (as the page opens, and as you sign in or out)
let loading = 0
export async function loadMoney() {
  const mine = ++loading
  try {
    const config = state.config ?? (await call<MoneyConfig>('config'))
    if (mine !== loading) return
    if (!config.on) return set({ status: 'off', config, me: null, problem: null })
    set({ config })
    await refreshMoney()
  } catch (e) {
    if (mine === loading) set({ status: 'failed', problem: (e as Error).message })
  }
}

// Your balance, wallet and history again
export async function refreshMoney() {
  try {
    const me = await call<Me & { ok: true }>('me', {})
    set({ status: 'ready', me, problem: null })
  } catch (e) {
    const code = (e as MoneyError).code
    set({ status: code === 'sign-in' ? 'signed-out' : code === 'guest' ? 'guest' : code === 'off' ? 'off' : 'failed', me: null, problem: (e as Error).message })
  }
}

export const sol = (lamports: number, digits = 3) => (lamports / LAMPORTS).toFixed(digits)
export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`
export const explorer = (signature: string, network: string) => `https://explorer.solana.com/tx/${signature}${network === 'mainnet-beta' ? '' : `?cluster=${network}`}`

// What a wallet signs to be linked to your account (the server checks it's exactly this, and recent)
export const linkMessage = (user: string, time: string) => `Link this wallet to my Fallguy account.\nAccount: ${user}\nTime: ${time}`
// The memo a deposit carries, saying it's yours
export const depositMemo = (user: string) => `fallguy:${user}`

export async function linkWallet(address: string, signature: string, message: string) {
  await call('link', { address, message, signature })
  await refreshMoney()
}

// A deposit's transaction, for the server to check and count: it may take a few seconds to be confirmed.
// Until it's counted it's kept in the browser (PENDING), so one that took too long is tried again (the
// wallet does that as it opens), and the SOL sent isn't left uncounted.
const TRIES = 15
const PENDING = 'fallguy.pendingDeposits'
export function pendingDeposits(): string[] {
  try {
    const kept = JSON.parse(localStorage.getItem(PENDING) ?? '[]')
    return Array.isArray(kept) ? kept.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}
function setPending(signatures: string[]) {
  try {
    localStorage.setItem(PENDING, JSON.stringify(signatures.slice(-20)))
  } catch {
    // (not kept: it's tried now only)
  }
}
export async function claimDeposit(signature: string, tries = TRIES) {
  if (!pendingDeposits().includes(signature)) setPending([...pendingDeposits(), signature])
  for (let i = 0; ; i++) {
    try {
      const done = await call<{ lamports: number }>('deposit', { signature })
      setPending(pendingDeposits().filter((s) => s !== signature))
      await refreshMoney()
      return done.lamports
    } catch (e) {
      const code = (e as MoneyError).code
      // (Counted already, or never going to be: nothing more to try)
      if (code === 'already' || code === 'bad' || code === 'failed') setPending(pendingDeposits().filter((s) => s !== signature))
      if (code !== 'pending' || i >= tries) throw e
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

export async function withdraw(lamports: number) {
  const done = await call<{ signature: string }>('withdraw', { lamports })
  await refreshMoney()
  return done.signature
}

// (Trying it out on a server in MONEY_DEV mode: test SOL straight onto the balance)
export async function devCredit(lamports: number) {
  await call('dev-credit', { lamports })
  await refreshMoney()
}
