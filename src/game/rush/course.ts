import { COUNTDOWN_SECONDS, type RaceCourse } from '../race/race'

// Wall Rush: a flat stage, and wall after wall of blocks rising out of a slot at its front and sliding the
// length of it to the back, where they drop off into the slime. Get through each one before it shoves you
// off the back: through a gap, or by smashing through a cracked red block (run into it flat out). Grey
// concrete won't break; spiked blocks throw you back; a TNT block goes off a moment after it's touched,
// blasting a hole in every wall round it and everyone near it off their feet. Glowing lasers line both sides:
// touch one and you're out. The walls come quicker, closer together and harder to get through as the round
// goes on. The last one standing wins; if more than one is still standing after three minutes, they all do.
//
// Units are metres. Players face -z, towards where the walls come from; the stage's top is at y 0.

type Point = [number, number, number]

const RUN = COUNTDOWN_SECONDS
export const ROUND = 180
export const END = RUN + ROUND

// The stage
export const HALF = 10 // half its width: the walls span it, ten blocks of 2 m
export const FRONT = -24 // its front edge (the walls come up just beyond it)
export const BACK = 12 // its back edge (beyond: the slime)
export const LASER_X = 10.15 // the lasers either side: a runner's side touching this is out
export const OUT_Y = -2.5 // fallen this far: in the slime

// The walls
export const CELLS = 10
export const CELL = 2
export const WALL_HEIGHT = 2.4 // too tall to jump on to
export const WALL_DEPTH = 1.2
export const SPAWN_Z = FRONT - 1.6 // where a wall comes up (its middle)
export const RISE = 0.8 // seconds it takes to come up
export const cellX = (k: number) => -HALF + CELL * (k + 0.5)
export const cellOf = (x: number) => Math.max(0, Math.min(CELLS - 1, Math.floor((x + HALF) / CELL)))

// How fast they slide (m/s): quickening all through the round, from a walk to nearly a run at the end
export const SPEED_START = 2
export const SPEED_END = 5.8
export const SPEED_UP = ROUND // seconds from RUN to full speed
// How far apart they come (m), at the start of the round and at its end
export const APART_FIRST = 11
export const APART_LATE = 7

// Cracked blocks break when run into at least this fast (m/s, into the wall)
export const BREAK_SPEED = 3
// TNT goes off this long after it's touched, blasting everything within these
export const FUSE = 0.9
export const BLAST_BLOCKS = 3.2
export const BLAST_RUNNERS = 4.6

// ---------------------------------------------------------------------------------------------------------
// Start, spectators, the course

// Sixteen start spots across the back half of the stage; yours the middle one at the back
export const SPAWNS: Point[] = Array.from({ length: 16 }, (_, i): Point => [-7 + (i % 8) * 2, 1.3, 2 + Math.floor(i / 8) * 4]).sort(
  (a, b) => b[2] - a[2] || Math.abs(a[0]) - Math.abs(b[0]),
)
export const PLAYER_SLOT = 0

export const SPECTATOR: Point = [24, 6, 14]

export const RUSH_COURSE: RaceCourse = {
  spawn: SPAWNS[PLAYER_SLOT],
  sections: ['Wall Rush'],
  checkpoints: [],
  // Never crossed: the round is won by being the last one standing (or still standing at the end)
  finish: { min: [1, 1, 1], max: [-1, -1, -1] },
  finishTitle: 'Survived',
  survival: true,
  hint: "Get through every wall before it shoves you off the back · Run into red blocks to smash them · Don't touch the lasers · Last one standing wins · Drag or Q/E to turn the camera",
}
