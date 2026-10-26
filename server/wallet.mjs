// Players' SOL, for the game server (./index.mjs). Each player has a balance on the site, kept in Supabase
// (supabase/wallet.sql: every change a line in the ledger). They put SOL in by sending it from their own
// wallet to the site's (the house wallet), with a memo saying whose it is, and tell the server the
// transaction: it's checked on the chain before the balance goes up. They take SOL out to the wallet they've
// linked to their account (shown to be theirs by a message it signed): the balance goes down first, then the
// house wallet sends it. And Party Games shows can be played for stakes: taken from each player's balance as
// the show starts, the pot (less the site's fee) paid to the players who come top when it ends.
//
// Settings, from the environment (Railway: the service's Variables):
//   HOUSE_SECRET_KEY            the house wallet's secret key (base58, or a JSON array of numbers): without it,
//                               there's no money on this server (scripts/house-wallet.mjs makes one)
//   SUPABASE_URL                the project's address
//   SUPABASE_SERVICE_ROLE_KEY   its secret key (Project Settings > API Keys: a secret key, sb_secret_..., or
//                               the legacy service_role key): to change balances, which nobody else can
//   SOLANA_NETWORK              'devnet' (the default: test SOL, no real money) or 'mainnet-beta'
//   SOLANA_RPC                  an RPC address for it (defaults to Solana's public one)
// For trying it out on your own computer only:
//   MONEY_DEV=1                 balances kept in memory instead of Supabase (lost on restart), a throwaway
//                               house wallet if there's no HOUSE_SECRET_KEY, guests allowed, and test
//                               sign-ins: a token of 'dev:<name>' is that player

import { randomUUID, createHash } from 'node:crypto'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SendTransactionError, SystemProgram, Transaction, TransactionExpiredBlockheightExceededError, clusterApiUrl } from '@solana/web3.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import bs58 from 'bs58'

const env = process.env
const DEV = env.MONEY_DEV === '1'
const NETWORK = env.SOLANA_NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet'
const COMMITMENT = NETWORK === 'mainnet-beta' ? 'finalized' : 'confirmed'
const SUPABASE_URL = env.SUPABASE_URL?.replace(/\/$/, '')
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

// The stake tiers (lamports; 0: free), the site's share of a pot, and the least that can go in or out
export const TIERS = [0, 0.01, 0.05, 0.1].map((n) => Math.round(n * LAMPORTS_PER_SOL))
export const FEE = 0.1
const sol = (n) => Math.round(n * LAMPORTS_PER_SOL)
const MIN_DEPOSIT = sol(0.001)
const MIN_WITHDRAW = sol(0.01)
const MAX_WITHDRAW = sol(NETWORK === 'devnet' ? 10 : 2) // at a time
const HOUSE_KEEPS = sol(0.002) // left in the house wallet always (rent, and fees)
// How a deposit's memo says whose it is; and the message a wallet signs to be linked
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
export const memoFor = (user) => `fallguy:${user}`
export const linkMessage = (user, time) => `Link this wallet to my Fallguy account.\nAccount: ${user}\nTime: ${time}`
const LINK_WITHIN = 10 * 60_000 // ms a signed link message is good for
const HISTORY = 20 // ledger lines shown

function houseKey() {
  // (Pasted with the quotes round it from house-wallet.json, it's the same key)
  const secret = env.HOUSE_SECRET_KEY?.trim().replace(/^"(.*)"$/, '$1')
  if (!secret) return DEV ? Keypair.generate() : null
  try {
    return Keypair.fromSecretKey(secret.startsWith('[') ? Uint8Array.from(JSON.parse(secret)) : bs58.decode(secret))
  } catch {
    console.error('HOUSE_SECRET_KEY is not a secret key: no money on this server')
    return null
  }
}
const house = houseKey()
const supabaseLedger = !!(SUPABASE_URL && SERVICE_KEY)
export const moneyOn = !!house && (supabaseLedger || DEV)
const connection = new Connection(env.SOLANA_RPC || clusterApiUrl(NETWORK), COMMITMENT)
if (moneyOn) console.log(`Money on ${NETWORK}: house wallet ${house.publicKey.toBase58()}, balances in ${supabaseLedger ? 'Supabase' : 'memory (MONEY_DEV)'}`)
else console.log('No money on this server (no HOUSE_SECRET_KEY, or no SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)')

