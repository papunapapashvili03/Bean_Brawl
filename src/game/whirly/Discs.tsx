import { useEffect, useMemo, useRef } from 'react'
import { ConvexHullCollider, CuboidCollider, CylinderCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { Block } from '../race/parts'
import { surfaces } from '../race/race'
import { sfx } from '../race/sound'
import { ARM, BUMPERS, COLORS, DISC, DISC_BASE, DISCS } from './course'

// 1. Spinning Discs: four big discs on a purple base, each turning (standing on one carries you round) with a
// pink arm sweeping round its hub, faster and the other way, just off the disc: jump it, or be thrown. Foam
// bumpers in the middle push you off them.

type Disc = (typeof DISCS)[number]
const Y_AXIS = new THREE.Vector3(0, 1, 0)

// The disc's face: wedges of two blues, and a white ring near the rim
function discFace() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const slices = 8
  for (let i = 0; i < slices; i++) {
    g.fillStyle = i % 2 ? '#2f9cff' : '#7fd3ff'
    g.beginPath()
    g.moveTo(size / 2, size / 2)
    g.arc(size / 2, size / 2, size / 2, (i / slices) * Math.PI * 2, ((i + 1) / slices) * Math.PI * 2)
    g.closePath()
    g.fill()
  }
  g.strokeStyle = '#ffffff'
  g.lineWidth = 9
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2 - 18, 0, Math.PI * 2)
  g.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
const FACE = new THREE.MeshStandardMaterial({ map: discFace(), roughness: 0.7 })

function SpinningDisc({ disc }: { disc: Disc }) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const turn = useMemo(() => new THREE.Quaternion(), [])
  const y = DISC.top - DISC.thickness / 2
  useKinematic(body, (t) => ({ position: { x: disc.x, y, z: disc.z }, rotation: turn.setFromAxisAngle(Y_AXIS, disc.spin * t) }))
  // Standing on it carries you round: a point on a disc turning at w about +y goes w * (dz, -dx)
  useEffect(() => {
    const handle = collider.current!.handle
    surfaces.set(handle, (p) => ({ x: disc.spin * (p.z - disc.z), z: -disc.spin * (p.x - disc.x) }))
    return () => {
      surfaces.delete(handle)
    }
  }, [disc])
  const rim = paint(COLORS.pink)
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[disc.x, y, disc.z]}>
      <CylinderCollider ref={collider} args={[DISC.thickness / 2, DISC.radius]} />
      <mesh material={[rim, FACE, rim]} receiveShadow castShadow>
        <cylinderGeometry args={[DISC.radius, DISC.radius, DISC.thickness, 64]} />
      </mesh>
    </RigidBody>
  )
}

// The arm: from the hub out to the rim, sweeping round. Hit by it, you're thrown the way it's going.
function Arm({ disc }: { disc: Disc }) {
  const body = useRef<RapierRigidBody>(null)
  const turn = useMemo(() => new THREE.Quaternion(), [])
  const length = ARM.reach - DISC.hub
  useKinematic(body, (t) => ({ position: { x: disc.x, y: ARM.y, z: disc.z }, rotation: turn.setFromAxisAngle(Y_AXIS, disc.offset + disc.arm * t) }), 'hazard')
  const knock = knockOnHit((p) => {
    sfx.knock()
    const vx = disc.arm * (p.z - disc.z)
    const vz = -disc.arm * (p.x - disc.x)
    const speed = Math.hypot(vx, vz) || 1
    const push = Math.max(7, speed * 1.4)
    return { x: (vx / speed) * push, y: 5, z: (vz / speed) * push }
  })
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[disc.x, ARM.y, disc.z]} onCollisionEnter={knock}>
      <CuboidCollider args={[length / 2, ARM.half, 0.25]} position={[DISC.hub + length / 2, 0, 0]} />
      <CylinderCollider args={[0.55, DISC.hub]} position={[0, 0.2, 0]} />
      <mesh material={paint(COLORS.pink)} position={[DISC.hub + length / 2, 0, 0]} castShadow>
        <boxGeometry args={[length, ARM.half * 2, 0.5]} />
      </mesh>
      {[0.25, 0.5, 0.75].map((f) => (
        <mesh key={f} material={paint(COLORS.pinkLight)} position={[DISC.hub + length * f, 0, 0]}>
          <boxGeometry args={[0.3, ARM.half * 2 + 0.02, 0.52]} />
        </mesh>
      ))}
      <mesh material={paint(COLORS.trim)} position={[ARM.reach, 0, 0]} castShadow>
        <sphereGeometry args={[0.32, 16, 12]} />
      </mesh>
      <mesh material={paint(COLORS.pink)} position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[DISC.hub, DISC.hub + 0.1, 1.1, 24]} />
      </mesh>
      <mesh material={paint('#ffffff')} position={[0, 0.8, 0]} castShadow>
        <sphereGeometry args={[0.45, 18, 12]} />
      </mesh>
    </RigidBody>
  )
}

// A foam bumper: a yellow wedge of a triangle, standing on the floor; walk into it and it bounces you off
export function Bumper({ x, y, z, size, turn }: { x: number; y: number; z: number; size: number; turn: number }) {
  const h = 0.9
  const r = size / Math.sqrt(3)
  const points = useMemo(() => {
    const p: number[] = []
    for (const py of [0, h]) for (let k = 0; k < 3; k++) p.push(r * Math.sin((k * 2 * Math.PI) / 3), py, r * Math.cos((k * 2 * Math.PI) / 3))
    return new Float32Array(p)
  }, [r])
  const knock = knockOnHit((p) => {
    const dx = p.x - x
    const dz = p.z - z
    const d = Math.hypot(dx, dz) || 1
    sfx.bounce()
    return { x: (dx / d) * 8, y: 3, z: (dz / d) * 8 }
  })
  return (
    <RigidBody type="fixed" colliders={false} position={[x, y, z]} rotation={[0, turn, 0]} onCollisionEnter={knock}>
      <ConvexHullCollider args={[points]} />
      <mesh material={paint(COLORS.trim)} position={[0, h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 1.04, h, 3]} />
      </mesh>
      <mesh material={paint('#7a4dff')} position={[0, h + 0.01, 0]}>
        <cylinderGeometry args={[r * 0.55, r * 0.55, 0.02, 3]} />
      </mesh>
    </RigidBody>
  )
}

export function SpinningDiscs() {
  return (
    <group>
      <Block min={DISC_BASE.min} max={DISC_BASE.max} color={COLORS.side} top="#a77bff" trim={COLORS.pink} />
      {DISCS.map((d, i) => (
        <group key={i}>
          <SpinningDisc disc={d} />
          <Arm disc={d} />
        </group>
      ))}
      {BUMPERS.map((b, i) => (
        <Bumper key={i} {...b} y={0} />
      ))}
    </group>
  )
}
