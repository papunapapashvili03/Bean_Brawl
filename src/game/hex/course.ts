import { COUNTDOWN_SECONDS, type RaceCourse } from '../race/race'

// Hexagon: eight floors of hexagonal tiles, one above another, high in the sky. A tile you stand on lights
// up and drops away a moment later, so you have to keep moving; when there's nothing left under you, you
// fall to the floor below, and through the bottom one you're out. The last one standing wins. If more than
// one is still standing after five minutes, they all do.
//
// Units are metres. Each floor is a honeycomb of 169 tiles (one in the middle and seven rings round it),
// pointy side towards ±z, centred on the y axis. Floors are numbered from the bottom: layer 0's top is at
// y 0, layer 7 (the top, where everyone starts) is 7 * GAP up. Along the edge some tiles are stacks of two
// or three plates: when the top one drops, there's another just below it.

type Point = [number, number, number]

const RUN = COUNTDOWN_SECONDS
export const ROUND = 300 // seconds from RUN until whoever's still standing wins
export const END = RUN + ROUND

export const LAYERS = 8
export const TOP_LAYER = LAYERS - 1
export const RINGS = 7
export const GAP = 6.5 // from one floor's top to the next: too far to jump back up, near enough to see down
export const layerTop = (layer: number) => layer * GAP

export const HEX = 1.45 // a tile's corner radius
export const SPACING = HEX * Math.sqrt(3) // between neighbouring tiles' middles
export const INRADIUS = SPACING / 2
export const PLATE = 0.5 // a tile's thickness (a stacked one's, each plate's)
export const TOUCH_DELAY = 0.75 // seconds from first being stood on until a tile drops

// Below the bottom floor (and its stacks) is out
export const OUT_Y = -8

// Each floor's colour, bottom to top
export const LAYER_COLOURS = ['#9a6bff', '#5f7cff', '#3fb5ff', '#2fc4a2', '#8fd94f', '#ffd23f', '#ff9f43', '#ff5c8a']

// ---------------------------------------------------------------------------------------------------------
// The tiles

export type Tile = {
  layer: number
  q: number // axial coordinates in its floor's honeycomb
  r: number
  x: number
  z: number
  plates: number // 1, or 2 or 3 for a stack
  first: number // its top plate's index in PLATES (the rest follow, going down)
  around: number[] // its neighbours on the same floor
  near: number[] // and every tile within two of it
}
export type Plate = { tile: number; level: number } // level 0 is a stack's top plate

const AXES: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
]
const hexDistance = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
const SIZE = 2 * RINGS + 1
const lookup = new Int32Array(LAYERS * SIZE * SIZE).fill(-1)
const slot = (layer: number, q: number, r: number) => (layer * SIZE + (r + RINGS)) * SIZE + (q + RINGS)

// On the outer ring the six corners are stacks of two, and the two tiles in the middle of each side stacks
// of three: 199 plates to a floor
function platesAt(q: number, r: number) {
  if (hexDistance(q, r) < RINGS) return 1
  const [a, b] = [Math.abs(q), Math.abs(r), Math.abs(q + r)].sort((m, n) => m - n)
  if (b === RINGS) return 2
  return a === 3 ? 3 : 1
}

export const TILES: Tile[] = []
export const PLATES: Plate[] = []
for (let layer = 0; layer < LAYERS; layer++) {
  for (let r = -RINGS; r <= RINGS; r++) {
    for (let q = -RINGS; q <= RINGS; q++) {
      if (hexDistance(q, r) > RINGS) continue
      const index = TILES.length
      const plates = platesAt(q, r)
      lookup[slot(layer, q, r)] = index
      TILES.push({ layer, q, r, x: SPACING * (q + r / 2), z: 1.5 * HEX * r, plates, first: PLATES.length, around: [], near: [] })
      for (let level = 0; level < plates; level++) PLATES.push({ tile: index, level })
    }
  }
}

// The tile at (q, r) on a floor, or -1
export function tileAt(layer: number, q: number, r: number) {
  if (layer < 0 || layer >= LAYERS || hexDistance(q, r) > RINGS) return -1
  return lookup[slot(layer, q, r)]
}

for (const tile of TILES) {
  for (const [dq, dr] of AXES) {
    const n = tileAt(tile.layer, tile.q + dq, tile.r + dr)
    if (n >= 0) tile.around.push(n)
  }
  for (let dr = -2; dr <= 2; dr++) {
    for (let dq = -2; dq <= 2; dq++) {
      const d = hexDistance(dq, dr)
      if (d < 1 || d > 2) continue
      const n = tileAt(tile.layer, tile.q + dq, tile.r + dr)
      if (n >= 0) tile.near.push(n)
    }
  }
}

// The tile of a floor whose hexagon (x, z) is in, or -1 if it's off the floor
export function tileUnder(layer: number, x: number, z: number) {
  const fr = z / (1.5 * HEX)
  const fq = x / SPACING - fr / 2
  const fs = -fq - fr
  let q = Math.round(fq)
  let r = Math.round(fr)
  const s = Math.round(fs)
  const dq = Math.abs(q - fq)
  const dr = Math.abs(r - fr)
  const ds = Math.abs(s - fs)
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  return tileAt(layer, q, r)
}

// Which floor someone with their feet at this height is on (or, falling, is coming down to)
export const layerOf = (feet: number) => Math.max(0, Math.min(TOP_LAYER, Math.floor((feet + 1.8) / GAP)))

// ---------------------------------------------------------------------------------------------------------
// Start, spectators, the course

// Eighteen start spots on the top floor, on the third ring of tiles, round from the one nearest +z
export const SPAWNS: Point[] = TILES.filter((t) => t.layer === TOP_LAYER && hexDistance(t.q, t.r) === 3)
  .sort((a, b) => Math.abs(Math.atan2(a.x, a.z)) - Math.abs(Math.atan2(b.x, b.z)) || a.x - b.x)
  .map((t): Point => [t.x, layerTop(TOP_LAYER) + 1.3, t.z])
export const PLAYER_SLOT = 0

export const SPECTATOR: Point = [36, 24, 30]

export const HEX_COURSE: RaceCourse = {
  spawn: SPAWNS[PLAYER_SLOT],
  sections: ['Hexagon'],
  checkpoints: [],
  // Never crossed: the round is won by being the last one standing (or still standing at the end)
  finish: { min: [1, 1, 1], max: [-1, -1, -1] },
  finishTitle: 'Survived',
  survival: true,
  hint: 'Tiles drop away once stood on · Hop from tile to tile to make them last · Last one standing wins · Space to jump · Drag or Q/E to turn the camera',
}
