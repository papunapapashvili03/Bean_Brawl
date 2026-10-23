import { PLATE, PLATES, TILES, TOUCH_DELAY, layerTop } from './course'

// What's become of the tiles this round: shared by the arena (which drops them, and draws them), the bots
// (which pick where to go by them) and the referee. Times are on the match clock.

export const gone = new Uint8Array(TILES.length) // plates each tile has lost
export const fallAt = new Float64Array(TILES.length) // when its top plate drops, once it's been stood on
export const droppedAt = new Float64Array(PLATES.length) // when each plate dropped (for its fall)
const going: number[] = [] // tiles stood on whose top plate hasn't dropped yet

// How the round turned out: over (everyone stops where they are), and if so whether by being the last one
// standing, and who that was
export const round = { over: false, lastStanding: false, winner: null as string | null }

export function resetTiles() {
  gone.fill(0)
  fallAt.fill(Infinity)
  droppedAt.fill(Infinity)
  going.length = 0
  round.over = false
  round.lastStanding = false
  round.winner = null
}
resetTiles()

export const solid = (i: number) => gone[i] < TILES[i].plates
// Its top (lower, the more of a stack's plates have gone)
export const topOf = (i: number) => layerTop(TILES[i].layer) - gone[i] * PLATE
// Not stood on yet: there for as long as nobody stands on it
export const fresh = (i: number) => solid(i) && fallAt[i] === Infinity
export const goingTiles = (): readonly number[] => going

// Somebody's standing on it: its top plate drops a moment from now (if it isn't already about to)
export function touch(i: number, t: number) {
  if (round.over || !fresh(i)) return false
  fallAt[i] = t + TOUCH_DELAY
  going.push(i)
  return true
}

// Drops every plate whose time has come, telling `drop` which
export function settle(t: number, drop: (plate: number) => void) {
  if (round.over) return
  for (let k = going.length - 1; k >= 0; k--) {
    const i = going[k]
    if (fallAt[i] > t) continue
    const plate = TILES[i].first + gone[i]
    droppedAt[plate] = fallAt[i]
    gone[i]++
    fallAt[i] = Infinity
    going.splice(k, 1)
    drop(plate)
  }
}

// The round's over: whatever's been stood on stays put now
export function endRound(lastStanding: boolean, winner: string | null) {
  round.over = true
  round.lastStanding = lastStanding
  round.winner = winner
  for (const i of going) fallAt[i] = Infinity
  going.length = 0
}
