import * as THREE from 'three'
import type { BotView, P3, Route } from '../race/bots/route'
import { PLAYER_SLOT, SPAWNS, tiltAt } from './course'

// What the bots do in Tilt Town (see ../race/bots): there's nowhere to get to, only a town to stay on, so
// each keeps to a place of its own round the middle (the part that never breaks away), a little uphill of it
// whichever way the town is tipping (and leaning into the tip that's coming), getting out of the way of
// whatever comes sliding at it.

export const BOT_STARTS: P3[] = SPAWNS.filter((_, i) => i !== PLAYER_SLOT)
// (A bot's place round the middle: where it starts)
export const botLane = (start: P3) => Math.atan2(start[0], start[2]) / Math.PI

const AHEAD = 0.8 // seconds: how far ahead of the tipping it moves
const AROUND = 3.7 // how far out from the middle it keeps
const UPHILL = 1.5 // how far uphill of that, at a steep tilt
const WITHIN = 5.2 // never further out than this

const q = new THREE.Quaternion()
const up = new THREE.Vector3()

function refuge(v: BotView): P3 {
  // The platform's up leans towards downhill
  up.set(0, 1, 0).applyQuaternion(tiltAt(v.t + AHEAD, q))
  const lean = Math.hypot(up.x, up.z)
  const steep = Math.min(1, lean / 0.3)
  const a = v.bias * Math.PI
  let x = Math.sin(a) * AROUND - (lean > 1e-3 ? up.x / lean : 0) * steep * UPHILL
  let z = Math.cos(a) * AROUND - (lean > 1e-3 ? up.z / lean : 0) * steep * UPHILL
  const r = Math.hypot(x, z)
  if (r > WITHIN) {
    x *= WITHIN / r
    z *= WITHIN / r
  }
  // How high the ground is there, as the town lies now
  up.set(0, 1, 0).applyQuaternion(tiltAt(v.t, q))
  return [x, -(up.x * x + up.z * z) / up.y, z]
}

export const TILT_ROUTE: Route = [{ at: refuge, hold: true, resume: 0 }]
