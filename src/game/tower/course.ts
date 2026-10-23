import { COUNTDOWN_SECONDS, type RaceCourse, type Zone } from '../race/race'

// Tower Climb layout. Units are metres. You start on an island facing the tower (towards -z) and climb its
// tiers: switchback ramps cross the tower's front face sideways, so the default camera watches them side-on.

type Point = [number, number, number]

// Pink slime around the tower slowly rises after RUN, flooding the lowest stepping pillars
export const SLIME_START = 0.3
const SLIME_MAX = 3.2
const SLIME_DELAY = 10 // seconds after RUN before it starts rising
const SLIME_RATE = 0.03 // metres per second
export const slimeLevel = (clock: number) =>
  SLIME_START + Math.min(SLIME_MAX - SLIME_START, Math.max(0, clock - COUNTDOWN_SECONDS - SLIME_DELAY) * SLIME_RATE)

export const COLORS = {
  wall: '#3b6fd9',
  top: '#7fb2ff',
  trim: '#e040fb',
  lime: '#9be15d',
  limeTop: '#b6f07a',
  pillar: '#ff4fd8',
}

// Solid tiers (min, max corners). Each tier's top is the floor of the next section.
export const START_ISLAND = { min: [-8, -6, 36] as Point, max: [8, 4.5, 46] as Point }
export const TIERS = {
  plaza: { min: [-12, -6, 3], max: [12, 4, 15] }, // base plaza, y 4
  t1: { min: [-12, -6, -5], max: [12, 9, 3] }, // y 9
  t2: { min: [-12, -6, -13], max: [12, 14, -5] }, // y 14
  galleryIn: { min: [-12, -6, -17], max: [12, 19, -13] }, // y 19, before the cannon bridge
  galleryOut: { min: [-12, -6, -36], max: [12, 19, -33] }, // y 19, after it
  bumpers: { min: [-8, -6, -56], max: [8, 22, -41] }, // y 22
  summit: { min: [-9, -6, -88], max: [9, 27, -67.95] }, // y 27, flush with the back of the last roller
} satisfies Record<string, { min: Point; max: Point }>

// Stepping pillars across the slime: x, z, top height, radius
export const PILLARS = [
  [0, 33, 3.4, 1.2],
  [-2.2, 30.2, 2.9, 1.1],
  [1.5, 27.4, 3.8, 1.2],
  [-1, 24.6, 3.1, 1.1],
  [2.3, 21.9, 4.2, 1.2],
  [0, 19.3, 3.5, 1.1],
  [-2, 16.8, 3.9, 1.1],
] as const

// Switchback ramps up the front face. Boulders roll from each top, off the bottom, and over the tier edge.
export const RAMP_WIDTH = 4
export const RAMPS = [
  { top: [9, 9, 5] as Point, bottom: [-9, 4, 5] as Point, edgeX: -12, offset: 0 },
  { top: [-9, 14, -3] as Point, bottom: [9, 9, -3] as Point, edgeX: 12, offset: 0.9 },
  { top: [9, 19, -11] as Point, bottom: [-9, 14, -11] as Point, edgeX: -12, offset: 1.7 },
]

// Ledge ladders at the bottom end of each switchback: a shelf on the tier wall, then the tier's lip above it.
// Jump, catch, pull up, twice: a shortcut past the ramp, but you hang right in the boulders' run-off.
export const SHELF_DEPTH = 1.2
export const LADDERS = RAMPS.map((ramp) => {
  const side = Math.sign(ramp.bottom[0])
  const xs = [side * 9.6, side * 11.6]
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    wallZ: ramp.bottom[2] - RAMP_WIDTH / 2, // front face of the tier behind the ramp
    shelfTop: ramp.bottom[1] + 2.4,
    tierTop: ramp.bottom[1] + 5,
  }
})

// Cannon gallery: a narrow bridge with cannons on posts either side, firing across it on a timetable
export const BRIDGE = { min: [-3, 17.8, -33] as Point, max: [3, 19, -17] as Point }
export const CANNONS = [
  { z: -19.5, side: -1, offset: 0 },
  { z: -23, side: 1, offset: 0.6 },
  { z: -26.5, side: -1, offset: 1.2 },
  { z: -30, side: 1, offset: 1.8 },
]

// Stairs from the gallery exit up to the bumper deck: 3 m over 7.5 m (~22°). Much steeper and the
// runner can't walk up it.
export const BUMPER_STAIRS = { from: [0, 19, -33.5] as Point, to: [0, 22, -41] as Point }

// Glowing bumper pillars: x, z, and how far (if at all) they slide side to side
export const BUMPERS = [
  { x: -4, z: -44, slide: 0 },
  { x: 2, z: -44.5, slide: 2.5 },
  { x: 5.5, z: -47, slide: 0 },
  { x: -1, z: -48, slide: 3 },
  { x: -5.5, z: -51, slide: 0 },
  { x: 3, z: -51.5, slide: 0 },
  { x: 0, z: -54.5, slide: 4 },
]

// Roller bridge: spinning rollers stepping up 0.9 m each (a jump); even ones push you back, odd ones forward.
// The first roller nearly touches the deck edge: any gap a runner can drop into is a place to get wedged.
export const ROLLER_RADIUS = 1.1
export const ROLLERS = Array.from({ length: 5 }, (_, i) => ({
  z: -57.2 - i * 2.4,
  top: 22.9 + i * 0.9,
  surfaceSpeed: i % 2 ? -2 : 2.6, // +z is backwards
}))

// Propeller drones sweeping the summit
export const DRONES = [
  { z: -75, slide: 4, spin: 3, offset: 0 },
  { z: -80.5, slide: 3.5, spin: -3.4, offset: 2.5 },
]
export const FINISH_Z = -84.5
const SUMMIT_Y = TIERS.summit.max[1]

export const SPAWN: Point = [0, START_ISLAND.max[1] + 1.3, 40]

const box = (min: Point, max: Point): Zone => ({ min, max })
const onTop = (t: { min: Point; max: Point }, zMin = t.min[2], zMax = t.max[2]): Zone =>
  box([t.min[0], t.max[1] - 0.5, zMin], [t.max[0], t.max[1] + 4, zMax])

export const TOWER_COURSE: RaceCourse = {
  spawn: SPAWN,
  sections: ['Slime Shore', 'Boulder Switchbacks', 'Cannon Gallery', 'Bumper Deck', 'Roller Bridge', 'Propeller Summit'],
  checkpoints: [
    { zone: onTop(TIERS.plaza), respawn: [0, 5.3, 10] },
    { zone: onTop(TIERS.galleryIn), respawn: [7, 20.3, -15] },
    { zone: onTop(TIERS.galleryOut), respawn: [0, 20.3, -34.5] },
    { zone: onTop(TIERS.bumpers, -56, -53), respawn: [0, 23.3, -54.8] },
    { zone: onTop(TIERS.summit), respawn: [0, 28.3, -72] },
  ],
  finish: box([-4, SUMMIT_Y - 0.5, -Infinity], [4, Infinity, FINISH_Z]),
}
