import { COUNTDOWN_SECONDS } from '../race/race'
import { DROP_EVERY, DROP_WARN, FIRST_DROP, KEEP, SECTIONS, SWAY, SWAY_RATE, spinAt, turned } from './course'

// This round: where the beams are at any moment (they stop when the round's decided), which sections drop
// and when, and how it turned out. Shared by the arena, the bots and the referee. Times are on the match clock.

const RUN = COUNTDOWN_SECONDS

// How the round turned out: over (everyone stops where they are, the beams too), and if so whether by being
// the last one standing, and who that was
export const round = { over: false, lastStanding: false, winner: null as string | null, stopAt: Infinity }

// The sections, in the order they drop (the last KEEP never do), and when each goes (Infinity: it doesn't)
export const dropAt = new Float64Array(SECTIONS)
export const dropped = new Uint8Array(SECTIONS)

export function resetJump() {
  round.over = false
  round.lastStanding = false
  round.winner = null
  round.stopAt = Infinity
  const order = Array.from({ length: SECTIONS }, (_, s) => s).sort(() => Math.random() - 0.5)
  dropAt.fill(Infinity)
  dropped.fill(0)
  order.slice(0, SECTIONS - KEEP).forEach((s, k) => (dropAt[s] = RUN + FIRST_DROP + k * DROP_EVERY))
}
resetJump()

// A section about to drop (flashing), and one that's gone (or going)
export const warned = (s: number, t: number) => !dropped[s] && t >= dropAt[s] - DROP_WARN && !round.over
export const gone = (s: number) => dropped[s] === 1

export function endRound(lastStanding: boolean, winner: string | null, t: number) {
  round.over = true
  round.lastStanding = lastStanding
  round.winner = winner
  round.stopAt = t
}

// ---------------------------------------------------------------------------------------------------------
// The beams: how far each has turned by t, and how fast it's turning

const since = (t: number) => Math.max(0, Math.min(t, round.stopAt) - RUN)
export const lowAngle = (t: number) => turned(since(t))
export const highAngle = (t: number) => Math.PI / 2 + turned(since(t)) + SWAY * Math.sin(SWAY_RATE * since(t))
export const lowSpin = (t: number) => (t >= round.stopAt ? 0 : spinAt(since(t)))
export function highSpin(t: number) {
  const w = lowSpin(t)
  return w && w + SWAY * SWAY_RATE * Math.cos(SWAY_RATE * since(t))
}
