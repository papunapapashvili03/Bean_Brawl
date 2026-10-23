import { useMemo } from 'react'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { paint } from './materials'

type Point = [number, number, number]

// A floor slab whose top surface runs from (z0, y0) to (z1, y1). Box faces: +x, -x, +y (top), -y, +z, -z.
export function Slab({
  z0,
  y0,
  z1,
  y1,
  width = 22,
  x = 0,
  thickness = 1.2,
  top = '#ff9ad5',
  side = '#9b5de5',
  topMaterial,
}: {
  z0: number
  y0: number
  z1: number
  y1: number
  width?: number
  x?: number
  thickness?: number
  top?: string
  side?: string
  topMaterial?: THREE.Material
}) {
  const { position, angle, length } = useMemo(() => {
    const length = Math.hypot(z0 - z1, y1 - y0) + 0.3 // slight overlap hides seams between slabs
    const angle = Math.atan2(y1 - y0, z0 - z1)
    const normal = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle))
    const mid = new THREE.Vector3(x, (y0 + y1) / 2, (z0 + z1) / 2).addScaledVector(normal, -thickness / 2)
    return { position: mid.toArray() as Point, angle, length }
  }, [z0, y0, z1, y1, x, thickness])
  const sideMat = paint(side)
  const materials = [sideMat, sideMat, topMaterial ?? paint(top), sideMat, sideMat, sideMat]
  return (
    <RigidBody type="fixed" position={position} rotation={[angle, 0, 0]} friction={1}>
      <mesh material={materials} receiveShadow castShadow>
        <boxGeometry args={[width, thickness, length]} />
      </mesh>
    </RigidBody>
  )
}

// Where a Beam sits: its box centre and orientation, with the top surface running from `from` to `to`
function beamTransform(from: Point, to: Point, thickness: number) {
  const a = new THREE.Vector3(...from)
  const b = new THREE.Vector3(...to)
  const pivot = new THREE.Object3D()
  pivot.position.copy(a).add(b).multiplyScalar(0.5)
  pivot.lookAt(b) // +z along the beam, no roll, so local +y is the surface's "up"
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pivot.quaternion)
  pivot.position.addScaledVector(up, -thickness / 2)
  // RigidBody applies `rotation` (Euler) to the physics body but ignores a `quaternion` prop, which would
  // leave a visually tilted ramp with a flat collider, so hand back Euler angles
  const e = new THREE.Euler().setFromQuaternion(pivot.quaternion)
  return {
    position: pivot.position.toArray() as Point,
    rotation: [e.x, e.y, e.z] as Point,
    length: a.distanceTo(b),
  }
}

// A walkable slab in any direction: the top surface runs from `from` to `to` (both on the surface centreline)
export function Beam({
  from,
  to,
  width,
  thickness = 1,
  top = '#3b6fd9',
  side = '#8a3fd9',
  topMaterial,
  extend = 0.2,
}: {
  from: Point
  to: Point
  width: number
  thickness?: number
  top?: string
  side?: string
  topMaterial?: THREE.Material
  extend?: number // extra length at both ends so neighbouring pieces overlap without gaps
}) {
  const t = useMemo(() => beamTransform(from, to, thickness), [from, to, thickness])
  const sideMat = paint(side)
  const materials = [sideMat, sideMat, topMaterial ?? paint(top), sideMat, sideMat, sideMat]
  return (
    <RigidBody type="fixed" position={t.position} rotation={t.rotation} friction={1}>
      <mesh material={materials} receiveShadow castShadow>
        <boxGeometry args={[width, thickness, t.length + extend * 2]} />
      </mesh>
    </RigidBody>
  )
}

// A solid axis-aligned block given by its min/max corners, optionally with a coloured trim around the top edge
export function Block({
  min,
  max,
  color,
  top,
  trim,
  collide = true,
}: {
  min: Point
  max: Point
  color: string
  top?: string
  trim?: string
  collide?: boolean
}) {
  const size: Point = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const center: Point = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const side = paint(color)
  const materials = [side, side, top ? paint(top) : side, side, side, side]
  const body = (
    <mesh material={materials} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  )
  const t = 0.25
  return (
    <group>
      {collide ? (
        <RigidBody type="fixed" position={center} friction={1}>
          {body}
        </RigidBody>
      ) : (
        <group position={center}>{body}</group>
      )}
      {trim && (
        <group position={[center[0], max[1] + t / 2 - 0.02, center[2]]}>
          {[-1, 1].map((s) => (
            <mesh key={`x${s}`} material={paint(trim)} position={[0, 0, (s * (size[2] - t)) / 2]}>
              <boxGeometry args={[size[0] + 0.02, t, t]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`z${s}`} material={paint(trim)} position={[(s * (size[0] - t)) / 2, 0, 0]}>
              <boxGeometry args={[t, t, size[2] + 0.02]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

// A flat strip decal lying on a floor at height y
export function Strip({
  x = 0,
  y,
  z,
  width,
  depth,
  color,
  map,
}: {
  x?: number
  y: number
  z: number
  width: number
  depth: number
  color?: string
  map?: THREE.Texture
}) {
  return (
    <mesh position={[x, y + 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color={color ?? '#ffffff'} map={map} roughness={0.8} />
    </mesh>
  )
}
