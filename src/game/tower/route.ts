import type { P3, Route } from '../race/bots/route'
import { BRIDGE, BUMPER_STAIRS, FINISH_Z, PILLARS, RAMPS, RAMP_WIDTH, ROLLERS, SPAWN, START_ISLAND, TIERS } from './course'

// The bots' way up the tower (see ../race/bots): over the pillars to the plaza, up the three switchbacks,
// across the cannon bridge, up the stairs and through the bumpers, over the rollers and across the summit.
//
// On the switchbacks they keep hard against the wall of the tier above: a boulder rolls down the middle of the
// ramp with just room for a runner between it and the wall.

// Twenty start spots on the island, four rows of five (the player has the middle of the second row)
const START_Y = START_ISLAND.max[1] + 1.3
export const BOT_STARTS: P3[] = [37.6, 40, 42.4, 44.8].flatMap((z) =>
  [-5.6, -2.8, 0, 2.8, 5.6].filter((x) => !(x === SPAWN[0] && z === SPAWN[2])).map((x): P3 => [x, START_Y, z]),
)
export const botLane = (start: P3) => start[0] / 5.6

const AT_WALL = RAMP_WIDTH / 2 - 0.56 // how far from a ramp's middle its wall-side edge runs

// One switchback. Its low end is where the boulders run off, so they don't go that way: they come at it from
// the open side, a little way up (where it's still low enough to hop onto), cross to the wall between
// boulders, and run up along the wall. Knocked off, they go back to the open side for another go.
function switchback(i: number, resume?: number): Route {
  const { top, bottom } = RAMPS[i]
  const side = Math.sign(bottom[0]) // which end its foot is at
  const wall = bottom[2] - AT_WALL
  const heightAt = (x: number) => bottom[1] + ((top[1] - bottom[1]) * (x - bottom[0])) / (top[0] - bottom[0])
  // (It stops just short of the ramp's top end, which is open: the way on is sideways, onto the tier)
  const upTo = -side * 8.7
  return [
    { at: [side * 7.5, bottom[1], bottom[2] + RAMP_WIDTH / 2 + 1.2], spread: 1.1, r: 1.2, retry: true, ...(resume === undefined ? {} : { resume }) },
    { at: [side * 5, heightAt(side * 5), wall], r: 1, tight: true },
    { at: [upTo, heightAt(upTo), wall], r: 0.9, tight: true, back: true },
  ]
}

const deck = BRIDGE.max[1]
const bumpers = TIERS.bumpers.max[1]
const summit = TIERS.summit.max[1]

export const TOWER_ROUTE: Route = [
  ...PILLARS.map(([x, z, top], i) => ({ at: [x, top, z] as P3, r: 0.75, ...(i === 0 ? { resume: 0 } : {}) })),
  { at: [-4, TIERS.plaza.max[1], 11.5], r: 1.6 },
  ...switchback(0, 1),
  ...switchback(1),
  ...switchback(2),
  { at: [0, deck, -15.2], r: 1.2, resume: 2 },
  { at: [0, deck, BRIDGE.min[2] - 1.4], spread: 1.6 },
  { at: [BUMPER_STAIRS.to[0], bumpers, BUMPER_STAIRS.to[2] - 1.2], spread: 1.8, resume: 3 },
  { at: [0, bumpers, -54.9], spread: 4, r: 1.1 },
  ...ROLLERS.map((r, i) => ({ at: [0, r.top, r.z] as P3, spread: 2.4, r: 0.7, ...(i === 0 ? { resume: 4 } : {}) })),
  { at: [0, summit, -70.5], spread: 3, resume: 5 },
  { at: [0, summit, FINISH_Z - 1.2], spread: 2.4 },
  // Over the line: to the back of the summit
  { at: [0, summit, TIERS.summit.min[2] + 1.4], spread: 6, r: 1 },
]
