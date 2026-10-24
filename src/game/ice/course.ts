import { COUNTDOWN_SECONDS, type RaceCourse } from '../race/race'

// Crack Up: three round floors of square ice tiles, one above another, out over the clouds. Ice cracks under
// your weight: every time you land on (or step onto) a tile it cracks a little, and standing on it cracks it
// all the while, so a tile you stand still on is through in a second. Hop, and every hop costs it only a
// little. Through a broken tile you drop to the floor below, and through the bottom one you're out. The last
// one standing wins; if more than one is still standing after five minutes, they all do.
//
// Units are metres. Each floor is a disc of 148 tiles, 2 m square, on a grid centred on the y axis; floors
// are numbered from the bottom, layer 0's top at y 0, layer 2 (the top, where everyone starts) 2 * GAP up.

type Point = [number, number, number]

const RUN = COUNTDOWN_SECONDS
export const ROUND = 300 // seconds from RUN until whoever's still standing wins
export const END = RUN + ROUND

export const LAYERS = 3
export const TOP_LAYER = LAYERS - 1
export const GAP = 7 // from one floor's top to the next: too far to jump back up
export const layerTop = (layer: number) => layer * GAP

export const TILE = 2 // grid spacing (a tile's side, edge to edge with its neighbours)
export const CELLS = 14 // across the grid (the corners of it are left out, for a round floor)
export const RADIUS = 13.6 // tiles with their middles further out than this aren't there
export const THICK = 0.4

// How much a tile takes: seconds of standing on it (by anyone), and how much of that a touch costs at once
export const ICE = 1
export const TOUCH_COST = 0.2
// A tile looks cracked below this much ice left, and badly cracked below this
export const CRACKED = 0.7
export const SHATTERING = 0.45

// Below the bottom floor is out
export const OUT_Y = -8

// Each floor's ice, bottom to top
export const LAYER_COLOURS = ['#6fb8ff', '#8fd3ff', '#b8ecff']

// ---------------------------------------------------------------------------------------------------------
// The tiles

export type Tile = {
  layer: number
  i: number // its column and row in the grid
  j: number
  x: number
  z: number
  around: number[] // its eight neighbours on the same floor (those there are)
  region: number[] // and every tile within three of it, itself included
}

const lookup = new Int32Array(LAYERS * CELLS * CELLS).fill(-1)
const slot = (layer: number, i: number, j: number) => (layer * CELLS + j) * CELLS + i
const centre = (k: number) => (k - CELLS / 2 + 0.5) * TILE

export const TILES: Tile[] = []
for (let layer = 0; layer < LAYERS; layer++) {
  for (let j = 0; j < CELLS; j++) {
    for (let i = 0; i < CELLS; i++) {
      const x = centre(i)
      const z = centre(j)
      if (Math.hypot(x, z) > RADIUS) continue
      lookup[slot(layer, i, j)] = TILES.length
      TILES.push({ layer, i, j, x, z, around: [], region: [] })
    }
  }
}

// The tile at (i, j) on a floor, or -1
export function tileAt(layer: number, i: number, j: number) {
  if (layer < 0 || layer >= LAYERS || i < 0 || j < 0 || i >= CELLS || j >= CELLS) return -1
  return lookup[slot(layer, i, j)]
}

for (const tile of TILES) {
  for (let dj = -3; dj <= 3; dj++) {
    for (let di = -3; di <= 3; di++) {
      const n = tileAt(tile.layer, tile.i + di, tile.j + dj)
      if (n < 0) continue
      tile.region.push(n)
      if (Math.max(Math.abs(di), Math.abs(dj)) === 1) tile.around.push(n)
    }
  }
}

// The tile of a floor whose square (x, z) is over, or -1 if it's off the floor
export const tileUnder = (layer: number, x: number, z: number) =>
  tileAt(layer, Math.floor(x / TILE + CELLS / 2), Math.floor(z / TILE + CELLS / 2))

// Which floor someone with their feet at this height is on (or, falling, is coming down to)
export const layerOf = (feet: number) => Math.max(0, Math.min(TOP_LAYER, Math.floor((feet + 1.8) / GAP)))

// ---------------------------------------------------------------------------------------------------------
// Start, spectators, the course

// Sixteen start spots on the top floor, in a ring round the middle, starting from the one nearest +z
const STARTS = 16
const START_RING = 7.5
export const SPAWNS: Point[] = Array.from({ length: STARTS }, (_, k) => {
  const a = (2 * Math.PI * (k + 0.5)) / STARTS
  const t = TILES[tileUnder(TOP_LAYER, Math.sin(a) * START_RING, Math.cos(a) * START_RING)]
  return [t.x, layerTop(TOP_LAYER) + 1.3, t.z]
})
export const PLAYER_SLOT = 0

export const SPECTATOR: Point = [32, 12, 26]

export const ICE_COURSE: RaceCourse = {
  spawn: SPAWNS[PLAYER_SLOT],
  sections: ['Crack Up'],
  checkpoints: [],
  // Never crossed: the round is won by being the last one standing (or still standing at the end)
  finish: { min: [1, 1, 1], max: [-1, -1, -1] },
  finishTitle: 'Survived',
  survival: true,
  hint: "Ice cracks under you, and gives way if you stand still · Keep hopping, and don't land on cracked ice · Last one standing wins · Space to jump · Drag or Q/E to turn the camera",
}
