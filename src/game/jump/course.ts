import { COUNTDOWN_SECONDS, type RaceCourse } from '../race/race'

// Beam Sweep: a round platform out over the clouds, in eight sections round a pillar, and two beams
// turning round the pillar: a low one, just off the floor, to jump, and a high one, at head height, to duck
// under (and not to be in the air under). They turn faster and faster, the high one sometimes closer behind
// the low one and sometimes further; and after a while the sections start to drop away, one at a time, until
// there are three left. Hit by a beam you're thrown, likely off the edge; off the platform you're out. The
// last one standing wins; if more than one is still standing after five minutes, they all do.
//
// Units are metres; the platform's top is at y 0, centred on the y axis. Angles go round the y axis the way
// three.js turns things about it: angle a is the direction (cos a, -sin a) in (x, z).

type Point = [number, number, number]

const RUN = COUNTDOWN_SECONDS
export const ROUND = 300 // seconds from RUN until whoever's still standing wins
export const END = RUN + ROUND

export const RADIUS = 11 // the platform's
export const PILLAR = 1.3 // the pillar in the middle's radius
export const THICK = 0.8
export const SECTIONS = 8
export const SECTION_ANGLE = (2 * Math.PI) / SECTIONS
export const KEEP = 3 // sections left at the end
export const SECTION_COLOURS = ['#ff6fb1', '#ffd23f', '#4fc3ff', '#9be15d', '#ff9a3c', '#b388ff', '#36d6b0', '#ff5c6c']

// The beams: from the pillar out past the edge, each a bar BEAM_HALF thick either side of its middle line
export const REACH = RADIUS + 0.5
export const BEAM_HALF = 0.25
export const LOW_Y = 0.33 // its middle: from 0.08 to 0.58 up (jump it)
export const HIGH_Y = 1.97 // from 1.72 to 2.22 up: over someone crouching (1.6 tall), not someone standing (2)

// How fast they turn (radians a second): from START_SPIN, RAMP faster every second, up to MAX_SPIN. The high
// one turns with the low one, a quarter turn ahead, give or take SWAY (so they never line up).
export const START_SPIN = 0.7
export const RAMP = 0.011
export const MAX_SPIN = 2
export const SWAY = 0.6
export const SWAY_RATE = 0.23

// The sections dropping: the first FIRST_DROP seconds after RUN, then one every DROP_EVERY, each flashing for
// DROP_WARN before it goes
export const FIRST_DROP = 30
export const DROP_EVERY = 12
export const DROP_WARN = 3

// Below this is out
export const OUT_Y = -8

// ---------------------------------------------------------------------------------------------------------

export const angleOf = (x: number, z: number) => Math.atan2(-z, x)
export const along = (a: number, r: number): [number, number] => [r * Math.cos(a), -r * Math.sin(a)]
export const mod = (x: number, m: number) => ((x % m) + m) % m
// Which section a point's over (by angle; whether it's on the platform at all is another matter)
export const sectionOf = (x: number, z: number) => Math.floor(mod(angleOf(x, z), 2 * Math.PI) / SECTION_ANGLE) % SECTIONS

// How far the low beam's turned τ seconds after RUN
const FULL_SPEED_AFTER = (MAX_SPIN - START_SPIN) / RAMP
export function turned(τ: number) {
  if (τ <= 0) return 0
  const a = Math.min(τ, FULL_SPEED_AFTER)
  return START_SPIN * a + (RAMP * a * a) / 2 + MAX_SPIN * Math.max(0, τ - FULL_SPEED_AFTER)
}
export const spinAt = (τ: number) => (τ <= 0 ? 0 : Math.min(MAX_SPIN, START_SPIN + RAMP * τ))

// ---------------------------------------------------------------------------------------------------------
// Start, spectators, the course

// Sixteen start spots in a ring, clear of both beams where they start; yours the one nearest +z
const STARTS = 16
const START_RING = 7
export const SPAWNS: Point[] = Array.from({ length: STARTS }, (_, k) => {
  const [x, z] = along(((k + 0.5) * 2 * Math.PI) / STARTS, START_RING)
  return [x, 1.3, z]
})
export const PLAYER_SLOT = SPAWNS.reduce((best, p, k) => (p[2] - Math.abs(p[0]) > SPAWNS[best][2] - Math.abs(SPAWNS[best][0]) ? k : best), 0)

export const SPECTATOR: Point = [30, 6, 24]

export const JUMP_COURSE: RaceCourse = {
  spawn: SPAWNS[PLAYER_SLOT],
  sections: ['Beam Sweep'],
  checkpoints: [],
  // Never crossed: the round is won by being the last one standing (or still standing at the end)
  finish: { min: [1, 1, 1], max: [-1, -1, -1] },
  finishTitle: 'Survived',
  survival: true,
  hint: 'Jump the low beam · Duck under the high one (C, standing still) and don\'t jump into it · Sections drop away · Last one standing wins · Drag or Q/E to turn the camera',
}
