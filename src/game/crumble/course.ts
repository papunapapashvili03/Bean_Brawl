import { COUNTDOWN_SECONDS, type RaceCourse } from '../race/race'

// Crumbling Tower layout and timetable. Units are metres; the tower stands on the y axis, its courtyard at
// y 0. Angles go round the tower from +z (0) towards +x (π/2): a point at angle φ, radius r is
// (r sin φ, y, r cos φ).
//
// The tower falls apart from the bottom up on the match clock (the same for every runner): first the
// courtyard, then the inner tower's spiral ramp, the floor and lifts, then the ring outside. The crown on top
// only starts to crumble once somebody reaches it, and then it's a fight to stay on it.

type Point = [number, number, number]

// ---------------------------------------------------------------------------------------------------------
// Timetable (seconds on the match clock, which includes the countdown)

const RUN = COUNTDOWN_SECONDS
export const T = {
  cracks: RUN + 20, // cracks spread across the courtyard...
  crackSpread: 12, // ...from the spawn side round to the gate, over this long
  courtyardFall: RUN + 24, // courtyard tiles start to fall (spawn side first)...
  courtyardSpan: 16, // ...the last one this long after
  terrace: RUN + 44, // the gate terrace, the stairs and pillars up to it
  helix: RUN + 45, // the spiral ramp crumbles from the bottom...
  helixStep: 1.2, // ...one segment after another
  floor: RUN + 70, // the tower's floor
  lifts: RUN + 90,
  ring: RUN + 100, // the ring outside crumbles from its start...
  ringStep: 2,
  crownStairs: RUN + 134,
}
export const WARN = 1.2 // a piece shakes (and glows) this long before it falls

// ---------------------------------------------------------------------------------------------------------
// The tower

export const around = (phi: number, r: number, y: number): Point => [r * Math.sin(phi), y, r * Math.cos(phi)]

export const TOWER = { outer: 7, inner: 6.3, sectors: 20, row: 4, rows: 10, top: 40, coreTop: 50 }
export const WALL_MID = (TOWER.outer + TOWER.inner) / 2
export const DOOR_HALF_ANGLE = (Math.PI * 2) / TOWER.sectors // the doors are two sectors wide, round +z

// 1. Courtyard: a stone ring round the tower's base, in tiles (three rings of sectors)
export const COURTYARD = { radii: [7.2, 11, 15.5, 20], sectors: 16, thickness: 1.2 }
export const FLOOR_Y = 4 // the gate terrace and the tower's floor
export const TERRACE = { r0: TOWER.outer, r1: 11, half: Math.PI / 4, pieces: 4 }
export const STAIRS_X = 6.5 // two broken staircases up the terrace's sides
export const STAIRS = { width: 3, bottomZ: 18.8, topZ: 8.9, gaps: [0.34, 0.67], gap: 1.1 }
export const PILLARS = [
  { z: 17, top: 1 },
  { z: 15.2, top: 2 },
  { z: 13.4, top: 3 },
] // up the middle to the terrace's front edge (z 11)
export const PILLAR_RADIUS = 0.9
// Sweepers turning on posts either side of the tower: jump the bar
export const SWEEPERS = [
  { x: 13.5, z: 0, length: 6, spin: 0.9 },
  { x: -13.5, z: 0, length: 6, spin: -0.9 },
]
// Tiles already missing: [ring, sector]
export const MISSING_TILES = [
  [2, 3],
  [2, 12],
  [1, 5],
  [2, 10],
  [1, 11],
]

// Spawn: 30 slots on the far side of the courtyard, facing the tower
export const SPAWNS: Point[] = Array.from({ length: 30 }, (_, i) => {
  const row = Math.floor(i / 10)
  const phi = Math.PI + ((i % 10) - 4.5) * 0.105
  return around(phi, 13 + row * 2.4, 1.3)
})
export const PLAYER_SLOT = 4

