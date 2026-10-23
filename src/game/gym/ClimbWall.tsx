import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGrabEdges, type GrabEdge } from '../grab'
import { TapedRod } from '../GripTape'
import { playerPosition } from '../race/race'
import { COLORS, HALF, HOLD_COLUMNS, HOLD_HALF, HOLD_ROWS, HOLE_SIZE, HOLES, WALL } from './course'

// 3. Climbing Wall: a rainbow wall across the whole course, with climbing holds all over its face (hop hold
// to hold with Space, steer with A/D) up to the taped top edge, and four square holes at different heights.
// Each hole's bottom edge is a ledge: catch it, pull up and walk through to the far side.

type P3 = [number, number, number]

const RAINBOW = ['#ff5a5f', '#ffa94d', '#ffd23f', '#b7e04a', '#4dd4ac', '#3fa9f5', '#7b61ff', '#c77dff', '#ff9ec4', '#ff5a5f']
const HOLE_HALF = HOLE_SIZE / 2

// The wall in horizontal bands a hold row high, each split into pieces around any hole crossing it
function wallPieces() {
  const pieces: { x0: number; x1: number; y0: number; y1: number; color: string }[] = []
  const bands = Math.round(WALL.height / WALL.band)
  for (let i = 0; i < bands; i++) {
    const y0 = i * WALL.band
    const y1 = y0 + WALL.band
    const cuts = HOLES.filter((h) => h.y < y1 - 1e-3 && h.y + HOLE_SIZE > y0 + 1e-3)
      .map((h) => [h.x - HOLE_HALF, h.x + HOLE_HALF])
      .sort((a, b) => a[0] - b[0])
    let x = -HALF
    for (const [c0, c1] of cuts) {
      if (c0 > x) pieces.push({ x0: x, x1: c0, y0, y1, color: RAINBOW[i % RAINBOW.length] })
      x = Math.max(x, c1)
    }
    if (x < HALF) pieces.push({ x0: x, x1: HALF, y0, y1, color: RAINBOW[i % RAINBOW.length] })
  }
  return pieces
}
const PIECES = wallPieces()

// Holds: columns up the face, a hop apart, with a little seeded wobble (small enough that hopping straight up
// still catches the next one), leaving the holes (and just round them) clear
function holdSpots() {
  let seed = 5
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const spots: { x: number; y: number; color: string }[] = []
  HOLD_ROWS.forEach((y) => {
    HOLD_COLUMNS.forEach((x0) => {
      const x = x0 + (rand() - 0.5) * 0.24
      const inHole = HOLES.some((h) => Math.abs(x - h.x) < HOLE_HALF + 0.35 && y > h.y - 0.1 && y < h.y + HOLE_SIZE + 0.3)
      if (inHole || Math.abs(x) > HALF - 0.4) return
      spots.push({ x, y, color: COLORS.candy[Math.floor(rand() * COLORS.candy.length)] })
    })
  })
  return spots
}
const HOLDS = holdSpots()

const lip = (x0: number, x1: number, y: number) => ({ a: [x0, y, WALL.front] as P3, b: [x1, y, WALL.front] as P3 })
const TOP_LIP = lip(-HALF, HALF, WALL.height)
const HOLE_LIPS = HOLES.map((h) => lip(h.x - HOLE_HALF, h.x + HOLE_HALF, h.y))

const EDGES: GrabEdge[] = [
  ...HOLDS.map(
    (h): GrabEdge => ({
      kind: 'hold',
      a: { x: h.x - HOLD_HALF, y: h.y, z: WALL.front + 0.1 },
      b: { x: h.x + HOLD_HALF, y: h.y, z: WALL.front + 0.1 },
      out: { x: 0, z: 1 },
    }),
  ),
  ...[TOP_LIP, ...HOLE_LIPS].map(
    (l): GrabEdge => ({
      kind: 'ledge',
      a: { x: l.a[0], y: l.a[1], z: l.a[2] },
      b: { x: l.b[0], y: l.b[1], z: l.b[2] },
      out: { x: 0, z: 1 },
    }),
  ),
]

// The wall's own materials (not shared with the rest of the course), so it can fade out on its own: once
// you're over or through it, the camera trails you from the other side, and the wall would be in the way
const FADED = 0.12
const looks = new Map<string, THREE.MeshStandardMaterial>()
function wallLook(color: string) {
  let m = looks.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
    looks.set(color, m)
  }
  return m
}
const holdGeometry = new THREE.SphereGeometry(1, 14, 10)
const holdMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 })

function useFadeWhenBlocking() {
  useFrame(({ camera }, delta) => {
    const blocking = camera.position.z > WALL.back - 0.5 && playerPosition.z < WALL.back - 0.5
    const target = blocking ? FADED : 1
    for (const m of [...looks.values(), holdMaterial]) {
      m.opacity = THREE.MathUtils.lerp(m.opacity, target, 1 - Math.exp(-10 * delta))
      const transparent = m.opacity < 0.99
      if (m.transparent !== transparent) {
        m.transparent = transparent
        m.depthWrite = !transparent
        m.needsUpdate = true
      }
    }
  })
}

function WallPiece({ x0, x1, y0, y1, color }: { x0: number; x1: number; y0: number; y1: number; color: string }) {
  const size: [number, number, number] = [x1 - x0, y1 - y0, WALL.front - WALL.back]
  return (
    <RigidBody type="fixed" colliders={false} position={[(x0 + x1) / 2, (y0 + y1) / 2, (WALL.front + WALL.back) / 2]} friction={1}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      <mesh material={wallLook(color)} castShadow receiveShadow>
        <boxGeometry args={size} />
      </mesh>
    </RigidBody>
  )
}

function Holds() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current!
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    HOLDS.forEach((h, i) => {
      dummy.position.set(h.x, h.y - 0.05, WALL.front + 0.02)
      dummy.scale.set(HOLD_HALF + 0.06, 0.11, 0.17)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, color.set(h.color))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])
  return <instancedMesh ref={mesh} args={[holdGeometry, holdMaterial, HOLDS.length]} castShadow />
}

// A yellow frame round a hole's opening, on both faces of the wall
function HoleFrame({ x, y }: { x: number; y: number }) {
  const t = 0.18
  const frame = wallLook(COLORS.trim)
  return (
    <>
      {[WALL.front + 0.04, WALL.back - 0.04].map((z) => (
        <group key={z} position={[x, y + HOLE_HALF, z]}>
          {[-1, 1].map((s) => (
            <mesh key={`v${s}`} material={frame} position={[s * (HOLE_HALF + t / 2), 0, 0]}>
              <boxGeometry args={[t, HOLE_SIZE + t * 2, 0.1]} />
            </mesh>
          ))}
          <mesh material={frame} position={[0, HOLE_HALF + t / 2, 0]}>
            <boxGeometry args={[HOLE_SIZE, t, 0.1]} />
          </mesh>
        </group>
      ))}
    </>
  )
}

export function ClimbWall() {
  useGrabEdges(EDGES)
  useFadeWhenBlocking()
  return (
    <group>
      {PIECES.map((p, i) => (
        <WallPiece key={i} {...p} />
      ))}
      <Holds />
      {HOLES.map((h, i) => (
        <HoleFrame key={i} x={h.x} y={h.y} />
      ))}
      <TapedRod a={TOP_LIP.a} b={TOP_LIP.b} />
      {HOLE_LIPS.map((l, i) => (
        <TapedRod key={i} a={l.a} b={l.b} />
      ))}
    </group>
  )
}