// A problem for the player: the code the game says something about, and a message
class Refused extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// ---------------------------------------------------------------------------------------------------------
// The ledger: in Supabase (the functions in supabase/wallet.sql), or for trying out, in memory

// (A legacy service_role key is a JWT, and goes in Authorization too; a newer secret key, sb_secret_..., only
// as the apikey: Supabase then acts as the service role)
const asService = SERVICE_KEY?.startsWith('eyJ') ? { Authorization: `Bearer ${SERVICE_KEY}` } : {}

async function supabase(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SERVICE_KEY, ...asService, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message = data?.message ?? `Supabase said ${res.status}`
    throw new Refused(/insufficient/.test(message) ? 'insufficient' : /duplicate|ledger_once|ledger_deposit_once/.test(message) ? 'already' : 'ledger', message)
  }
  return data
}
const rpc = (fn, args) => supabase(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args })

const memory = { balances: new Map(), ledger: [], wallets: new Map(), shows: new Map() }
function memoryApply(user, kind, lamports, ref, signature = null) {
  if (memory.ledger.some((l) => l.kind === kind && l.ref === ref && (l.user === user || kind === 'deposit'))) throw new Refused('already', 'Already counted')
  const next = (memory.balances.get(user) ?? 0) + lamports
  if (next < 0) throw new Refused('insufficient', 'insufficient balance')
  memory.balances.set(user, next)
  memory.ledger.push({ user, kind, lamports, ref, signature, balance: next })
  return next
}

const ledger = {
  async apply(user, kind, lamports, ref, signature = null, note = null) {
    if (!supabaseLedger) return memoryApply(user, kind, lamports, ref, signature)
    return rpc('apply_ledger', { p_user: user, p_kind: kind, p_lamports: lamports, p_ref: ref, p_signature: signature, p_note: note })
  },
  async balance(user) {
    if (!supabaseLedger) return memory.balances.get(user) ?? 0
    const rows = await supabase(`/rest/v1/balances?user_id=eq.${user}&select=lamports`)
    return Number(rows[0]?.lamports ?? 0)
  },
  async history(user) {
    if (!supabaseLedger) return memory.ledger.filter((l) => l.user === user).slice(-HISTORY).reverse().map((l) => ({ kind: l.kind, lamports: l.lamports, balance_after: l.balance, ref: l.ref, signature: l.signature, created_at: null }))
    return supabase(`/rest/v1/ledger?user_id=eq.${user}&select=kind,lamports,balance_after,ref,signature,created_at&order=id.desc&limit=${HISTORY}`)
  },
  async wallet(user) {
    if (!supabaseLedger) return memory.wallets.get(user) ?? null
    const rows = await supabase(`/rest/v1/wallets?user_id=eq.${user}&select=address`)
    return rows[0]?.address ?? null
  },
  async link(user, address) {
    if (!supabaseLedger) {
      for (const [other, a] of memory.wallets) if (a === address && other !== user) throw new Refused('taken', 'That wallet is linked to another account')
      memory.wallets.set(user, address)
      return
    }
    try {
      await rpc('link_wallet', { p_user: user, p_address: address })
    } catch (e) {
      throw e.code === 'already' ? new Refused('taken', 'That wallet is linked to another account') : e
    }
  },
  async signed(ref, signature) {
    if (!supabaseLedger) {
      const line = memory.ledger.find((l) => l.kind === 'withdrawal' && l.ref === ref)
      if (line) line.signature = signature
      return
    }
    await supabase(`/rest/v1/ledger?kind=eq.withdrawal&ref=eq.${ref}`, { method: 'PATCH', body: { signature }, prefer: 'return=minimal' })
  },
  async startShow(show, tier, stake, users) {
    if (!supabaseLedger) {
      const paid = users.filter((u) => {
        try {
          memoryApply(u, 'stake', -stake, show)
          return true
        } catch {
          return false
        }
      })
      memory.shows.set(show, { stake, paid, pot: stake * paid.length, status: 'live' })
      return paid
    }
    return rpc('start_staked_show', { p_show: show, p_tier: tier, p_stake: stake, p_users: users })
  },
  async settle(show, payouts) {
    if (!supabaseLedger) {
      const s = memory.shows.get(show)
      if (!s || s.status !== 'live') throw new Refused('ledger', 'show not live')
      for (const p of payouts) if (p.lamports > 0) memoryApply(p.user, 'winnings', p.lamports, show)
      s.status = 'settled'
      s.fee = s.pot - payouts.reduce((n, p) => n + p.lamports, 0)
      return
    }
    await rpc('settle_staked_show', { p_show: show, p_payouts: payouts })
  },
  async refund(show) {
    if (!supabaseLedger) {
      const s = memory.shows.get(show)
      if (!s || s.status !== 'live') return
      for (const u of s.paid) memoryApply(u, 'refund', s.stake, show)
      s.status = 'refunded'
      return
    }
    await rpc('refund_staked_show', { p_show: show })
  },
  async refundLive() {
    if (!supabaseLedger) return 0
    return rpc('refund_live_shows', {})
  },
}

