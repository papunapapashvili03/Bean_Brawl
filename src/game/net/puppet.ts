import * as THREE from 'three'
import type { CharacterMotion, HangPose } from '../Character'
import { FLAG_GROUNDED, FLAG_HANG, FLAG_ROLL, S } from './protocol'

// Drawing a bean from the states it's sent (another player's, or a bot the show's host runs): where it was a
// moment ago (`delay`), going smoothly from one state to the next, and what its body was doing. A player's
// state and each bot's in the host's message have the same numbers in the same order, from x to crouch, just
// starting at different places (`at`: 1 in a player's, after its stamp; further along for each bot).

export type Feed = { samples: number[][]; offset: number }

const EXTRAPOLATE = 0.25 // s: with nothing newer, carried on the way it was going for at most this long

// Offsets from `at` (x, y, z, vx, vy, vz, yaw, flags, crouch)
const X = 0
const Y = 1
const Z = 2
const VX = 3
const VY = 4
const VZ = 5
const YAW = 6
export const FLAGS = 7
export const CROUCH = 8

// Where a bean was `now` (our clock) less `delay`, from its states either side of then (or the last one,
// carried on a little): into `out` (x, y, z, vx, vy, vz, yaw), and the state nearest then. Null with none yet.
export function poseAt(feed: Feed, at: number, now: number, delay: number, out: number[]) {
  const s = feed.samples
  if (!s.length) return null
  const t = now - feed.offset - delay // on its clock
  const last = s[s.length - 1]
  // (With only one yet, it stays there till the next comes)
  if (t >= last[S.stamp] || s.length === 1) {
    const dt = THREE.MathUtils.clamp((t - last[S.stamp]) / 1000, 0, EXTRAPOLATE)
    out[0] = last[at + X] + last[at + VX] * dt
    out[1] = last[at + Y] + (last[at + FLAGS] & FLAG_GROUNDED ? 0 : last[at + VY] * dt)
    out[2] = last[at + Z] + last[at + VZ] * dt
    out[3] = last[at + VX]
    out[4] = last[at + VY]
    out[5] = last[at + VZ]
    out[6] = last[at + YAW]
    return last
  }
  let i = s.length - 2
  while (i > 0 && s[i][S.stamp] > t) i--
  const a = s[i]
  const b = s[i + 1]
  const span = b[S.stamp] - a[S.stamp]
  const u = span > 0 ? THREE.MathUtils.clamp((t - a[S.stamp]) / span, 0, 1) : 1
  for (let k = 0; k < 6; k++) out[k] = a[at + k] + (b[at + k] - a[at + k]) * u
  const turn = Math.atan2(Math.sin(b[at + YAW] - a[at + YAW]), Math.cos(b[at + YAW] - a[at + YAW]))
  out[6] = a[at + YAW] + turn * u
  return u < 0.5 ? a : b
}

// Hanging: its hands on an edge just in front of and above it, either side of the way it faces
function hangPose(pose: HangPose, x: number, y: number, z: number, yaw: number) {
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const tx = Math.cos(yaw)
  const tz = -Math.sin(yaw)
  pose.yaw = yaw
  pose.tx = tx
  pose.tz = tz
  pose.hands.forEach((h, k) => {
    const side = k === 0 ? -0.32 : 0.32
    h.x = x + fx * 0.42 + tx * side
    h.y = y + 0.95
    h.z = z + fz * 0.42 + tz * side
  })
  return pose
}

export const newHang = (): HangPose => ({ kind: 'ledge', hands: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], tx: 1, tz: 0, yaw: 0, shimmy: 0 })

// What its body's doing, for drawing it: from the pose worked out above and the state nearest it
export function moveLike(m: CharacterMotion, pose: number[], state: number[], at: number, hang: HangPose) {
  const flags = state[at + FLAGS]
  m.vx = pose[3]
  m.vz = pose[5]
  m.grounded = !!(flags & FLAG_GROUNDED)
  m.roll = !!(flags & FLAG_ROLL)
  m.crouch = state[at + CROUCH]
  m.hang = flags & FLAG_HANG ? hangPose(hang, pose[0], pose[1], pose[2], pose[6]) : null
}

// The other way: a body's flags, for sending
export const flagsOf = (m: CharacterMotion) => (m.grounded ? FLAG_GROUNDED : 0) | (m.roll ? FLAG_ROLL : 0) | (m.hang ? FLAG_HANG : 0)

// Which way a body faces, for sending: the way it hangs, or the way it's running (or, standing, `was`)
export const facing = (m: CharacterMotion, was: number) => (m.hang ? m.hang.yaw : Math.hypot(m.vx, m.vz) > 0.1 ? Math.atan2(m.vx, m.vz) : was)
