import { useSyncExternalStore } from 'react'
import type { Outfit } from '../outfit'
import { S, STATE_LENGTH, type NetPlayer } from './protocol'

// The connection to the online play server: joining a room, sending my bean's state, and keeping everyone
// else's (with the last moments of where each has been, to draw them smoothly a moment behind: see
// ./RemotePlayers). Reconnects by itself if the connection drops. Plain module state, read by the
// components each frame; useNet() for the parts of it the HUD and the list of beans redraw on.
//
// The server's address: VITE_MP_URL (e.g. wss://fallguy-server.up.railway.app) or, without it, port 2567 on
// the same machine the page came from (so a phone on the same Wi-Fi as the computer running `npm run
// server` finds it). For trying out lag: ?lag=150 (ms) on the page's address holds every message from the
// server back that long (and ?jitter=40, give or take that much more).

export type Status = 'idle' | 'connecting' | 'online' | 'offline'

export type Remote = NetPlayer & {
  samples: number[][] // its last states, oldest first
  gaps: number[] // for each of its recent states, when it got here less when it was sent (ms, by our clocks)
  offset: number // the least of those: sender's clock + offset = when it would have got here with no delay
}

const RECONNECT_AFTER = 2000
const PING_EVERY = 2000
const KEEP_SAMPLES = 40
const KEEP_GAPS = 60
const NAME_KEY = 'fallguy.netName'

type View = { status: Status; ping: number | null; players: NetPlayer[]; myColour: string | null; problem: string | null; lag: number }

export const net = {
  status: 'idle' as Status,
  myId: null as number | null,
  myColour: null as string | null,
  ping: null as number | null,
  problem: null as string | null,
  remotes: new Map<number, Remote>(),
}

const params = new URLSearchParams(window.location.search)
const LAG = Math.max(0, Number(params.get('lag')) || 0)
const JITTER = Math.max(0, Number(params.get('jitter')) || 0)