// 2. Inner tower: a spiral ramp three times round the inside, from the floor up to the exit door
export const HELIX = { r: 4.2, width: 4, turns: 3, y0: FLOOR_Y, y1: 36, segments: 48, thickness: 0.6 }
export const helixAngle = (s: number) => s * HELIX.turns * Math.PI * 2
export const helixY = (s: number) => HELIX.y0 + (HELIX.y1 - HELIX.y0) * s
export const helixPoint = (s: number, r = HELIX.r): Point => around(helixAngle(s), r, helixY(s))
// Pendulums swinging across the ramp (at these points along it)
export const PENDULUMS = [0.28, 0.47, 0.64, 0.83]
// Lifts up the middle of the shaft: a way back up for anyone who falls
export const LIFTS = [
  { x: 1.1, phase: 0 },
  { x: -1.1, phase: Math.PI },
]
export const LIFT = { radius: 1, y0: 5, y1: 30, period: 20 }

// 3. Exterior ring: once round the outside from the exit door, climbing to the crown stairs
export const RING = { r: 8.75, width: 3.5, y0: 36, y1: 44, segments: 16, thickness: 0.8 }
export const ringAngle = (s: number) => s * Math.PI * 2
export const ringY = (s: number) => RING.y0 + (RING.y1 - RING.y0) * s
// What each ring segment is (in order from the door)
export type RingKind = 'walk' | 'bridge' | 'tilt' | 'spinner'
export const RING_KINDS: RingKind[] = [
  'walk',
  'walk',
  'spinner',
  'bridge',
  'walk',
  'tilt',
  'tilt',
  'walk',
  'spinner',
  'bridge',
  'walk',
  'tilt',
  'spinner',
  'bridge',
  'walk',
  'walk',
]
export const GUSTS = { every: 7, last: 1.5, push: 2.8 }

// Crown stairs: from the ring's end straight out, a landing, then two flights back up to the crown's edge
export const CROWN_STAIRS = {
  up: { from: [0, RING.y1, RING.r + RING.width / 2 - 0.3] as Point, to: [0, 48, 18.5] as Point, width: 3.5 },
  landing: { min: [-5.25, 47, 18.3] as Point, max: [5.25, 48, 20.7] as Point },
  back: [-3.5, 3.5].map((x) => ({ from: [x, 48, 20.5] as Point, to: [x, 52, 12.3] as Point, width: 3.5 })),
}

// 4. Crown: 25 x 25 in tiles, with a magic crystal floating over the middle
export const CROWN = { half: 12.5, tile: 2.5, top: 52, thickness: 2 }
export const CROWN_TILES = (CROWN.half * 2) / CROWN.tile
// The survival phase, once somebody reaches the crown: every STAGE seconds the outer ring of tiles falls,
// and everything speeds up. Stage 0 is the whole 25 x 25; stage 4 is the last 5 x 5; hold on through it.
export const SURVIVAL = {
  stage: 12,
  finalHold: 15,
  sizes: ['25 × 25', '20 × 20', '15 × 15', '10 × 10', '5 × 5'],
  beamSpin: [0.7, 0.9, 1.1, 1.3, 1.5],
  debrisEvery: [3, 2.5, 2, 1.7, 1.5],
  quakeEvery: [8, 7, 6, 5, 4],
}
export const survivalLength = SURVIVAL.stage * 4 + SURVIVAL.finalHold

// Anyone who falls lands here, out of the race, to watch the rest come down
export const SPECTATOR: Point = [30, 26, -26]
export const FALL_Y = -30

export const CRUMBLE_COURSE: RaceCourse = {
  spawn: SPAWNS[PLAYER_SLOT],
  sections: ['Courtyard', 'Inner Tower', 'Exterior Ring', 'Crown Platform'],
  checkpoints: [
    { zone: { min: [-6, FLOOR_Y - 0.5, -6], max: [6, FLOOR_Y + 5, 6] }, respawn: SPECTATOR },
    { zone: { min: [-4, RING.y0 - 1, TOWER.outer - 0.5], max: [4, RING.y0 + 3, 11] }, respawn: SPECTATOR },
    { zone: { min: [-CROWN.half, CROWN.top - 0.5, -CROWN.half], max: [CROWN.half, CROWN.top + 5, CROWN.half] }, respawn: SPECTATOR },
  ],
  // Never crossed: the race is won by surviving on the crown
  finish: { min: [1, 1, 1], max: [-1, -1, -1] },
  finishTitle: 'Survived',
  survival: true,
  hint: 'Climb before it crumbles! · Falling off is out · Space to jump · C to crouch · Drag or Q/E to turn the camera',
}
