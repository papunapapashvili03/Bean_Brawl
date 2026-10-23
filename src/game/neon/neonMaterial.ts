import * as THREE from 'three'

// Unlit, un-tonemapped colour brighter than 1, so the bloom pass picks it up as neon glow
const cache = new Map<string, THREE.MeshBasicMaterial>()

export function neon(color: string, intensity = 2.5) {
  const key = `${color}:${intensity}`
  let m = cache.get(key)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false })
    cache.set(key, m)
  }
  return m
}