export function serverUrl() {
  const env = import.meta.env.VITE_MP_URL as string | undefined
  if (env) return env
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:2567`
}

// ---------------------------------------------------------------------------------------------------------
// What the HUD redraws on

let view: View = { status: 'idle', ping: null, players: [], myColour: null, problem: null, lag: LAG }
const listeners = new Set<() => void>()
function changed() {
  view = { status: net.status, ping: net.ping, players: [...net.remotes.values()].map(({ id, name, colour, outfit }) => ({ id, name, colour, outfit })), myColour: net.myColour, problem: net.problem, lag: LAG }
  listeners.forEach((l) => l())
}
export function useNet() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => view,
  )
}

// ---------------------------------------------------------------------------------------------------------
// Who I am: the name I'm signed in to the site with (from the saved sign-in), or a made-up one kept for next time

export function myName() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue
      const meta = JSON.parse(localStorage.getItem(key) ?? 'null')?.user?.user_metadata
      const name = meta?.display_name || meta?.username
      if (typeof name === 'string' && name) return name
    }
    let name = localStorage.getItem(NAME_KEY)
    if (!name) {
      name = `Bean${1000 + Math.floor(Math.random() * 9000)}`
      localStorage.setItem(NAME_KEY, name)
    }
    return name
  } catch {
    return 'Bean'
  }
}

// ---------------------------------------------------------------------------------------------------------
// The connection

let socket: WebSocket | null = null
let wanted: { room: string; outfit: () => Outfit } | null = null
let retry = 0
let pinger = 0
let everOnline = false // since joining (to tell "can't reach it" from "lost it")

function send(message: object) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

// My bean's state (the server passes it on to the room)
export function sendState(d: number[]) {
  if (net.status === 'online' && d.length === STATE_LENGTH) send({ t: 's', d })
}

export function sendOutfit(outfit: Outfit) {
  if (net.status === 'online') send({ t: 'outfit', outfit })
}

function open() {
  if (!wanted) return
  net.status = 'connecting'
  changed()
  let ws: WebSocket
  try {
    ws = new WebSocket(serverUrl())
  } catch {
    net.status = 'offline'
    net.problem = 'Couldn’t reach the server.'
    changed()
    retry = window.setTimeout(open, RECONNECT_AFTER)
    return
  }
  socket = ws
  ws.onopen = () => {
    if (!wanted) return
    send({ t: 'join', room: wanted.room, name: myName(), outfit: wanted.outfit() })
    pinger = window.setInterval(() => send({ t: 'ping', c: performance.now() }), PING_EVERY)
  }
  ws.onmessage = (e) => {
    const text = typeof e.data === 'string' ? e.data : ''
    if (LAG || JITTER) window.setTimeout(() => receive(text), LAG + Math.random() * JITTER)
    else receive(text)
  }
  ws.onclose = () => {
    if (socket !== ws) return
    socket = null
    window.clearInterval(pinger)
    net.remotes.clear()
    net.myId = null
    if (!wanted) return
    net.status = 'offline'
    net.problem ??= everOnline ? 'Lost the server: trying again…' : 'Can’t reach the server: trying again…'
    changed()
    retry = window.setTimeout(open, RECONNECT_AFTER)
  }
}

function receive(text: string) {
  let m: Record<string, unknown>
  try {
    m = JSON.parse(text)
  } catch {
    return
  }
  switch (m.t) {
    case 'welcome': {
      net.myId = m.id as number
      net.myColour = m.colour as string
      net.status = 'online'
      everOnline = true
      net.problem = null
      net.remotes.clear()
      for (const p of m.players as NetPlayer[]) net.remotes.set(p.id, fresh(p))
      changed()
      break
    }
    case 'join': {
      const p = m.player as NetPlayer
      net.remotes.set(p.id, fresh(p))
      changed()
      break
    }
    case 'leave':
      net.remotes.delete(m.id as number)
      changed()
      break
    case 'outfit': {
      const r = net.remotes.get(m.id as number)
      if (r) {
        r.outfit = m.outfit as Partial<Outfit>
        changed()
      }
      break
    }
    case 's': {
      const r = net.remotes.get(m.id as number)
      const d = m.d as number[]
      if (!r || !Array.isArray(d) || d.length !== STATE_LENGTH) break
      // How far behind its clock ours runs (the least of the recent ones: the delay without the hold-ups)
      r.gaps.push(performance.now() - d[S.stamp])
      if (r.gaps.length > KEEP_GAPS) r.gaps.shift()
      r.offset = Math.min(...r.gaps)
      // In order of when they were sent (a late one can arrive after a later one)
      let k = r.samples.length
      while (k > 0 && r.samples[k - 1][S.stamp] > d[S.stamp]) k--
      r.samples.splice(k, 0, d)
      if (r.samples.length > KEEP_SAMPLES) r.samples.shift()
      break
    }
    case 'pong': {
      const rtt = performance.now() - (m.c as number)
      net.ping = Math.round(rtt)
      changed()
      break
    }
    case 'error':
      net.problem = m.reason === 'room-full' ? 'This server’s full.' : 'The server doesn’t have this room.'
      wanted = null
      socket?.close()
      net.status = 'offline'
      changed()
      break
  }
}

const fresh = (p: NetPlayer): Remote => ({ ...p, samples: [], gaps: [], offset: 0 })

// Join a room (and stay in it, reconnecting as needed) until the returned function's called
export function joinRoom(room: string, outfit: () => Outfit) {
  wanted = { room, outfit }
  net.problem = null
  everOnline = false
  open()
  return () => {
    wanted = null
    window.clearTimeout(retry)
    window.clearInterval(pinger)
    const ws = socket
    socket = null
    ws?.close()
    net.remotes.clear()
    net.status = 'idle'
    net.myId = null
    net.ping = null
    changed()
  }
}
