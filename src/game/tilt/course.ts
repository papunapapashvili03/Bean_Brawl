import * as THREE from 'three'
import { COUNTDOWN_SECONDS, type RaceCourse } from '../race/race'

// Tilt Town: a little round town (two crossing streets and a roundabout) on a platform floating above the
// clouds, balanced on a pillar. Every 10 seconds it tips over towards a new direction, and everything on it
// that isn't bolted down (buildings, buses, cars, bins, cones) slides about. Meanwhile the outer ring of the
// disc breaks away every 10 seconds, so there's less and less town to stand on. Last a minute to win.
//
// Units are metres; the platform's top is at y 0, its middle on the y axis. Angles round the disc go from
// +z towards +x: angle a, radius r is (r sin a, r cos a).

type Point = [number, number, number]

const RUN = COUNTDOWN_SECONDS
export const ROUND = 60 // seconds from RUN to the win

export const RADIUS = 24
export const THICKNESS = 1.2
export const CORE = 6.5 // the middle, which never breaks
export const ROAD = 3.5 // half the width of the streets
export const ISLAND = 3 // the roundabout's middle
export const SIDEWALK = 1.5

// Rings of tiles round the core, the outermost first. Each breaks away piece by piece, round the ring.
export const RINGS = [
  { r0: 20.5, r1: RADIUS, tiles: 30, breaks: RUN + 9 },
  { r0: 17, r1: 20.5, tiles: 24, breaks: RUN + 19 },
  { r0: 13.5, r1: 17, tiles: 20, breaks: RUN + 29 },
  { r0: 10, r1: 13.5, tiles: 16, breaks: RUN + 39 },
  { r0: CORE, r1: 10, tiles: 12, breaks: RUN + 49 },
]
export const BREAK_SPREAD = 2.5 // seconds from the first tile of a ring going to the last
export const WARN = 2 // a tile flashes and shudders this long before it goes

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// When each tile of a ring breaks: starting from a random point, round the ring
export const TILE_BREAKS = (() => {
  const rand = seeded(7)
  return RINGS.map((ring) => {
    const start = Math.floor(rand() * ring.tiles)
    return Array.from({ length: ring.tiles }, (_, i) => ring.breaks + (((i - start + ring.tiles) % ring.tiles) / ring.tiles) * BREAK_SPREAD)
  })
})()

// How far the ground has shrunk at t: the radius of what's left
export function radiusAt(t: number) {
  let r = RADIUS
  for (const ring of RINGS) if (t >= ring.breaks + BREAK_SPREAD) r = ring.r0
  return r
}

// ---------------------------------------------------------------------------------------------------------
// Tilting: the platform keeps tipping over (downhill towards a new random direction, well away from the last),
// easing over from its old tilt to its new one. As the circle shrinks it tips steeper, more often and quicker:
// there's less rim to swing about, so a smaller town can take a harsher swing without flinging everything off.

// How it tilts at each stage of the shrinking: stage 0 is the whole town, stage k after k rings have started
// to go. `angle` is the tilt (radians: about 14° up to 31°), `every` the seconds between tilts, `ease` how
// long each takes to swing over.
export const TILT_STAGES = [
  { angle: 0.24, every: 10, ease: 3.2 },
  { angle: 0.3, every: 8, ease: 2.8 },
  { angle: 0.36, every: 6.5, ease: 2.4 },
  { angle: 0.42, every: 5, ease: 2 },
  { angle: 0.48, every: 4, ease: 1.6 },
  { angle: 0.54, every: 3, ease: 1.3 },
]
export const stageAt = (t: number) => RINGS.filter((r) => t >= r.breaks).length

// Friction on the platform and everything on it: slippery, so things slide once the town tips (but not so
// slippery that the first tilt clears the lot)
export const FRICTION = 0.18

const Y = new THREE.Vector3(0, 1, 0)
// The tilt towards downhill direction a (radians round from +z), by `angle`
function tiltTowards(a: number, angle: number) {
  const downhill = new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
  const axis = new THREE.Vector3().crossVectors(Y, downhill).normalize()
  return new THREE.Quaternion().setFromAxisAngle(axis, angle)
}

// Every tilt of the round, worked out in advance: when it starts, how long it takes, where it ends up. Each
// heads at least 100° away from the one before.
type Tilt = { at: number; ease: number; angle: number; pose: THREE.Quaternion }
export const TILTS: Tilt[] = (() => {
  const rand = seeded(23)
  const out: Tilt[] = []
  let direction = rand() * Math.PI * 2
  for (let t = RUN + 1.5; t < RUN + ROUND; ) {
    const stage = TILT_STAGES[stageAt(t)]
    const turn = (100 / 180) * Math.PI + rand() * ((160 / 180) * Math.PI)
    direction = (direction + (rand() < 0.5 ? turn : -turn) + Math.PI * 4) % (Math.PI * 2)
    out.push({ at: t, ease: stage.ease, angle: stage.angle, pose: tiltTowards(direction, stage.angle) })
    t += stage.every
  }
  return out
})()

// How far the rim can dip below the middle: the worst of each tilt at the size the town is when it starts
export const LOWEST_EDGE = -Math.max(...TILTS.map((tilt) => radiusAt(tilt.at) * Math.sin(tilt.angle)))

const FLAT = new THREE.Quaternion()
const smooth = (x: number) => x * x * (3 - 2 * x)

// The platform's orientation at t (written into `out`)
export function tiltAt(t: number, out = new THREE.Quaternion()) {
  let k = -1
  while (k + 1 < TILTS.length && TILTS[k + 1].at <= t) k++
  if (k < 0) return out.identity()
  const tilt = TILTS[k]
  const u = THREE.MathUtils.clamp((t - tilt.at) / tilt.ease, 0, 1)
  return out.slerpQuaternions(k > 0 ? TILTS[k - 1].pose : FLAT, tilt.pose, smooth(u))
}
// Seconds until the next tilt starts (null after the last)
export function nextTiltIn(t: number) {
  const next = TILTS.find((tilt) => tilt.at > t)
  return next ? next.at - t : null
}
// Seconds until the next ring starts to break (null when none are left)
export function nextBreakIn(t: number) {
  const ring = RINGS.find((r) => r.breaks > t)
  return ring ? ring.breaks - t : null
}

// ---------------------------------------------------------------------------------------------------------
// Start, spectators, the course

// 30 start spots on the roundabout, in two rings round the fountain
export const SPAWNS: Point[] = Array.from({ length: 30 }, (_, i) => {
  const row = i % 2
  const a = ((Math.floor(i / 2) + row * 0.5) / 15) * Math.PI * 2 + 0.1
  const r = row ? 5.7 : 4.4
  return [r * Math.sin(a), 1.3, r * Math.cos(a)]
})
export const PLAYER_SLOT = 0

export const SPECTATOR: Point = [40, 6, -32]
export const FALL_Y = -25
export const END = RUN + ROUND

export const TILT_COURSE: RaceCourse = {
  spawn: SPAWNS[PLAYER_SLOT],
  sections: ['Tilt Town'],
  checkpoints: [],
  // Never crossed: the round is won by lasting the minute
  finish: { min: [1, 1, 1], max: [-1, -1, -1] },
  finishTitle: 'Survived',
  survival: true,
  hint: 'Stay on the town! It tips every 10 s and the edge breaks away · Space to jump · C to crouch · Drag or Q/E to turn the camera',
}
