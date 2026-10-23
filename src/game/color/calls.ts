import { COUNTDOWN_SECONDS } from '../race/race'
import { BACK_TIME, CORNERS, GONE_FOR, PALETTE, SPAN, TILES, callTime, coloursIn, lookTime, offTile, patchesIn } from './course'

// The calls this round: which pattern the floor's in, which colour's been called, which tiles are down, and
// when it all moves on. Shared by the arena (which drops the tiles and draws them), the bots (which go by
// it) and the referee. Times are on the match clock.

// 'look': the pattern's shown; 'call': a colour's called; 'gone': the rest has dropped; 'back': it's coming
// back up, in the next pattern
export type Phase = 'look' | 'call' | 'gone' | 'back'

export const floor = {
  n: 0, // which call this is (from 0)
  phase: 'look' as Phase,
  since: 0, // when this phase began
  until: COUNTDOWN_SECONDS + lookTime(0), // and when it ends
  called: -1, // the colour called (an index into PALETTE), from the call until the floor's back
  colours: new Uint8Array(TILES.length), // each tile's colour, in the pattern showing
  inUse: [] as number[], // the colours in it
  // For each corner where tiles meet (../course CORNERS): how far, on average over the colours in use, to
  // the nearest tile of that colour. Somewhere good to wait for the call is somewhere this is small.
  cover: new Float32Array(CORNERS.length),
}
export const down = new Uint8Array(TILES.length) // dropped (until the floor's back)

// How the round turned out: over (everyone stops where they are), and if so whether by being the last one
// standing, and who that was
export const round = { over: false, lastStanding: false, winner: null as string | null }

export function resetCalls() {
  floor.n = 0
  floor.phase = 'look'
  floor.since = 0
  floor.until = COUNTDOWN_SECONDS + lookTime(0)
  floor.called = -1
  down.fill(0)
  makePattern(0)
  round.over = false
  round.lastStanding = false
  round.winner = null
}

export const solid = (i: number) => down[i] === 0

// What happens as the calls move on (for the arena: sounds, colliders, the HUD)
export type CallEvents = { call: () => void; drop: () => void; back: () => void; up: () => void }

// Moves the calls on to time t. (Once the round's over there are no more: the floor stays as it is, only
// finishing coming back up if it was on its way.)
export function advanceCalls(t: number, on: CallEvents) {
  while (t >= floor.until) {
    if (round.over && floor.phase !== 'back') return
    floor.since = floor.until
    if (floor.phase === 'look') {
      floor.phase = 'call'
      floor.called = pickCall()
      floor.until += callTime(floor.n)
      on.call()
    } else if (floor.phase === 'call') {
      floor.phase = 'gone'
      for (let i = 0; i < TILES.length; i++) down[i] = floor.colours[i] === floor.called ? 0 : 1
      floor.until += GONE_FOR
      on.drop()
    } else if (floor.phase === 'gone') {
      floor.phase = 'back'
      floor.n++
      makePattern(floor.n)
      floor.until += BACK_TIME
      on.back()
    } else {
      floor.phase = 'look'
      floor.called = -1
      down.fill(0)
      floor.until = round.over ? Infinity : floor.until + lookTime(floor.n)
      on.up()
    }
  }
}

// The round's over
export function endRound(lastStanding: boolean, winner: string | null) {
  round.over = true
  round.lastStanding = lastStanding
  round.winner = winner
}

// ---------------------------------------------------------------------------------------------------------

// Which colour to call: any in the pattern (with a few tiles of it at least, if there are such)
function pickCall() {
  const count = new Map<number, number>()
  for (const c of floor.colours) count.set(c, (count.get(c) ?? 0) + 1)
  const fair = floor.inUse.filter((c) => (count.get(c) ?? 0) >= 3)
  const from = fair.length ? fair : floor.inUse
  return from[Math.floor(Math.random() * from.length)]
}

// A new pattern: patches of colour round scattered seeds, more colours and smaller patches the further on
function makePattern(n: number) {
  const pool = PALETTE.map((_, k) => k).sort(() => Math.random() - 0.5)
  const colours = pool.slice(0, coloursIn(n))
  const seeds = Math.min(patchesIn(n), TILES.length)
  const at: { x: number; z: number; c: number }[] = []
  const half = SPAN / 2
  for (let k = 0; k < seeds; k++) {
    at.push({ x: (Math.random() * 2 - 1) * half, z: (Math.random() * 2 - 1) * half, c: k < colours.length ? colours[k] : colours[Math.floor(Math.random() * colours.length)] })
  }
  TILES.forEach((t, i) => {
    let best = 0
    let nearest = Infinity
    for (let k = 0; k < at.length; k++) {
      const d = (at[k].x - t.x) ** 2 + (at[k].z - t.z) ** 2
      if (d < nearest) {
        nearest = d
        best = k
      }
    }
    // (Every tile its own patch, by the end: then just any colour)
    floor.colours[i] = seeds >= TILES.length ? colours[Math.floor(Math.random() * colours.length)] : at[best].c
  })
  floor.inUse = colours.filter((c) => floor.colours.includes(c))

  // How well placed each corner is for whatever's called
  const nearestOf = new Map<number, number>()
  CORNERS.forEach((corner, k) => {
    nearestOf.clear()
    TILES.forEach((t, i) => {
      const d = offTile(t, corner.x, corner.z)
      const c = floor.colours[i]
      if (d < (nearestOf.get(c) ?? Infinity)) nearestOf.set(c, d)
    })
    let sum = 0
    for (const c of floor.inUse) sum += nearestOf.get(c) ?? 30
    floor.cover[k] = sum / floor.inUse.length
  })
}
resetCalls()
