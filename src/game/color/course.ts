import { COUNTDOWN_SECONDS, type RaceCourse } from '../race/race'

// Color Call: one square floor of coloured tiles out over the clouds. The floor's shown in a pattern of
// colours; then a colour's called, and a moment later every tile that isn't that colour drops away. Be on
// the colour called, or fall and be out. The floor comes back in a new pattern, and the next call comes,
// with less time to get there and, as the patterns get busier, further to go. The last one standing wins; if
// more than one is still standing after five minutes, they all do.
//
// Units are metres. The floor is 14 by 14 tiles, 2 m square, its top at y 0, centred on the y axis.

type Point = [number, number, number]

const RUN = COUNTDOWN_SECONDS
export const ROUND = 300 // seconds from RUN until whoever's still standing wins
export const END = RUN + ROUND

export const GRID = 14
export const TILE = 2
export const THICK = 0.5
export const SPAN = GRID * TILE // the floor's width

// Below this is out
export const OUT_Y = -6

// The colours a floor's made of (each pattern uses some of them), by name, with the ink to write on each
export const PALETTE = [
  { name: 'Red', colour: '#ff4d5e', ink: '#ffffff' },
  { name: 'Orange', colour: '#ff9a3c', ink: '#3a1d00' },
  { name: 'Yellow', colour: '#ffe23f', ink: '#3a3000' },
  { name: 'Lime', colour: '#a6e84a', ink: '#1d3300' },
  { name: 'Green', colour: '#22a85a', ink: '#ffffff' },
  { name: 'Cyan', colour: '#4fd8f0', ink: '#00323a' },
  { name: 'Blue', colour: '#3a62ff', ink: '#ffffff' },
  { name: 'Purple', colour: '#9a5cff', ink: '#ffffff' },
  { name: 'Pink', colour: '#ff8fd0', ink: '#3a0026' },
  { name: 'White', colour: '#f6f6fa', ink: '#2b2d3a' },
]

// ---------------------------------------------------------------------------------------------------------
// How the calls go: call n (from 0) shows its pattern for lookTime(n), then gives callTime(n) from the call
// until the rest of the floor drops; the floor stays down GONE_FOR, then takes BACK_TIME to come back up, in
// the next pattern. Every colour's in small patches all over, so there's always some of it not far off;
// but each pattern has more colours than the last, in smaller patches, so less of the floor's the colour
// called; and there's less time to get to it.

export const lookTime = (n: number) => Math.max(1.2, 2 - 0.08 * n)
// (Down to 0.8 s or so by the twelfth call; then a little less each time, until it's settled)
export const callTime = (n: number) => Math.max(0.5, n <= 11 ? 2.6 * 0.9 ** n : 0.82 - 0.025 * (n - 11))
export const coloursIn = (n: number) => Math.min(PALETTE.length, 4 + n)
export const patchesIn = (n: number) => Math.round(30 * 1.35 ** n) // (once there are more than tiles, every tile's its own)
export const GONE_FOR = 1.6
export const BACK_TIME = 0.6

// ---------------------------------------------------------------------------------------------------------
// The tiles

export type Tile = { i: number; j: number; x: number; z: number }
const centre = (k: number) => (k - GRID / 2 + 0.5) * TILE
export const TILES: Tile[] = []
for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) TILES.push({ i, j, x: centre(i), z: centre(j) })

export const tileAt = (i: number, j: number) => (i < 0 || j < 0 || i >= GRID || j >= GRID ? -1 : j * GRID + i)
export const tileUnder = (x: number, z: number) => tileAt(Math.floor(x / TILE + GRID / 2), Math.floor(z / TILE + GRID / 2))

// The corners where tiles meet (where four colours can be near at hand), the floor's edge included
export const CORNERS: { x: number; z: number }[] = []
for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) CORNERS.push({ x: (i - GRID / 2) * TILE, z: (j - GRID / 2) * TILE })

// How far a point is from the nearest bit of a tile (0 on it)
export function offTile(t: Tile, x: number, z: number) {
  return Math.hypot(Math.max(0, Math.abs(x - t.x) - TILE / 2), Math.max(0, Math.abs(z - t.z) - TILE / 2))
}

// ---------------------------------------------------------------------------------------------------------
// Start, spectators, the course

// Sixteen start spots, four by four across the middle of the floor; yours the one nearest +z, on the left
const ROWS = [-7, -3, 3, 7]
export const SPAWNS: Point[] = ROWS.flatMap((z) => ROWS.map((x): Point => [x, 1.3, z])).sort((a, b) => b[2] - a[2] || a[0] - b[0])
export const PLAYER_SLOT = 1

export const SPECTATOR: Point = [27, 5, 22]

export const COLOR_COURSE: RaceCourse = {
  spawn: SPAWNS[PLAYER_SLOT],
  sections: ['Color Call'],
  checkpoints: [],
  // Never crossed: the round is won by being the last one standing (or still standing at the end)
  finish: { min: [1, 1, 1], max: [-1, -1, -1] },
  finishTitle: 'Survived',
  survival: true,
  hint: 'Watch for the colour called, then get on it: every other tile drops · Each call comes quicker · Last one standing wins · Space to jump · Drag or Q/E to turn the camera',
}
