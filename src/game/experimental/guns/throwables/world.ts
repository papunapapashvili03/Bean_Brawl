import { useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { activePlayerPosition } from '../../../playerContact'
import { blastDamage, type Target } from '../../combat'
import { addBlast, addPuff } from '../fx'
import { playExplosion, playSmoke } from '../sounds'
import { PROJECTILES, THROWABLES, type Live, type ProjectileKind } from './catalog'

// Everything thrown and what it leaves behind: throwables flying or lying about, fires burning and smoke
// clouds. <ThrowEffects /> moves and draws them. The lists are replaced whenever something comes or goes
// (so React can draw each one), and the things in them change in place every frame.

export type Thrown = {
  id: number
  kind: ProjectileKind
  pos: THREE.Vector3
  vel: THREE.Vector3
  quat: THREE.Quaternion
  spinAxis: THREE.Vector3
  spin: number // tumbling through the air (radians per second)
  fuse: number | null // seconds until it goes off (grenade, dynamite), or starts pouring smoke
  onGround: boolean // touching the ground this frame
  resting: boolean
  live: Live
  stopSound: (() => void) | null
}

// A patch of burning ground: where (on the ground), how big, and when it catches (seconds after the fire starts)
export type FirePatch = { at: THREE.Vector3; r: number; lightAt: number }
export type Fire = {
  id: number
  at: THREE.Vector3
  patches: FirePatch[]
  cover: number // the share of the ground in its circle that burns
  age: number
  nextBurn: Map<Target, number> // when each target standing in it next takes damage
  stopSound: (() => void) | null
}
export type Smoke = { id: number; at: THREE.Vector3; can: Thrown; age: number; stopSound: (() => void) | null }

type World = { thrown: Thrown[]; fires: Fire[]; smokes: Smoke[] }

let world: World = { thrown: [], fires: [], smokes: [] }
let nextId = 1
const listeners = new Set<() => void>()

function set(next: World) {
  world = next
  listeners.forEach((l) => l())
}

export const throwWorld = {
  get: () => world,
  newId: () => nextId++,
  addThrown: (t: Thrown) => set({ ...world, thrown: [...world.thrown, t] }),
  removeThrown(t: Thrown) {
    t.stopSound?.()
    set({ ...world, thrown: world.thrown.filter((x) => x !== t) })
  },
  addFire: (f: Fire) => set({ ...world, fires: [...world.fires, f] }),
  removeFire(f: Fire) {
    f.stopSound?.()
    set({ ...world, fires: world.fires.filter((x) => x !== f) })
  },
  addSmoke: (s: Smoke) => set({ ...world, smokes: [...world.smokes, s] }),
  removeSmoke(s: Smoke) {
    s.stopSound?.()
    set({ ...world, smokes: world.smokes.filter((x) => x !== s) })
  },
  // Everything gone at once (leaving the level): its sounds too
  clear() {
    for (const t of world.thrown) t.stopSound?.()
    for (const f of world.fires) f.stopSound?.()
    for (const s of world.smokes) s.stopSound?.()
    set({ thrown: [], fires: [], smokes: [] })
  },
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useThrowWorld() {
  return useSyncExternalStore(subscribe, () => world)
}

export function distanceFromPlayer(p: THREE.Vector3) {
  const player = activePlayerPosition()
  return player ? Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z) : 0
}

const UP = new THREE.Vector3(0, 1, 0)

// Something thrown or fired from `at` with velocity `vel`, tumbling end over end. `fuse`: seconds until it
// goes off (or pours out smoke); `live`: what it shows; `quat`: which way up it leaves.
export function launch(
  kind: ProjectileKind,
  at: THREE.Vector3,
  vel: THREE.Vector3,
  fuse: number | null,
  live: Live,
  quat: THREE.Quaternion,
  stopSound: (() => void) | null = null,
) {
  const spinAxis = new THREE.Vector3().crossVectors(vel, UP).normalize()
  if (spinAxis.lengthSq() < 0.5) spinAxis.set(1, 0, 0)
  throwWorld.addThrown({
    id: throwWorld.newId(),
    kind,
    pos: at.clone(),
    vel: vel.clone(),
    quat: quat.clone(),
    spinAxis,
    spin: 8 + Math.random() * 6,
    fuse,
    onGround: false,
    resting: false,
    live,
    stopSound,
  })
}

// Something going off at `point` (thrown or fired, or a throwable still in the hand)
export function explodeAt(kind: ProjectileKind, point: THREE.Vector3) {
  const { blast } = PROJECTILES[kind]
  if (!blast) return
  blastDamage(point, blast.radius, blast.damage)
  addBlast(point, blast.radius)
  // Dust and smoke hanging about after the flash
  for (let i = 0; i < 8; i++) {
    const drift = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random(), Math.random() - 0.5).multiplyScalar(blast.radius)
    addPuff(point, 'smoke', 0.25 + Math.random() * 0.2, drift)
  }
  playExplosion(distanceFromPlayer(point), blast.radius / 2)
}

// A smoke grenade starting to pour out its smoke, wherever it's got to
export function popSmoke(can: Thrown) {
  const { duration } = THROWABLES.smoke.smoke!
  throwWorld.addSmoke({
    id: throwWorld.newId(),
    at: can.pos.clone(),
    can,
    age: 0,
    stopSound: playSmoke(duration, distanceFromPlayer(can.pos)),
  })
}
