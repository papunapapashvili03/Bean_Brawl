import type * as THREE from 'three'
import { toon, toonMap } from '../../toon'
import { shapeGeometry, thinOutline, type Shape } from './parts'

type V3 = [number, number, number]

// One piece of a gun: a cel-shaded shape with a thin ink outline, in the gun's own space
// (muzzle towards +x, top towards +y, sides facing ±z)
export function Part({
  shape,
  color,
  map,
  at,
  rot,
  scale,
}: {
  shape: Shape
  color?: string
  map?: THREE.Texture
  at?: V3
  rot?: V3
  scale?: V3
}) {
  const geometry = shapeGeometry(shape)
  const material = map ? toonMap(map) : toon(color ?? '#808080')
  return (
    <group position={at} rotation={rot} scale={scale}>
      <mesh geometry={geometry} material={material} castShadow />
      <mesh geometry={geometry} material={thinOutline} />
    </group>
  )
}
