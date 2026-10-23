import { CRACKED, ICE, SHATTERING, TILES, TOUCH_COST } from './course'

// What's become of the ice this round: shared by the arena (which cracks and breaks it, and draws it), the
// bots (which pick where to land by it) and the referee. Times are on the match clock.

export const ice = new Float32Array(TILES.length) // seconds of standing on it left: through at 0
export const brokeAt = new Float64Array(TILES.length) // when it broke (Infinity: it hasn't)
// What each runner (by body handle) stood on last physics step: a tile, or -1 (in the air)
const under = new Map<number, number>()

// How the round turned out: over (everyone stops where they are), and if so whether by being the last one
// standing, and who that was
export const round = { over: false, lastStanding: false, winner: null as string | null }

export function resetIce() {
  ice.fill(ICE)
  brokeAt.fill(Infinity)
  under.clear()
  round.over = false
  round.lastStanding = false
  round.winner = null
}
resetIce()

export const solid = (i: number) => brokeAt[i] === Infinity
// 0 whole, 1 cracked, 2 badly cracked
export const stage = (i: number) => (ice[i] >= CRACKED ? 0 : ice[i] >= SHATTERING ? 1 : 2)

// A runner on a tile (or -1, on none) for one physics step of `dt`: coming onto it (or down on it) cracks it
// at once, standing on it a little at a time. Whether it broke.
export function standOn(handle: number, tile: number, dt: number) {
  const before = under.get(handle) ?? -1
  under.set(handle, tile)
  if (tile < 0 || round.over || !solid(tile)) return false
  ice[tile] -= tile === before ? dt : TOUCH_COST
  return ice[tile] <= 0
}

export function breakTile(i: number, t: number) {
  ice[i] = 0
  brokeAt[i] = t
}

// The round's over: whatever's still there stays there
export function endRound(lastStanding: boolean, winner: string | null) {
  round.over = true
  round.lastStanding = lastStanding
  round.winner = winner
}
