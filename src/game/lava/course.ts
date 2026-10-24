import { COUNTDOWN_SECONDS, type RaceCourse } from '../race/race'

// Floor is Lava: a field of stone pillars standing up out of a sea of lava. The pillars never keep still:
// each in its own time rises or sinks to a new height, and now and then one glows red and sinks right under
// for a few seconds before coming back up. And every so often the tide comes in: the lava rises, swallowing
// whatever's left standing low. Keep hopping to pillars that are high enough and staying up. Touch the lava
// and you're out. The last one standing wins; if more than one is still standing after three minutes, they all
// do.
//
// Units are metres. The pillars are hexagons (pointy towards ±z) on a hex grid, four rings round a middle one,
// the lava starting at y 0.

type Point = [number, number, number]

const RUN = COUNTDOWN_SECONDS
export const ROUND = 180 // seconds from RUN until whoever's still standing wins
export const END = RUN + ROUND

export const HEX = 1.5 // a pillar's corner radius (the grid's)
export const SPACING = Math.sqrt(3) * HEX // between neighbours' middles
export const RINGS = 4
export const DEPTH = 16 // how far a pillar reaches down from its top (always on down into the lava)

// The lava: its level at the start, and its tides (each comes in over TIDE_TIME, the callout TIDE_WARN before)
export const LAVA_START = 0
export const TIDE_FIRST = RUN + 20
export const TIDE_EVERY = 22
export const TIDE_RISE = 0.6
export const TIDE_TIME = 3
export const TIDE_WARN = 3

// In the lava: the body's middle lower than this over the surface (feet a little way under)
export const IN_LAVA = 0.85

// Pillars
export const START_TOP = 1.4 // over the lava, at the start (give or take a little)
export const BAND = { low: 0.8, high: 2.2 } // a pillar moving to a new height goes this far over the lava (as it'll be)
export const SPEED = 1.4 // how fast a pillar rises and sinks (m/s)
export const SINK_WARN = 1.5 // a pillar about to sink glows this long first
export const SINK_DEPTH = 2.5 // ...and goes this far under the lava

// ---------------------------------------------------------------------------------------------------------
// The pillars: axial (q, r) on the grid, their middles, and the ones round each

export type Pillar = { q: number; r: number; x: number; z: number; ring: number; around: number[] }
export const PILLARS: Pillar[] = []
const index = new Map<string, number>()
for (let r = -RINGS; r <= RINGS; r++) {
  for (let q = -RINGS; q <= RINGS; q++) {
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
    if (ring > RINGS) continue
    index.set(`${q},${r}`, PILLARS.length)
    PILLARS.push({ q, r, x: SPACING * (q + r / 2), z: 1.5 * HEX * r, ring, around: [] })
  }
}
export const pillarAt = (q: number, r: number) => index.get(`${q},${r}`) ?? -1
const STEPS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
]
for (const p of PILLARS) for (const [dq, dr] of STEPS) {
  const n = pillarAt(p.q + dq, p.r + dr)
  if (n >= 0) p.around.push(n)
}

// The pillar a point's over (or -1, off the edge): rounding to the nearest hex
export function pillarUnder(x: number, z: number) {
  const r = z / (1.5 * HEX)
  const q = x / SPACING - r / 2
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(-q - r)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - (-q - r))
  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds) rr = -rq - rs
  return pillarAt(rq, rr)
}

// ---------------------------------------------------------------------------------------------------------
// Start, spectators, the course

// Sixteen start spots on pillars of the second and third rings; yours the one nearest +z
export const SPAWN_PILLARS = PILLARS.map((p, i) => ({ p, i }))
  .filter(({ p }) => p.ring === 2 || (p.ring === 3 && (p.q + 2 * p.r) % 3 === 0))
  .sort((a, b) => b.p.z - a.p.z || a.p.x - b.p.x)
  .slice(0, 16)
  .map(({ i }) => i)
export const PLAYER_SLOT = 0
export const spawnOn = (i: number): Point => [PILLARS[i].x, START_TOP + 1.4, PILLARS[i].z]
export const SPAWNS = SPAWN_PILLARS.map(spawnOn)

export const SPECTATOR: Point = [26, 10, 22]

export const LAVA_COURSE: RaceCourse = {
  spawn: SPAWNS[PLAYER_SLOT],
  sections: ['Floor is Lava'],
  checkpoints: [],
  // Never crossed: the round is won by being the last one standing (or still standing at the end)
  finish: { min: [1, 1, 1], max: [-1, -1, -1] },
  finishTitle: 'Survived',
  survival: true,
  hint: "Pillars rise and sink, and the tide keeps coming in · Don't touch the lava · Last one standing wins · Space to jump · Drag or Q/E to turn the camera",
}
