import { COUNTDOWN_SECONDS, type RaceCourse } from '../race/race'

// Pattern Panic: one square floor of tiles out over the clouds, struck in waves. Each wave's a pattern (lines,
// a checkerboard, rings, quarters, crosses, a sweep with a gap in it, ripples, a scatter): the tiles it'll
// strike light up, yellow going red, and then drop away for a moment and come back up. Be on one when it
// drops and you fall, and you're out. Every wave gives a little less warning. The last one standing wins; if
// more than one is still standing after five minutes, they all do.
//
// Units are metres. The floor is 12 by 12 tiles, 2 m square, its top at y 0, centred on the y axis.

type Point = [number, number, number]

const RUN = COUNTDOWN_SECONDS
export const ROUND = 300 // seconds from RUN until whoever's still standing wins
export const END = RUN + ROUND

export const GRID = 12
export const TILE = 2
export const THICK = 0.5
export const SPAN = GRID * TILE

// A struck tile drops for DOWN seconds, then takes RISE to come back up (it's not there to stand on till then)
export const DOWN = 1
export const RISE = 0.3
export const GONE = DOWN + RISE

// How much warning wave n gives, from the tiles lighting up until they drop
export const warnTime = (n: number) => Math.max(0.95, 2.2 * 0.95 ** n)
export const FIRST_WAVE = RUN + 1.2 // when the first wave lights up
export const BETWEEN = GONE / 2 // from a wave's last strike until the next lights up

// Below this is out
export const OUT_Y = -6

// ---------------------------------------------------------------------------------------------------------
// The tiles

export type Tile = { i: number; j: number; x: number; z: number; ring: number; around: number[] }
const centre = (k: number) => (k - GRID / 2 + 0.5) * TILE
export const tileAt = (i: number, j: number) => (i < 0 || j < 0 || i >= GRID || j >= GRID ? -1 : j * GRID + i)
export const tileUnder = (x: number, z: number) => tileAt(Math.floor(x / TILE + GRID / 2), Math.floor(z / TILE + GRID / 2))

export const TILES: Tile[] = []
for (let j = 0; j < GRID; j++) {
  for (let i = 0; i < GRID; i++) {
    // (Its ring: how far out from the middle four, in tiles)
    const ring = Math.max(Math.abs(i - (GRID - 1) / 2), Math.abs(j - (GRID - 1) / 2)) - 0.5
    TILES.push({ i, j, x: centre(i), z: centre(j), ring, around: [] })
  }
}
for (const t of TILES) {
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const n = tileAt(t.i + di, t.j + dj)
      if (n >= 0 && (di || dj)) t.around.push(n)
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Start, spectators, the course

// Sixteen start spots, four by four across the floor; yours the one nearest +z, on the left
const ROWS = [-7, -3, 3, 7]
export const SPAWNS: Point[] = ROWS.flatMap((z) => ROWS.map((x): Point => [x, 1.3, z])).sort((a, b) => b[2] - a[2] || a[0] - b[0])
export const PLAYER_SLOT = 1

export const SPECTATOR: Point = [26, 5, 20]

export const PANIC_COURSE: RaceCourse = {
  spawn: SPAWNS[PLAYER_SLOT],
  sections: ['Pattern Panic'],
  checkpoints: [],
  // Never crossed: the round is won by being the last one standing (or still standing at the end)
  finish: { min: [1, 1, 1], max: [-1, -1, -1] },
  finishTitle: 'Survived',
  survival: true,
  hint: 'Tiles light up yellow, then red, then drop: be somewhere else · Each wave comes quicker · Last one standing wins · Space to jump · Drag or Q/E to turn the camera',
}
