import { useMemo } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGrabEdges, type GrabEdge, type GrabKind } from './grab'
import { TapedRod } from './GripTape'
import { paint } from './race/materials'

// Test ground for hanging, past the far end of the playground (runners face -z).
// Every grabbable edge wears striped grip tape so you can read what the hands will catch.
// Bars are visual only (no collider), so rising or flinging past one never bonks your head.

type P3 = [number, number, number]

const OUT_Z = { x: 0, z: 1 } // all walls here face the spawn
const edge = (kind: GrabKind, a: P3, b: P3): GrabEdge => ({
  kind,
  a: { x: a[0], y: a[1], z: a[2] },
  b: { x: b[0], y: b[1], z: b[2] },
  out: OUT_Z,
})

// 1. Ledge steps: one you can simply jump onto (so no grab), one to jump and catch,
// one right at full arm stretch, and one out of reach
const STEP_FRONT = -24
const STEPS = [
  { x: -9.5, h: 1.4, color: '#7b61ff' },
  { x: -7.5, h: 2.4, color: '#3fa9f5' },
  { x: -5.5, h: 3.5, color: '#4dd4ac' },
  { x: -3.5, h: 4.5, color: '#ff5a5f' },
]

// 2. Pull-up bar
const BAR = { x0: -0.5, x1: 2.5, y: 2.8, z: -25 }

// 3. Monkey bars between two platforms: jump up, catch a rung, Space to fling to the next
const MONKEY = { x0: 5, x1: 8, y: 3.4, platformTop: 1.4 }
const RUNG_Z = Array.from({ length: 7 }, (_, i) => -24.9 - i)

// 4. Long shimmy wall
const SHIMMY = { x0: -10.5, x1: -2.5, h: 3, front: -36 }

// 5. Climbing wall: hop hold to hold, then pull up over the top
const CLIMB = { x0: -1, x1: 3, h: 6, front: -38 }
const HOLDS: { x: number; y: number; color: string }[] = [
  { x: 0.7, y: 2.4, color: '#ff4fd8' },
  { x: 1.3, y: 3.6, color: '#ffd23f' },
  { x: 0.7, y: 4.8, color: '#3de8ff' },
]
const HOLD_HALF = 0.18

const EDGES: GrabEdge[] = [
  ...STEPS.map((s) => edge('ledge', [s.x - 1, s.h, STEP_FRONT], [s.x + 1, s.h, STEP_FRONT])),
  edge('bar', [BAR.x0, BAR.y, BAR.z], [BAR.x1, BAR.y, BAR.z]),
  ...RUNG_Z.map((z) => edge('bar', [MONKEY.x0, MONKEY.y, z], [MONKEY.x1, MONKEY.y, z])),
  edge('ledge', [SHIMMY.x0, SHIMMY.h, SHIMMY.front], [SHIMMY.x1, SHIMMY.h, SHIMMY.front]),
  ...HOLDS.map((h) => edge('hold', [h.x - HOLD_HALF, h.y, CLIMB.front + 0.1], [h.x + HOLD_HALF, h.y, CLIMB.front + 0.1])),
  edge('ledge', [CLIMB.x0, CLIMB.h, CLIMB.front], [CLIMB.x1, CLIMB.h, CLIMB.front]),
]

const METAL = new THREE.MeshStandardMaterial({ color: '#c9ccd6', metalness: 0.6, roughness: 0.35 })

// Solid block from min to max corner
function Block({ min, max, color }: { min: P3; max: P3; color: string }) {
  const size: P3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const centre: P3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  return (
    <RigidBody type="fixed" colliders={false} position={centre}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      <mesh castShadow receiveShadow material={paint(color)}>
        <boxGeometry args={size} />
      </mesh>
    </RigidBody>
  )
}

function Post({ x, z, y0, y1 }: { x: number; z: number; y0: number; y1: number }) {
  const h = y1 - y0
  return (
    <RigidBody type="fixed" colliders={false} position={[x, y0 + h / 2, z]}>
      <CylinderCollider args={[h / 2, 0.09]} />
      <mesh castShadow material={METAL}>
        <cylinderGeometry args={[0.09, 0.09, h, 12]} />
      </mesh>
    </RigidBody>
  )
}

