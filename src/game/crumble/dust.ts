import * as THREE from 'three'

// Dust clouds where the tower breaks: plain data, drawn and animated by <Dust />

export type Puff = { at: THREE.Vector3; drift: THREE.Vector3; size: number; age: number; life: number }
export const DUST_POOL = 260
export const dust: Puff[] = []

export function addDust(at: { x: number; y: number; z: number }, count: number, spread = 1.2, size = 0.9) {
  for (let i = 0; i < count; i++) {
    if (dust.length >= DUST_POOL) dust.shift()
    dust.push({
      at: new THREE.Vector3(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.3) * spread * 0.5, at.z + (Math.random() - 0.5) * spread),
      drift: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.5),
      size: size * (0.6 + Math.random() * 0.8),
      age: 0,
      life: 1.4 + Math.random() * 1.2,
    })
  }
}
