import { useMemo, useRef } from 'react'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { Beam, Slab } from '../race/parts'
import { sfx } from '../race/sound'
import { COLORS, STAIRS, WHIRL, WHIRLYGIGS, stairsY } from './course'

// 4. Whirlygig Stairs: a wide stairway up to the finish, purple walls either side, and two whirlygigs over
// it: long pink bars turning upright across the stairs from a yellow gantry, sweeping down to just off the
// steps at the bottom of each turn, one off to the left and the next off to the right. Caught by one, you're
// thrown back down the stairs.

type Whirl = (typeof WHIRLYGIGS)[number]
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function Whirlygig({ whirl }: { whirl: Whirl }) {
  const body = useRef<RapierRigidBody>(null)
  const turn = useMemo(() => new THREE.Quaternion(), [])
  const hub = { x: whirl.x, y: stairsY(whirl.z) + WHIRL.hubHeight, z: whirl.z }
  useKinematic(body, (t) => ({ position: hub, rotation: turn.setFromAxisAngle(Z_AXIS, whirl.offset + whirl.spin * t) }), 'hazard')
  const knock = knockOnHit((p) => {
    sfx.knock()
    const vx = -whirl.spin * (p.y - hub.y)
    return { x: Math.max(-8, Math.min(8, vx * 1.2)), y: 5, z: 8 }
  })
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[hub.x, hub.y, hub.z]} onCollisionEnter={knock}>
      <CuboidCollider args={[WHIRL.radius, WHIRL.blade / 2, WHIRL.thick / 2]} />
      <mesh material={paint(COLORS.pink)} castShadow>
        <boxGeometry args={[WHIRL.radius * 2, WHIRL.blade, WHIRL.thick]} />
      </mesh>
      {[-0.8, -0.5, 0.5, 0.8].map((f) => (
        <mesh key={f} material={paint(COLORS.pinkLight)} position={[WHIRL.radius * f, 0, 0]}>
          <boxGeometry args={[0.4, WHIRL.blade + 0.02, WHIRL.thick + 0.02]} />
        </mesh>
      ))}
      <mesh material={paint(COLORS.trim)} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.75, 0.75, 0.9, 24]} />
      </mesh>
    </RigidBody>
  )
}

// The gantry: posts either side of the stairs and a beam across, high above the whirlygig's turn, with a
// hanger down behind the bar to its axle
function Gantry({ x: hubX, z }: { x: number; z: number }) {
  const base = stairsY(z)
  const hubY = base + WHIRL.hubHeight
  const top = hubY + WHIRL.radius + 1
  const x = STAIRS.half + 0.8
  const yellow = paint(COLORS.trim)
  return (
    <group position={[0, 0, z]}>
      {[-1, 1].map((s) => (
        <mesh key={s} material={yellow} position={[s * x, (base + top) / 2, 0]} castShadow>
          <boxGeometry args={[0.7, top - base, 0.7]} />
        </mesh>
      ))}
      <mesh material={yellow} position={[0, top, 0]} castShadow>
        <boxGeometry args={[x * 2 + 0.7, 0.7, 0.7]} />
      </mesh>
      <mesh material={yellow} position={[hubX, (hubY + top) / 2, -0.9]}>
        <boxGeometry args={[0.3, top - hubY, 0.3]} />
      </mesh>
      <mesh material={yellow} position={[hubX, hubY, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.9, 12]} />
      </mesh>
    </group>
  )
}

// Steps painted across the stairway (it's a ramp underfoot)
function stepsTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 64
  const g = canvas.getContext('2d')!
  g.fillStyle = '#ffd23f'
  g.fillRect(0, 0, 16, 64)
  g.fillStyle = '#ffb21a'
  g.fillRect(0, 48, 16, 16)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

export function WhirlygigStairs() {
  const top = useMemo(() => {
    const map = stepsTexture()
    map.repeat.set(1, Math.hypot(STAIRS.z0 - STAIRS.z1, STAIRS.y1 - STAIRS.y0) / 1)
    return new THREE.MeshStandardMaterial({ map, roughness: 0.75 })
  }, [])
  const wall = (x: number) => (
    <Beam from={[x, STAIRS.y0 + 1.2, STAIRS.z0]} to={[x, STAIRS.y1 + 1.2, STAIRS.z1]} width={0.6} thickness={4.2} top={COLORS.trim} side={COLORS.side} />
  )
  return (
    <group>
      <Slab z0={STAIRS.z0} y0={STAIRS.y0} z1={STAIRS.z1} y1={STAIRS.y1} width={STAIRS.half * 2} thickness={3} side={COLORS.side} topMaterial={top} />
      {wall(-STAIRS.half - 0.3)}
      {wall(STAIRS.half + 0.3)}
      {WHIRLYGIGS.map((w, i) => (
        <group key={i}>
          <Whirlygig whirl={w} />
          <Gantry x={w.x} z={w.z} />
        </group>
      ))}
    </group>
  )
}