// ---------------------------------------------------------------------------------------------------------
// Who's asking: a Supabase sign-in (its access token), checked with Supabase. Guests can't hold money (their
// account ends when they sign out), except trying it out.

const seen = new Map() // token: { user, until }
export async function whoIs(token) {
  if (typeof token !== 'string' || token.length > 4096) return null
  if (DEV && token.startsWith('dev:')) {
    const hex = createHash('sha256').update(token).digest('hex')
    return { id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`, guest: false }
  }
  if (!SUPABASE_URL) return null
  const kept = seen.get(token)
  if (kept && kept.until > Date.now()) return kept.user
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY ?? env.SUPABASE_ANON_KEY ?? '', Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const data = await res.json()
  if (typeof data?.id !== 'string') return null
  const user = { id: data.id, guest: !!data.is_anonymous }
  seen.set(token, { user, until: Date.now() + 60_000 })
  if (seen.size > 5000) seen.clear()
  return user
}
// (A player who can hold money: signed in, and not as a guest)
async function holder(token) {
  const user = await whoIs(token)
  if (!user) throw new Refused('sign-in', 'Sign in to use your balance.')
  if (user.guest && !DEV) throw new Refused('guest', 'Guest accounts can’t hold SOL: register to keep a balance.')
  return user.id
}

// ---------------------------------------------------------------------------------------------------------
// In, out, and linking

// A player's money: their balance, linked wallet, and latest ledger lines
async function me(user) {
  const [balance, wallet, history] = await Promise.all([ledger.balance(user), ledger.wallet(user), ledger.history(user)])
  return { user, balance: Number(balance), wallet, history: history.map((l) => ({ ...l, lamports: Number(l.lamports), balance_after: Number(l.balance_after) })) }
}

// A wallet shown to be the player's: it signed the link message, recently
async function link(user, { address, message, signature }) {
  let key
  try {
    key = new PublicKey(address)
  } catch {
    throw new Refused('bad', 'That isn’t a Solana address.')
  }
  const time = typeof message === 'string' ? /\nTime: (.+)$/.exec(message)?.[1] : null
  if (!time || message !== linkMessage(user, time) || Math.abs(Date.now() - Date.parse(time)) > LINK_WITHIN) throw new Refused('bad', 'That link message is out of date: try again.')
  let ok = false
  try {
    ok = ed25519.verify(bs58.decode(signature), new TextEncoder().encode(message), key.toBytes())
  } catch {
    ok = false
  }
  if (!ok) throw new Refused('bad', 'The wallet’s signature doesn’t match.')
  await ledger.link(user, key.toBase58())
  return { address: key.toBase58() }
}

// A deposit: the transaction's on the chain, it sent SOL to the house wallet, and its memo says it's this
// player's. Counted once.
async function deposit(user, { signature }) {
  if (typeof signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature)) throw new Refused('bad', 'That isn’t a transaction.')
  const tx = await connection.getParsedTransaction(signature, { commitment: COMMITMENT, maxSupportedTransactionVersion: 0 })
  if (!tx) throw new Refused('pending', 'The transaction isn’t confirmed yet.')
  if (tx.meta?.err) throw new Refused('failed', 'That transaction failed.')
  const to = house.publicKey.toBase58()
  let lamports = 0
  let memo = null
  for (const ix of tx.transaction.message.instructions) {
    if (ix.program === 'system' && ix.parsed?.type === 'transfer' && ix.parsed.info?.destination === to) lamports += Number(ix.parsed.info.lamports)
    if (ix.programId?.equals?.(MEMO_PROGRAM)) memo = typeof ix.parsed === 'string' ? ix.parsed : null
  }
  if (memo !== memoFor(user)) throw new Refused('bad', 'That transaction isn’t a deposit to this account.')
  if (lamports < MIN_DEPOSIT) throw new Refused('bad', 'That transaction didn’t send any SOL to the site.')
  const balance = await ledger.apply(user, 'deposit', lamports, signature, signature)
  return { lamports, balance: Number(balance) }
}

// A withdrawal, to the linked wallet: off the balance first, then sent. If it's certain it didn't go (it
// failed, or ran out of time on the chain), it's given back; if that isn't certain (the connection went), it's
// left for checking by hand, and logged.
const withdrawing = new Set()
async function withdraw(user, { lamports }) {
  if (!Number.isInteger(lamports) || lamports < MIN_WITHDRAW) throw new Refused('bad', `Withdraw at least ${MIN_WITHDRAW / LAMPORTS_PER_SOL} SOL.`)
  if (lamports > MAX_WITHDRAW) throw new Refused('bad', `Withdraw at most ${MAX_WITHDRAW / LAMPORTS_PER_SOL} SOL at a time.`)
  if (withdrawing.has(user)) throw new Refused('busy', 'A withdrawal is on its way already.')
  const address = await ledger.wallet(user)
  if (!address) throw new Refused('no-wallet', 'Link a wallet first: that’s where it goes.')
  withdrawing.add(user)
  const id = randomUUID()
  try {
    const housed = await connection.getBalance(house.publicKey, COMMITMENT)
    if (housed < lamports + HOUSE_KEEPS) throw new Refused('house', 'The site can’t pay that out right now. Try a smaller amount, or later.')
    await ledger.apply(user, 'withdrawal', -lamports, id)
    let signature
    let sent = false
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(COMMITMENT)
      const tx = new Transaction({ feePayer: house.publicKey, blockhash, lastValidBlockHeight }).add(
        SystemProgram.transfer({ fromPubkey: house.publicKey, toPubkey: new PublicKey(address), lamports }),
      )
      tx.sign(house)
      signature = bs58.encode(tx.signature)
      await ledger.signed(id, signature)
      sent = true
      await connection.sendRawTransaction(tx.serialize())
      const done = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, COMMITMENT)
      if (done.value.err) throw new Refused('failed', 'The withdrawal failed on the chain.')
    } catch (e) {
      // (Certain it didn't go: never sent, refused as it was sent, failed on the chain, or out of time)
      const certain = !sent || e instanceof Refused || e instanceof SendTransactionError || e instanceof TransactionExpiredBlockheightExceededError
      if (certain) {
        await ledger.apply(user, 'refund', lamports, `withdrawal:${id}`)
        throw e instanceof Refused ? e : new Refused('failed', 'The withdrawal didn’t go through: your balance is back.')
      }
      console.error(`Withdrawal ${id} (${signature}) for ${user}: not sure it went (${e?.message}). Check it by hand.`)
      throw new Refused('unsure', 'The withdrawal was sent, but its confirmation didn’t come back. Check your wallet in a minute.')
    }
    return { signature, balance: await ledger.balance(user) }
  } finally {
    withdrawing.delete(user)
  }
}

// ---------------------------------------------------------------------------------------------------------
// Staked shows (for ./index.mjs)

export const stakes = {
  // Can this player stake on a show at this tier? Their account, if so
  async check(token, tier) {
    const user = await holder(token)
    if ((await ledger.balance(user)) < TIERS[tier]) throw new Refused('balance', `You need ${TIERS[tier] / LAMPORTS_PER_SOL} SOL in your balance for this show.`)
    return user
  },
  // The stakes taken, as the show starts: the players who paid
  start: (show, tier, users) => ledger.startShow(show, tier, TIERS[tier], users),
  settle: (show, payouts) => ledger.settle(show, payouts),
  refund: (show) => ledger.refund(show),
  // As the server starts: shows it was running before are gone, so their stakes go back
  async recover() {
    if (!moneyOn) return
    try {
      const n = await ledger.refundLive()
      if (n) console.log(`Refunded ${n} staked show(s) left unfinished`)
    } catch (e) {
      console.error(`Couldn't refund unfinished shows: ${e.message}`)
    }
  },
}

