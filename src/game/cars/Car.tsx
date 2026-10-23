import { useMemo, type Ref } from 'react'
import * as THREE from 'three'
import { ConvexHullCollider, CuboidCollider, RigidBody, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier'
import { mergeParts, type CarBuild, type P3, type Part } from './kit'

// Draws a car model (see ./kit) and gives it a body: parked (fixed, shaped like the car, to bump into and
// climb on) or loose (dynamic, a box for the body and one for the cabin, free to slide about)

function PartMesh({ p }: { p: Part }) {
  // Bodies cast shadows but don't take them: their smooth curves would speckle with their own shadow
  const mesh = p.geometry && p.material && <mesh geometry={p.geometry} material={p.material} castShadow={p.shadow} />
  if (!p.position && !p.rotation && !p.children) return mesh
  return (
    <group position={p.position} rotation={p.rotation}>
      {mesh}
      {p.children?.map((c, i) => (
        <PartMesh key={i} p={c} />
      ))}
    </group>
  )
}

export function CarBody({
  build,
  scale,
  position,
  yaw = 0,
  dynamic = false,
  friction,
  onCollisionEnter,
  ref,
}: {
  build: () => CarBuild
  scale: number
  position: P3
  yaw?: number
  dynamic?: boolean
  friction?: number
  onCollisionEnter?: (payload: CollisionEnterPayload) => void
  ref?: Ref<RapierRigidBody>
}) {
  const car = useMemo(() => {
    const b = build()
    return { ...b, parts: mergeParts(b.parts) }
  }, [build])
  // The collider's shapes, in the scaled car's units
  const hulls = useMemo(
    () => car.hulls.map((g) => Float32Array.from(g.getAttribute('position').array as Float32Array, (v) => v * scale)),
    [car, scale],
  )
  // Loose, a box round each part (the lowest reaching down to the ground, where the tyres touch)
  const boxes = useMemo(
    () =>
      car.hulls.map((g, i) => {
        g.computeBoundingBox()
        const b = g.boundingBox!.clone()
        if (i === 0) b.min.y = 0.02
        const size = b.getSize(new THREE.Vector3()).multiplyScalar(scale / 2)
        const centre = b.getCenter(new THREE.Vector3()).multiplyScalar(scale)
        return { half: size.toArray() as P3, centre: centre.toArray() as P3 }
      }),
    [car, scale],
  )
  return (
    <RigidBody
      ref={ref}
      type={dynamic ? 'dynamic' : 'fixed'}
      colliders={false}
      position={position}
      rotation={[0, yaw, 0]}
      linearDamping={dynamic ? 0.25 : 0}
      angularDamping={dynamic ? 1.2 : 0}
      onCollisionEnter={onCollisionEnter}
    >
      {dynamic
        ? boxes.map((b, i) => <CuboidCollider key={i} args={b.half} position={b.centre} friction={friction} density={0.35} />)
        : hulls.map((h, i) => <ConvexHullCollider key={i} args={[h]} friction={friction} />)}
      <group scale={scale}>
        {car.parts.map((p, i) => (
          <PartMesh key={i} p={p} />
        ))}
      </group>
    </RigidBody>
  )
}