// A wall with a taped, rounded lip along its top front edge
function LedgeWall({ x0, x1, h, front, depth, color }: { x0: number; x1: number; h: number; front: number; depth: number; color: string }) {
  const a = useMemo<P3>(() => [x0, h, front], [x0, h, front])
  const b = useMemo<P3>(() => [x1, h, front], [x1, h, front])
  return (
    <>
      <Block min={[x0, 0, front - depth]} max={[x1, h, front]} color={color} />
      <TapedRod a={a} b={b} radius={0.07} tape="lip" />
    </>
  )
}

const holdGeometry = new THREE.SphereGeometry(1, 16, 10)

export function HangLab() {
  useGrabEdges(EDGES)
  const rails = useMemo(
    () =>
      [MONKEY.x0 - 0.1, MONKEY.x1 + 0.1].map((x) => ({
        a: [x, MONKEY.y, -24.4] as P3,
        b: [x, MONKEY.y, RUNG_Z[RUNG_Z.length - 1] - 0.8] as P3,
      })),
    [],
  )
  const rungs = useMemo(
    () => RUNG_Z.map((z) => ({ a: [MONKEY.x0 - 0.1, MONKEY.y, z] as P3, b: [MONKEY.x1 + 0.1, MONKEY.y, z] as P3 })),
    [],
  )
  const bar = useMemo(() => ({ a: [BAR.x0 - 0.2, BAR.y, BAR.z] as P3, b: [BAR.x1 + 0.2, BAR.y, BAR.z] as P3 }), [])

  return (
    <group>
      {/* 1. Ledge steps */}
      {STEPS.map((s) => (
        <LedgeWall key={s.x} x0={s.x - 1} x1={s.x + 1} h={s.h} front={STEP_FRONT} depth={3} color={s.color} />
      ))}

      {/* 2. Pull-up bar */}
      <Post x={bar.a[0]} z={BAR.z} y0={0} y1={BAR.y + 0.1} />
      <Post x={bar.b[0]} z={BAR.z} y0={0} y1={BAR.y + 0.1} />
      <TapedRod a={bar.a} b={bar.b} radius={0.05} tape="bar" />

      {/* 3. Monkey bars */}
      <Block min={[4.5, 0, -24.5]} max={[8.5, MONKEY.platformTop, -22]} color="#ffa94d" />
      <Block min={[4.5, 0, -34]} max={[8.5, MONKEY.platformTop, -31.5]} color="#ffa94d" />
      {rails.map((r, i) => (
        <group key={i}>
          <mesh
            material={METAL}
            position={[r.a[0], MONKEY.y, (r.a[2] + r.b[2]) / 2]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.06, 0.06, r.a[2] - r.b[2], 10]} />
          </mesh>
          <Post x={r.a[0]} z={r.a[2]} y0={MONKEY.platformTop} y1={MONKEY.y + 0.06} />
          <Post x={r.a[0]} z={r.b[2]} y0={MONKEY.platformTop} y1={MONKEY.y + 0.06} />
        </group>
      ))}
      {rungs.map((r) => (
        <TapedRod key={r.a[2]} a={r.a} b={r.b} radius={0.05} tape="bar" />
      ))}

      {/* 4. Shimmy wall */}
      <LedgeWall x0={SHIMMY.x0} x1={SHIMMY.x1} h={SHIMMY.h} front={SHIMMY.front} depth={3} color="#b7e04a" />

      {/* 5. Climbing wall with handholds */}
      <LedgeWall x0={CLIMB.x0} x1={CLIMB.x1} h={CLIMB.h} front={CLIMB.front} depth={4} color="#9b8cff" />
      {HOLDS.map((h) => (
        <mesh
          key={h.y}
          geometry={holdGeometry}
          material={paint(h.color)}
          position={[h.x, h.y - 0.05, CLIMB.front + 0.02]}
          scale={[HOLD_HALF + 0.05, 0.1, 0.16]}
          castShadow
        />
      ))}
    </group>
  )
}