// How a pot's paid out, by how many players staked on the show: the shares of what's left after the fee
export function splitFor(players) {
  return players <= 2 ? [1] : players <= 4 ? [0.7, 0.3] : [0.5, 0.3, 0.2]
}

// The payouts for a show's players in their order (`ranked`: groups of players who came equal, best first):
// each place's share of the prize, a tie sharing the places it spans; whatever's left over (rounding) is
// the site's
export function payoutsFor(pot, ranked) {
  const prize = Math.floor(pot * (1 - FEE))
  const split = splitFor(ranked.flat().length)
  const out = []
  let place = 0
  for (const group of ranked) {
    const share = split.slice(place, place + group.length).reduce((a, b) => a + b, 0)
    const each = Math.floor((prize * share) / group.length)
    for (const user of group) out.push({ user, lamports: each, place: place + 1 })
    place += group.length
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------
// The HTTP side: /wallet/config, and (signed in) /wallet/me, /wallet/link, /wallet/deposit, /wallet/withdraw

// (MONEY_DEV only, with balances in memory: test SOL straight onto a balance, for trying things out without
// a faucet. Never with Supabase's balances.)
async function devCredit(user, { lamports }) {
  if (!DEV || supabaseLedger) throw new Refused('none', 'No such thing')
  if (!Number.isInteger(lamports) || lamports <= 0 || lamports > 10 * LAMPORTS_PER_SOL) throw new Refused('bad', 'Up to 10 SOL')
  return { balance: memoryApply(user, 'deposit', lamports, `dev:${randomUUID()}`) }
}

const ROUTES = { me, link, deposit, withdraw, ...(DEV ? { 'dev-credit': devCredit } : {}) }

function reply(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 4096) throw new Refused('bad', 'Too much')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}')
  } catch {
    throw new Refused('bad', 'That isn’t JSON')
  }
}

