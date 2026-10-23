import { useSyncExternalStore } from 'react'
import { rim } from './ground'

// The storm: a round starts with the whole valley safe and the first zone marked at a random spot. In each
// phase the storm holds still for a while (the next zone shown), then closes in on it; each zone is a random
// smaller circle inside the last. The last one closes to nothing at 25:00, and by then the storm has the
// whole valley. Out in the storm you lose health, faster in each phase; at none, you're out of the round.

export type Circle = { x: number; z: number; r: number }

// Each phase: how long the storm holds, how long it takes to close in, the zone it closes to, and what it
// costs (health per second) to be out in it meanwhile
export const PHASES = [
  { wait: 180, shrink: 180, r: 190, dps: 1 },
  { wait: 120, shrink: 150, r: 120, dps: 2 },
  { wait: 120, shrink: 120, r: 75, dps: 3 },
  { wait: 90, shrink: 105, r: 45, dps: 5 },
  { wait: 75, shrink: 90, r: 25, dps: 7 },
  { wait: 60, shrink: 90, r: 10, dps: 10 },
  { wait: 30, shrink: 90, r: 0, dps: 15 },
]
export const TOTAL = PHASES.reduce((s, p) => s + p.wait + p.shrink, 0) // 1500 s: 25 minutes
const WHOLE: Circle = { x: 0, z: 0, r: 370 } // round the whole valley with room to spare (so the first zone can sit well off centre)
export const MAX_HEALTH = 100

// The round's state, advanced every frame by the scene (./Storm) and read by the HUD and the map
export const storm = {
  zones: [WHOLE] as Circle[], // zones[0] is the whole valley; zones[i] is phase i's zone
  time: 0,
  health: MAX_HEALTH,
  down: false,
  downAt: 0,
  hits: 0, // counts storm damage ticks (the HUD pulses on each)
}

function seeded(seed: number) {
  let s = seed % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// A fresh round: new zones (the first somewhere well inside the valley, each next one somewhere inside the
// one before), full health, the clock at zero
export function newRound(seed = Math.floor(Math.random() * 2147483646) + 1) {
  const rand = seeded(seed)
  const zones: Circle[] = [WHOLE]
  for (let i = 0; i < PHASES.length; i++) {
    const prev = zones[i]
    const r = PHASES[i].r
    let pick: Circle = { x: prev.x, z: prev.z, r }
    for (let tries = 0; tries < 200; tries++) {
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand()) * Math.max(0, prev.r - r) * (r === 0 ? 0.7 : 1)
      const x = prev.x + Math.cos(a) * d
      const z = prev.z + Math.sin(a) * d
      // Keep the zones' middles in the valley (the first well in, so most of it is playable)
      if (rim(x, z) > (i === 0 ? 0.6 : 0.8)) continue
      pick = { x, z, r }
      break
    }
    zones.push(pick)
  }
  storm.zones = zones
  storm.time = 0
  storm.health = MAX_HEALTH
  storm.down = false
  storm.hits = 0
  publish()
}

// Where the storm stands at time t: which phase, whether it's closing in, seconds until that changes, the
// safe circle now, and the zone it's heading for
export function stormAt(t: number) {
  let start = 0
  for (let i = 0; i < PHASES.length; i++) {
    const { wait, shrink } = PHASES[i]
    const from = storm.zones[i]
    const to = storm.zones[i + 1]
    if (t < start + wait) return { phase: i, closing: false, left: start + wait - t, now: from, next: to }
    if (t < start + wait + shrink) {
      const k = (t - start - wait) / shrink
      return { phase: i, closing: true, left: start + wait + shrink - t, now: lerpCircle(from, to, k), next: to }
    }
    start += wait + shrink
  }
  const last = storm.zones[storm.zones.length - 1]
  return { phase: PHASES.length, closing: false, left: 0, now: last, next: null }
}

const lerpCircle = (a: Circle, b: Circle, k: number): Circle => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, r: a.r + (b.r - a.r) * k })

// How far (x, z) is out in the storm (0 or less: safe)
export const stormDepth = (c: Circle, x: number, z: number) => Math.hypot(x - c.x, z - c.z) - c.r

// One frame of the round: the clock moves on; out in the storm, health drains
export function tickStorm(dt: number, player: { x: number; z: number } | null) {
  if (storm.down) return
  storm.time += dt
  const s = stormAt(storm.time)
  if (player && stormDepth(s.now, player.x, player.z) > 0) {
    const before = Math.ceil(storm.health)
    storm.health = Math.max(0, storm.health - PHASES[Math.min(s.phase, PHASES.length - 1)].dps * dt)
    if (Math.ceil(storm.health) < before) storm.hits++
    if (storm.health <= 0) {
      storm.down = true
      storm.downAt = storm.time
    }
  }
  publish()
}

export const canMove = () => !storm.down

// ---------------------------------------------------------------------------------------------------------
// What the HUD shows, republished only when something visible changes

export type StormView = { phase: number; closing: boolean; left: number; health: number; down: boolean; survived: number; hits: number; inStorm: boolean; distance: number }
let view: StormView = { phase: 0, closing: false, left: 0, health: MAX_HEALTH, down: false, survived: 0, hits: 0, inStorm: false, distance: 0 }
let lastPlayer: { x: number; z: number } | null = null
export const setStormPlayer = (p: { x: number; z: number } | null) => {
  lastPlayer = p
}
const listeners = new Set<() => void>()

function publish() {
  const s = stormAt(storm.time)
  const depth = lastPlayer ? stormDepth(s.now, lastPlayer.x, lastPlayer.z) : -1
  const next: StormView = {
    phase: s.phase,
    closing: s.closing,
    left: Math.ceil(s.left),
    health: Math.ceil(storm.health),
    down: storm.down,
    survived: Math.floor(storm.down ? storm.downAt : storm.time),
    hits: storm.hits,
    inStorm: depth > 0,
    distance: Math.max(0, Math.ceil(depth)),
  }
  if ((Object.keys(next) as (keyof StormView)[]).some((k) => next[k] !== view[k])) {
    view = next
    listeners.forEach((l) => l())
  }
}

export function useStorm() {
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
