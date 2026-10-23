import type * as THREE from 'three'
import { outline } from './toon'

export type Transform = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

// A cel-shaded mesh with the character's ink outline around it
export function Outlined({
  geometry,
  material,
  ...transform
}: { geometry: THREE.BufferGeometry; material: THREE.Material } & Transform) {
  return (
    <group {...transform}>
      <mesh geometry={geometry} material={material} castShadow />
      <mesh geometry={geometry} material={outline} />
    </group>
  )
}
