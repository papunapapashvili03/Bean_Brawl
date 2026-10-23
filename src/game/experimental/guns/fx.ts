import * as THREE from 'three'

// Short-lived shot effects, drawn and animated by <Effects />: bullet tracers, puffs (sparks, muzzle
// flashes, smoke), rockets in flight and explosions. Plain arrays so rapid fire costs no re-renders.

export type Tracer = { from: THREE.Vector3; dir: THREE.Vector3; length: number; age: number; life: number; width: number }
export type PuffKind = 'spark' | 'flash' | 'smoke' | 'ember'
export type Puff = { at: THREE.Vector3; kind: PuffKind; size: number; age: number; life: number; drift: THREE.Vector3 }
export type Rocket = { pos: THREE.Vector3; dir: THREE.Vector3; speed: number; gun: number; age: number; smoke: number }
export type Blast = { at: THREE.Vector3; radius: number; age: number }

export const TRACER_POOL = 96
export const PUFF_POOL = 160
export const ROCKET_POOL = 4
export const BLAST_POOL = 4

export const fx = {
  tracers: [] as Tracer[],
  puffs: [] as Puff[],
  rockets: [] as Rocket[],
  blasts: [] as Blast[],
}

const TRACER_SPEED = 380 // m/s: a streak racing from the muzzle to the hit point

// Drop the oldest when a pool is full
function push<T>(list: T[], item: T, max: number) {
  if (list.length >= max) list.shift()
  list.push(item)
}

export function addTracer(from: THREE.Vector3, to: THREE.Vector3, width = 0.03) {
  const dir = to.clone().sub(from)
  const length = dir.length()
  if (length < 0.01) return
  dir.divideScalar(length)
  push(fx.tracers, { from: from.clone(), dir, length, age: 0, life: length / TRACER_SPEED + 0.02, width }, TRACER_POOL)
}

const PUFF_LIFE: Record<PuffKind, number> = { spark: 0.14, flash: 0.06, smoke: 0.7, ember: 0.45 }

export function addPuff(at: THREE.Vector3, kind: PuffKind, size: number, drift = new THREE.Vector3()) {
  push(fx.puffs, { at: at.clone(), kind, size, age: 0, life: PUFF_LIFE[kind], drift }, PUFF_POOL)
}

export function addRocket(pos: THREE.Vector3, dir: THREE.Vector3, speed: number, gun: number) {
  push(fx.rockets, { pos: pos.clone(), dir: dir.clone().normalize(), speed, gun, age: 0, smoke: 0 }, ROCKET_POOL)
}

export function addBlast(at: THREE.Vector3, radius: number) {
  push(fx.blasts, { at: at.clone(), radius, age: 0 }, BLAST_POOL)
  // A spray of embers flung out from the centre
  for (let i = 0; i < 14; i++) {
    const drift = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 5)
    addPuff(at, 'ember', 0.09 + Math.random() * 0.06, drift)
  }
}
