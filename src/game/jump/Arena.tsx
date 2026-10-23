import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { COUNTDOWN_SECONDS, STEP, playerPosition, raceClock } from '../race/race'
import { useKinematic } from '../race/kinematic'
import { sfx, withVolume } from '../race/sound'
import { BEAM_HALF, HIGH_Y, LOW_Y, PILLAR, RADIUS, REACH, SECTIONS, SECTION_ANGLE, SECTION_COLOURS, THICK, along } from './course'
import { dropAt, dropped, gone, highAngle, highSpin, lowAngle, lowSpin, round, warned } from './state'

// The platform: eight sections round the pillar, each a collider (switched off when it drops) and a mesh
// that flashes as it's about to go and then falls away; the pillar; and the two beams, turning on their
// timetable (./state), throwing anyone they hit.

const DROP_TIME = 1.4 // seconds a dropped section takes to fall out of sight
const ARC_STEPS = 10

// A section's outline: from the pillar out to the edge, between its two angles
function sectionShape(s: number) {
  const a0 = s * SECTION_ANGLE
  const shape = new THREE.Shape()
  // (In the shape's own x, y: laid flat below, its y becomes -z, so angles run the same way as in ./course)
  shape.moveTo(PILLAR * Math.cos(a0), PILLAR * Math.sin(a0))
  for (let k = 0; k <= ARC_STEPS; k++) {
    const a = a0 + (k / ARC_STEPS) * SECTION_ANGLE
    shape.lineTo(RADIUS * Math.cos(a), RADIUS * Math.sin(a))
  }
  for (let k = ARC_STEPS; k >= 0; k--) {
    const a = a0 + (k / ARC_STEPS) * SECTION_ANGLE
    shape.lineTo(PILLAR * Math.cos(a), PILLAR * Math.sin(a))
  }
  return shape
}
function sectionGeometry(s: number) {
  const g = new THREE.ExtrudeGeometry(sectionShape(s), { depth: THICK, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.08, bevelSegments: 2, curveSegments: 1 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, -THICK - 0.06, 0)
  return g
}
const GEOMETRIES = Array.from({ length: SECTIONS }, (_, s) => sectionGeometry(s))
const LOOKS = SECTION_COLOURS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0 }))

// Its collider: the hull of its outer arc and the chord across its inner end (near enough: that's inside the pillar)
function sectionPoints(s: number) {
  const points: number[] = []
  const a0 = s * SECTION_ANGLE
  const edge: [number, number][] = [along(a0, PILLAR * 0.9)]
  for (let k = 0; k <= ARC_STEPS; k++) edge.push(along(a0 + (k / ARC_STEPS) * SECTION_ANGLE, RADIUS))
  edge.push(along(a0 + SECTION_ANGLE, PILLAR * 0.9))
  for (const y of [0, -THICK]) for (const [x, z] of edge) points.push(x, y, z)
  return new Float32Array(points)
}

