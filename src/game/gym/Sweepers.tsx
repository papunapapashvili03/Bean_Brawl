import { useMemo, useRef } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { sfx } from '../race/sound'
import { COLORS, SPIN, SWEEPERS } from './course'

// 5. Sweeper Spin: a round arena painted like a pinwheel, with two bars sweeping round its hub in opposite
// directions: a low red one to jump over and a high blue one to crouch (C) under. Getting caught by either
// throws you the way it's sweeping.

type Sweeper = (typeof SWEEPERS)[number]
const THICKNESS = 3
const Y_AXIS = new THREE.Vector3(0, 1, 0)

function pinwheel() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const slices = 16
  for (let i = 0; i < slices; i++) {
    g.fillStyle = COLORS.candy[i % COLORS.candy.length]
    g.beginPath()
    g.moveTo(size / 2, size / 2)
    g.arc(size / 2, size / 2, size / 2, (i / slices) * Math.PI * 2, ((i + 1) / slices) * Math.PI * 2)
    g.closePath()
    g.fill()
  }
  // A white ring near the rim marks the edge
  g.strokeStyle = '#ffffff'
  g.lineWidth = 10
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2 - 16, 0, Math.PI * 2)
  g.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function Arena() {
  const top = useMemo(() => new THREE.MeshStandardMaterial({ map: pinwheel(), roughness: 0.8 }), [])
  const side = paint(COLORS.floorSide)
  return (
    <RigidBody type="fixed" colliders={false} position={[0, -THICKNESS / 2, SPIN.z]} friction={1}>
      <CylinderCollider args={[THICKNESS / 2, SPIN.radius]} />
      {/* Cylinder faces: side, top, bottom */}
      <mesh material={[side, top, side]} receiveShadow castShadow>
        <cylinderGeometry args={[SPIN.radius, SPIN.radius, THICKNESS, 64]} />
      </mesh>
    </RigidBody>
  )
}

function Hub() {
  const h = 3
  return (
    <RigidBody type="fixed" colliders={false} position={[0, h / 2, SPIN.z]}>
      <CylinderCollider args={[h / 2, SPIN.hub]} />
      <mesh material={paint(COLORS.trim)} castShadow>
        <cylinderGeometry args={[SPIN.hub, SPIN.hub, h, 32]} />
      </mesh>
      <mesh material={paint('#ff5a5f')} position={[0, h / 2 + 0.35, 0]} castShadow>
        <sphereGeometry args={[0.7, 24, 16]} />
      </mesh>
    </RigidBody>
  )
}

function SweeperBar({ sweeper }: { sweeper: Sweeper }) {
  const body = useRef<RapierRigidBody>(null)
  const turn = useMemo(() => new THREE.Quaternion(), [])
  const length = SPIN.radius * 2 - 0.6
  const angle = (t: number) => sweeper.offset + sweeper.spin * t
  const y = sweeper.y + sweeper.height / 2
  useKinematic(body, (t) => ({ position: { x: 0, y, z: SPIN.z }, rotation: turn.setFromAxisAngle(Y_AXIS, angle(t)) }), 'hazard')
  const stripes = useMemo(() => {
    const n = 10
    return Array.from({ length: n }, (_, i) => -length / 2 + (i + 0.5) * (length / n))
  }, [length])
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, y, SPIN.z]}
      onCollisionEnter={knockOnHit((player) => {
        sfx.knock()
        // The way the bar sweeps at the player's distance from the hub (at least a firm shove)
        const rx = player.x
        const rz = player.z - SPIN.z
        const vx = sweeper.spin * rz
        const vz = -sweeper.spin * rx
        const speed = Math.hypot(vx, vz) || 1
        const push = Math.max(7, speed * 1.2)
        return { x: (vx / speed) * push, y: 5, z: (vz / speed) * push }
      })}
    >
      <CuboidCollider args={[length / 2, sweeper.height / 2, 0.3]} />
      <mesh material={paint(sweeper.color)} castShadow>
        <boxGeometry args={[length, sweeper.height, 0.6]} />
      </mesh>
      {/* White bands along it, and a padded cap on each end */}
      {stripes.map((x, i) =>
        i % 2 ? null : (
          <mesh key={x} material={paint('#ffffff')} position={[x, 0, 0]}>
            <boxGeometry args={[length / 10, sweeper.height + 0.02, 0.62]} />
          </mesh>
        ),
      )}
      {[-1, 1].map((s) => (
        <mesh key={s} material={paint(COLORS.trim)} position={[(s * length) / 2, 0, 0]} castShadow>
          <sphereGeometry args={[sweeper.height * 0.55, 16, 12]} />
        </mesh>
      ))}
    </RigidBody>
  )
}

export function SweeperSpin() {
  return (
    <group>
      <Arena />
      <Hub />
      {SWEEPERS.map((s, i) => (
        <SweeperBar key={i} sweeper={s} />
      ))}
    </group>
  )
}
