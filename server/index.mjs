// Fallguy's online play server. Players join a room (for now, just "playground") over a WebSocket; each
// sends where its bean is and what it's doing about 20 times a second, and the server passes that on to
// everyone else in the room straight away. It also tells the room who's joined (name, colour, outfit) and
// who's left, and answers pings (so players can see their lag). Each player is trusted with its own bean:
// fine for trying out play together, not for anything with prizes.
//
// Runs anywhere Node does: `npm start` (port 2567, or $PORT, as on Railway). GET / answers "ok", for health checks.

import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT) || 2567
const ROOMS = new Set(['playground'])
const ROOM_SIZE = 30
const NAME_MAX = 24
const STATE_LENGTH = 11 // numbers in a state message (see src/game/net/protocol.ts)
const MAX_MESSAGES_PER_SECOND = 60
const HEARTBEAT_MS = 10_000
// Colours for the beans (every player sees their own bean orange, so not that)
const COLOURS = ['#4f7dff', '#36c2a0', '#8f6bff', '#ff5c8a', '#ffd23f', '#3fb5ff', '#b7e04a', '#ff9ec4', '#7df9ff', '#c77dff', '#4dd4ac', '#e23b4e']
// What can be worn, slot by slot (anything else is dropped)
const OUTFIT_KEYS = ['hat', 'face', 'shades', 'back', 'flag']

/** @typedef {{ id: number, ws: import('ws').WebSocket, name: string, colour: string, outfit: Record<string, string>, room: string | null, alive: boolean, window: number, count: number }} Player */

/** @type {Map<string, Map<number, Player>>} */
const rooms = new Map()
/** @type {Set<Player>} everyone connected, in a room or not */
const connected = new Set()
let nextId = 1

const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' })
  const counts = [...rooms].map(([name, players]) => `${name}: ${players.size}`).join(', ')
  res.end(`ok${counts ? ` (${counts})` : ''}\n`)
})
const wss = new WebSocketServer({ server: http, maxPayload: 4096 })

const send = (ws, message) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}
function broadcast(room, message, except) {
  const players = rooms.get(room)
  if (!players) return
  const data = JSON.stringify(message)
  for (const p of players.values()) if (p !== except && p.ws.readyState === p.ws.OPEN) p.ws.send(data)
}
const describe = (p) => ({ id: p.id, name: p.name, colour: p.colour, outfit: p.outfit })

function cleanName(name) {
  // (No control characters or angle brackets)
  const n = typeof name === 'string' ? [...name].filter((c) => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>').join('').trim().slice(0, NAME_MAX) : ''
  return n || 'Bean'
}
function cleanOutfit(outfit) {
  const out = {}
  if (outfit && typeof outfit === 'object') {
    for (const key of OUTFIT_KEYS) {
      const v = outfit[key]
      if (typeof v === 'string' && v.length <= 24 && /^[A-Za-z0-9_-]+$/.test(v)) out[key] = v
    }
  }
  return out
}
function freeColour(players) {
  const used = new Set([...players.values()].map((p) => p.colour))
  return COLOURS.find((c) => !used.has(c)) ?? COLOURS[players.size % COLOURS.length]
}

function join(p, message) {
  const room = typeof message.room === 'string' && ROOMS.has(message.room) ? message.room : null
  if (!room) return send(p.ws, { t: 'error', reason: 'no-such-room' })
  if (p.room) return
  let players = rooms.get(room)
  if (!players) rooms.set(room, (players = new Map()))
  if (players.size >= ROOM_SIZE) return send(p.ws, { t: 'error', reason: 'room-full' })
  p.room = room
  p.name = cleanName(message.name)
  p.outfit = cleanOutfit(message.outfit)
  p.colour = freeColour(players)
  players.set(p.id, p)
  send(p.ws, { t: 'welcome', id: p.id, colour: p.colour, players: [...players.values()].filter((o) => o !== p).map(describe) })
  broadcast(room, { t: 'join', player: describe(p) }, p)
  console.log(`${p.name} (#${p.id}) joined ${room}: ${players.size} there`)
}

function leave(p) {
  if (!p.room) return
  const players = rooms.get(p.room)
  players?.delete(p.id)
  broadcast(p.room, { t: 'leave', id: p.id })
  console.log(`${p.name} (#${p.id}) left ${p.room}: ${players?.size ?? 0} there`)
  if (players && players.size === 0) rooms.delete(p.room)
  p.room = null
}

wss.on('connection', (ws) => {
  /** @type {Player} */
  const p = { id: nextId++, ws, name: 'Bean', colour: COLOURS[0], outfit: {}, room: null, alive: true, window: Date.now(), count: 0 }
  connected.add(p)
  ws.on('pong', () => (p.alive = true))

  ws.on('message', (raw) => {
    // (No more than so many messages a second from anyone)
    const now = Date.now()
    if (now - p.window > 1000) {
      p.window = now
      p.count = 0
    }
    if (++p.count > MAX_MESSAGES_PER_SECOND) return
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (!message || typeof message !== 'object') return
    switch (message.t) {
      case 'join':
        join(p, message)
        break
      case 's': {
        // Where its bean is and what it's doing: passed on as it is, if it's the right shape
        const d = message.d
        if (!p.room || !Array.isArray(d) || d.length !== STATE_LENGTH || !d.every((v) => typeof v === 'number' && Number.isFinite(v))) return
        broadcast(p.room, { t: 's', id: p.id, d }, p)
        break
      }
      case 'outfit':
        if (!p.room) return
        p.outfit = cleanOutfit(message.outfit)
        broadcast(p.room, { t: 'outfit', id: p.id, outfit: p.outfit }, p)
        break
      case 'ping':
        send(ws, { t: 'pong', c: message.c, s: now })
        break
    }
  })

  const gone = () => {
    leave(p)
    connected.delete(p)
  }
  ws.on('close', gone)
  ws.on('error', gone)
})

// Drop anyone who's stopped answering
const heartbeat = setInterval(() => {
  for (const p of connected) {
    if (!p.alive) {
      p.ws.terminate()
      continue
    }
    p.alive = false
    p.ws.ping()
  }
}, HEARTBEAT_MS)
wss.on('close', () => clearInterval(heartbeat))

http.listen(PORT, () => console.log(`Fallguy server listening on port ${PORT}`))