// Handles it if it's the wallet's (true), or leaves it to the rest of the server (false)
export function handleWallet(req, res) {
  const url = new URL(req.url ?? '/', 'http://server')
  if (!url.pathname.startsWith('/wallet/')) return false
  if (req.method === 'OPTIONS') {
    reply(res, 204, {})
    return true
  }
  const name = url.pathname.slice('/wallet/'.length)
  if (name === 'config' && req.method === 'GET') {
    reply(res, 200, {
      on: moneyOn,
      network: NETWORK,
      house: moneyOn ? house.publicKey.toBase58() : null,
      tiers: TIERS,
      fee: FEE,
      minDeposit: MIN_DEPOSIT,
      minWithdraw: MIN_WITHDRAW,
      dev: DEV,
    })
    return true
  }
  const route = ROUTES[name]
  if (!route || req.method !== 'POST') {
    reply(res, 404, { error: 'none', message: 'No such thing' })
    return true
  }
  ;(async () => {
    try {
      if (!moneyOn) throw new Refused('off', 'There’s no money on this server yet.')
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
      const user = await holder(token)
      const body = await readBody(req)
      reply(res, 200, { ok: true, ...(await route(user, body)) })
    } catch (e) {
      if (!(e instanceof Refused)) console.error(`/wallet/${name}: ${e?.message}`)
      reply(res, e instanceof Refused ? 400 : 500, { error: e instanceof Refused ? e.code : 'server', message: e instanceof Refused ? e.message : 'Something went wrong on the server.' })
    }
  })()
  return true
}
