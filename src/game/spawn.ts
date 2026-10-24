import * as THREE from 'three'
import { net } from './net/client'
import { S } from './net/protocol'

// Where the playground's spawn plaza is (drawn by ./SpawnPlaza): a big pad on the floor behind the gun racks,
// with room for a full online room to arrive at once. Everyone starts somewhere random on it, and comes back
// somewhere random after a fall: of a handful of random spots, the one furthest from everyone else already
// here, so beans don't land on each other.

type P3 = [number, number, number]

export const PLAZA = { x0: -11, x1: 11, z0: 21, z1: 39 } // the painted pad (the floor runs a metre past it)
const MARGIN = 2 // spawns keep this far in from the pad's edges
const DROP_Y = 3 // dropped in from this height
const TRIES = 12

// Where to start (or come back): random, and as far as it can be from the other beans
export function spawnPoint(): P3 {
  const others: [number, number][] = []
  for (const r of net.remotes.values()) {
    const s = r.samples[r.samples.length - 1]
    if (s) others.push([s[S.x], s[S.z]])
  }
  let best: P3 = [0, DROP_Y, (PLAZA.z0 + PLAZA.z1) / 2]
  let bestRoom = -1
  for (let i = 0; i < TRIES; i++) {
    const x = THREE.MathUtils.lerp(PLAZA.x0 + MARGIN, PLAZA.x1 - MARGIN, Math.random())
    const z = THREE.MathUtils.lerp(PLAZA.z0 + MARGIN, PLAZA.z1 - MARGIN, Math.random())
    let room = Infinity
    for (const [ox, oz] of others) room = Math.min(room, Math.hypot(x - ox, z - oz))
    if (room > bestRoom) {
      best = [x, DROP_Y, z]
      bestRoom = room
    }
  }
  return best
}
