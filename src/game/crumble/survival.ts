import { COUNTDOWN_SECONDS } from '../race/race'
import { CROWN, CROWN_TILES, GUSTS, SURVIVAL, survivalLength } from './course'

// The crown's survival phase, and the other timetables that depend on the match clock: wind gusts round the
// ring, and the rest of the tower giving way once the survival phase begins.

export const STAGES = SURVIVAL.sizes.length
const QUAKE_TIME = 1.6
// Once the survival phase begins, everything below the crown is gone within this long
const COLLAPSE_AFTER = 15

// A rock falling on the crown: where it lands, and when (the bots keep out from under them)
export type Drop = { x: number; z: number; land: number; done: boolean }

export const survival = {
  start: Infinity, // when somebody first stood on the crown
  quakes: [] as number[], // when each quake starts
  drops: [] as Drop[], // the last few rocks
}
export function resetSurvival() {
  survival.start = Infinity
  survival.quakes = []
  survival.drops = []
}

// The survival phase begins: sets out the quakes, closer together stage by stage
export function beginSurvival(t: number) {
  survival.start = t
  survival.quakes = []
  for (let q = t + 5; q < t + survivalLength; q += SURVIVAL.quakeEvery[stageAt(q)]) survival.quakes.push(q)
}

export const surviving = (t: number) => t >= survival.start
// When the rest of the tower starts to go (once somebody's on the crown)
export const collapseAt = () => survival.start + COLLAPSE_AFTER
// By now everything below the crown has gone (anyone still down there is on what's left of the walls or the
// roof under the crown: out)
export const collapsed = (t: number) => t >= collapseAt() + 6
export const survivalEnd = () => survival.start + survivalLength

// 0 (the whole 25 x 25) up to STAGES - 1 (the last 5 x 5)
export function stageAt(t: number) {
  if (!(t >= survival.start)) return 0
  return Math.min(STAGES - 1, Math.floor((t - survival.start) / SURVIVAL.stage))
}

// Half the width of what's left of the crown in a stage
export const arenaHalf = (stage: number) => CROWN.half - stage * CROWN.tile

// Seconds until the next stage (null in the last)
export function nextStageIn(t: number) {
  const stage = stageAt(t)
  if (stage >= STAGES - 1) return null
  return survival.start + (stage + 1) * SURVIVAL.stage - t
}

// How far the beam has turned by t: it speeds up stage by stage, so add up each stage's turn (and once the
// last stand's over, it stops)
export function beamAngle(t: number) {
  const d = Math.min(t, survivalEnd()) - survival.start
  if (!(d > 0)) return 0
  let angle = 0
  for (let k = 0; k < STAGES; k++) {
    const from = k * SURVIVAL.stage
    if (d <= from) break
    const to = k === STAGES - 1 ? d : Math.min(d, from + SURVIVAL.stage)
    angle += SURVIVAL.beamSpin[k] * (to - from)
  }
  return angle
}
export const beamSpin = (t: number) => (surviving(t) && t < survivalEnd() ? SURVIVAL.beamSpin[stageAt(t)] : 0)

// A crown tile's ring, counting in from the outside: 4 is the outermost, 0 the middle 2 x 2
export function tileRing(i: number, j: number) {
  const c = (CROWN_TILES - 1) / 2
  return Math.max(Math.abs(i - c), Math.abs(j - c)) - 0.5
}

// When a crown tile falls: the outer ring at the end of stage 0, the next at the end of stage 1, and so on.
// The middle never goes. `delay` ripples the fall round the ring.
export function tileFallAt(ring: number, delay: number) {
  if (ring <= 0) return Infinity
  return survival.start + (STAGES - ring) * SURVIVAL.stage + delay
}

// How hard the crown is quaking at t (0..1)
export function quakeAt(t: number) {
  for (const q of survival.quakes) {
    if (t < q) break
    if (t < q + QUAKE_TIME) return Math.sin((Math.PI * (t - q)) / QUAKE_TIME)
  }
  return 0
}

// A piece of the tower below the crown falls at its own time or, once the survival phase has begun, soon
// after it (in order, `stagger` seconds apart)
export function doomed(scheduled: number, stagger = 0) {
  return () => Math.min(scheduled, survival.start + COLLAPSE_AFTER + stagger)
}

// Wind round the ring: a gust every GUSTS.every seconds, each from its own direction, swelling and dying
// away over GUSTS.last seconds. Sets `out` to the push (m/s) and returns its strength (0..1).
const GOLDEN = 2.39996
export function windAt(t: number, out: { x: number; z: number }) {
  const since = t - COUNTDOWN_SECONDS
  const k = Math.floor(since / GUSTS.every)
  const d = since - k * GUSTS.every
  if (k < 1 || d > GUSTS.last) {
    out.x = out.z = 0
    return 0
  }
  const strength = Math.sin((Math.PI * d) / GUSTS.last)
  const a = k * GOLDEN
  out.x = Math.sin(a) * GUSTS.push * strength
  out.z = Math.cos(a) * GUSTS.push * strength
  return strength
}
export function gustDirection(t: number) {
  const k = Math.floor((t - COUNTDOWN_SECONDS) / GUSTS.every)
  return k * GOLDEN
}
// Seconds until the next gust begins
export function nextGustIn(t: number) {
  const since = t - COUNTDOWN_SECONDS
  const k = Math.max(1, Math.floor(since / GUSTS.every) + 1)
  return k * GUSTS.every - since
}