export function Arena() {
  return (
    <>
      <Sections />
      <Pillar />
      <Beam low />
      <Beam />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------

function Sections() {
  const { world, rapier } = useRapier()
  const colliders = useRef<RapierCollider[]>([])
  const groups = useRef<(THREE.Group | null)[]>([])

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    colliders.current = Array.from({ length: SECTIONS }, (_, s) => world.createCollider(rapier.ColliderDesc.convexHull(sectionPoints(s))!, body))
    return () => {
      // (The physics world may have gone already, along with everything in it)
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body)
      colliders.current = []
    }
  }, [world, rapier])

  // Each in its turn: gone
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (t < COUNTDOWN_SECONDS || round.over) return
    for (let s = 0; s < SECTIONS; s++) {
      if (dropped[s] || t < dropAt[s]) continue
      dropped[s] = 1
      colliders.current[s]?.setEnabled(false)
      const [x, z] = along((s + 0.5) * SECTION_ANGLE, RADIUS * 0.6)
      const near = Math.hypot(x - playerPosition.x, z - playerPosition.z)
      withVolume(Math.max(0.3, 1 - near / 20), sfx.floorDrop)
    }
  })

  // Flashing as it's about to go; then falling, tipping outwards
  useFrame(() => {
    const t = raceClock()
    for (let s = 0; s < SECTIONS; s++) {
      const group = groups.current[s]
      if (!group) continue
      const look = LOOKS[s]
      look.emissiveIntensity = warned(s, t) ? 0.25 + 0.25 * Math.sin(t * (14 + 10 * (t - dropAt[s] + 3))) : 0
      if (!gone(s)) {
        group.position.y = 0
        group.rotation.set(0, 0, 0)
        group.visible = true
        continue
      }
      const d = t - dropAt[s]
      group.visible = d < DROP_TIME
      const [ox, oz] = along((s + 0.5) * SECTION_ANGLE, 1)
      group.position.set(ox * d * 2, -9 * d * d, oz * d * 2)
      group.rotation.set(oz * d * 0.5, 0, -ox * d * 0.5)
    }
  })

  return (
    <>
      {GEOMETRIES.map((g, s) => (
        <group
          key={s}
          ref={(m) => {
            groups.current[s] = m
          }}
        >
          <mesh geometry={g} material={LOOKS[s]} receiveShadow castShadow />
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------

const PILLAR_H = HIGH_Y + 0.9
const pillarLook = new THREE.MeshStandardMaterial({ color: '#f4f1ff', roughness: 0.45 })
const bandLook = new THREE.MeshStandardMaterial({ color: '#7a4dff', roughness: 0.4 })

function Pillar() {
  return (
    <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
      <CylinderCollider args={[(PILLAR_H + THICK) / 2, PILLAR]} position={[0, (PILLAR_H - THICK) / 2, 0]} />
      <mesh material={pillarLook} position={[0, (PILLAR_H - THICK) / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[PILLAR, PILLAR + 0.15, PILLAR_H + THICK, 32]} />
      </mesh>
      <mesh material={bandLook} position={[0, PILLAR_H + 0.05, 0]} castShadow>
        <cylinderGeometry args={[PILLAR + 0.12, PILLAR + 0.12, 0.3, 32]} />
      </mesh>
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// A beam: a bar right across the platform through the pillar, turning round it. Hit by it, you're thrown
// the way it's going (harder the further out, where it's going faster), and up.

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const LOW_LOOK = new THREE.MeshStandardMaterial({ color: '#ff4d5e', roughness: 0.35, metalness: 0.1 })
const HIGH_LOOK = new THREE.MeshStandardMaterial({ color: '#4f6bff', roughness: 0.35, metalness: 0.1 })
const GLOW_LOW = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd23f', emissiveIntensity: 1.2 })
const GLOW_HIGH = new THREE.MeshStandardMaterial({ color: '#d9f6ff', emissive: '#7df9ff', emissiveIntensity: 1.2 })
const BANDS = 9

function Beam({ low = false }: { low?: boolean }) {
  const body = useRef<RapierRigidBody>(null)
  const turn = useMemo(() => new THREE.Quaternion(), [])
  const y = low ? LOW_Y : HIGH_Y
  const angle = low ? lowAngle : highAngle
  const spin = low ? lowSpin : highSpin
  useKinematic(body, (t) => ({ position: { x: 0, y, z: 0 }, rotation: turn.setFromAxisAngle(Y_AXIS, angle(t)) }), 'hazard')
  const knock = knockOnHit((p) => {
    const w = spin(raceClock())
    if (!w) return { x: 0, y: 2, z: 0 }
    sfx.knock()
    // (Turning about +y at w, a point at (x, z) is going (w z, -w x))
    const vx = w * p.z
    const vz = -w * p.x
    const speed = Math.hypot(vx, vz) || 1
    const push = Math.max(8, speed * 1.4)
    return { x: (vx / speed) * push, y: 6, z: (vz / speed) * push }
  })
  const look = low ? LOW_LOOK : HIGH_LOOK
  const glow = low ? GLOW_LOW : GLOW_HIGH
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, y, 0]} onCollisionEnter={knock}>
      <CuboidCollider args={[REACH, BEAM_HALF, BEAM_HALF]} />
      <mesh material={look} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[BEAM_HALF, BEAM_HALF, REACH * 2, 14]} />
      </mesh>
      {Array.from({ length: BANDS * 2 }, (_, k) => {
        const x = (k < BANDS ? -1 : 1) * (PILLAR + 0.9 + (k % BANDS) * ((REACH - PILLAR - 1.4) / (BANDS - 1)))
        return (
          <mesh key={k} material={glow} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[BEAM_HALF + 0.02, BEAM_HALF + 0.02, 0.16, 14]} />
          </mesh>
        )
      })}
      {[-1, 1].map((s) => (
        <mesh key={s} material={glow} position={[s * REACH, 0, 0]}>
          <sphereGeometry args={[BEAM_HALF * 1.6, 14, 10]} />
        </mesh>
      ))}
    </RigidBody>
  )
}
