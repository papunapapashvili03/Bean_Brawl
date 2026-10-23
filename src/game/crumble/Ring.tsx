import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, CylinderCollider, TrimeshCollider, type RapierCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit, type Vec3 } from '../playerContact'
import { paint } from '../race/materials'
import { playerPosition, raceClock, surfaces } from '../race/race'
import { sfx } from '../race/sound'
import { CROWN_STAIRS, RING, RING_KINDS, T, TOWER, around, ringY, type RingKind } from './course'
import { Crumble } from './Crumble'
import { box, sectorPiece, spiralPiece } from './shapes'
import { Stairs, type Flight } from './Stairs'
import { stoneBlock, stoneDark, stoneFloorWorld } from './stone'
import { doomed, gustDirection, nextGustIn, windAt } from './survival'

// 3. Exterior ring: a walkway once round the outside of the tower from the exit door, climbing to the crown
// stairs. Stretches of it are narrow wooden bridges, magic slabs that tilt you towards the drop, and spinning
// bars to jump; the wind gusts across it every few seconds, and bits of its outer edge break away. From 100 s
// it crumbles from the start, a segment every two seconds. Then the stairs up to the crown.

type Point = [number, number, number]

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
const rand = seeded(29)

const SEG = (Math.PI * 2) / RING.segments
const RISE = (RING.y1 - RING.y0) / RING.segments
const INNER = TOWER.outer + 0.05
const OUTER = RING.r + RING.width / 2
const LIP = OUTER - 0.9 // the outer edge of a plain stretch is a separate strip that can break away
const piece = (r0: number, r1: number) => ({ r: (r0 + r1) / 2, ...spiralPiece(r0, r1, -SEG / 2, SEG / 2, -RISE / 2, RISE / 2, RING.thickness) })
const SHAPES = {
  walk: piece(INNER, LIP),
  lip: piece(LIP, OUTER),
  full: piece(INNER, OUTER),
  bridge: piece(RING.r - 0.6, RING.r + 0.6),
  tilt: piece(INNER + 0.12, OUTER),
}

const TILT = 0.2 // radians either way
const TILT_PERIOD = 4.5
const SLIDE = 7 // m/s down a slab at full tilt
const SPIN = 1.8
const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)

// Standing on the ring, the wind pushes you (a moving floor, as far as the player is concerned)
const gust = { x: 0, z: 0 }
function windPush() {
  windAt(raceClock(), gust)
  return { x: gust.x, z: gust.z }
}

type Segment = {
  index: number
  kind: RingKind
  phi: number
  y: number // height of the top at the segment's middle
  fallAt: () => number
  lipFallAt: () => number
  tilt: (t: number) => number
  surface: (p: Vec3) => { x: number; z: number }
}
const SEGMENTS: Segment[] = RING_KINDS.map((kind, index) => {
  const phi = (index + 0.5) * SEG
  const outX = Math.sin(phi)
  const outZ = Math.cos(phi)
  const tilt = (t: number) => TILT * Math.sin(((Math.PI * 2) / TILT_PERIOD) * t + index * 1.7)
  const scheduled = T.ring + index * T.ringStep
  // A plain stretch's outer strip sometimes breaks away early
  const early = kind === 'walk' && rand() < 0.6 ? T.cracks + 20 + rand() * 55 : scheduled
  return {
    index,
    kind,
    phi,
    y: ringY((index + 0.5) / RING.segments),
    fallAt: doomed(scheduled, index * 0.25),
    lipFallAt: doomed(early, index * 0.25),
    tilt,
    // A tilted slab slides you towards its low side (outwards when it's tipped out)
    surface:
      kind === 'tilt'
        ? () => {
            const w = windPush()
            const slide = SLIDE * Math.sin(tilt(raceClock()))
            return { x: w.x + outX * slide, z: w.z + outZ * slide }
          }
        : windPush,
  }
})

// A trimesh collider that the player rides like a moving floor (see `surfaces` in ../race/race)
function Floor({ shape, surface }: { shape: { vertices: Float32Array; indices: Uint32Array }; surface: Segment['surface'] }) {
  const collider = useRef<RapierCollider>(null)
  useEffect(() => {
    const handle = collider.current!.handle
    surfaces.set(handle, surface)
    return () => {
      surfaces.delete(handle)
    }
  }, [surface])
  return <TrimeshCollider ref={collider} args={[shape.vertices, shape.indices]} />
}

// Struts from under a stretch of walkway back to the tower wall (in the piece's own frame: z outwards)
const strut = (r: number) => {
  const from = new THREE.Vector3(0, -RING.thickness + 0.1, 0.6)
  const to = new THREE.Vector3(0, -3, TOWER.outer - r)
  const d = to.clone().sub(from)
  const mid = from.clone().add(to).multiplyScalar(0.5)
  // Turning about x by θ takes the box's length (z) to (0, -sin θ, cos θ)
  return { position: mid.toArray() as Point, rotation: [Math.atan2(-d.y, d.z), 0, 0] as Point, length: d.length() }
}
function Strut({ r }: { r: number }) {
  const s = useMemo(() => strut(r), [r])
  return <mesh geometry={box(0.28, 0.28, s.length)} material={stoneDark} position={s.position} rotation={s.rotation} castShadow />
}

const wood = new THREE.MeshStandardMaterial({ color: '#7a5433', roughness: 0.85 })
const tiltLook = stoneFloorWorld.clone()
tiltLook.color.set('#c9d5ff')
const runeLook = new THREE.MeshStandardMaterial({ color: '#7a4dff', emissive: '#8f6bff', emissiveIntensity: 1.3 })
const barLook = paint('#c0392b')
const iron = new THREE.MeshStandardMaterial({ color: '#4a4d57', metalness: 0.6, roughness: 0.4 })

function SegmentPiece({ seg }: { seg: Segment }) {
  const rotation: Point = [0, seg.phi, 0]
  if (seg.kind === 'bridge') {
    const shape = SHAPES.bridge
    return (
      <Crumble
        fallAt={seg.fallAt}
        position={around(seg.phi, shape.r, seg.y)}
        rotation={rotation}
        geometry={shape.geometry}
        material={wood}
        colliders={<Floor shape={shape} surface={seg.surface} />}
      >
        <Strut r={shape.r} />
      </Crumble>
    )
  }
  if (seg.kind === 'tilt') {
    const shape = SHAPES.tilt
    return (
      <Crumble
        fallAt={seg.fallAt}
        position={around(seg.phi, shape.r, seg.y)}
        rotation={rotation}
        geometry={shape.geometry}
        material={tiltLook}
        turn={(t, out) => out.setFromAxisAngle(X, seg.tilt(t))}
        colliders={<Floor shape={shape} surface={seg.surface} />}
      >
        {/* A glowing rune on its underside, where the magic holds it up */}
        <mesh material={runeLook} position={[0, -RING.thickness - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.8, 24]} />
        </mesh>
      </Crumble>
    )
  }
  const main = seg.kind === 'spinner' ? SHAPES.full : SHAPES.walk
  return (
    <>
      <Crumble
        fallAt={seg.fallAt}
        position={around(seg.phi, main.r, seg.y)}
        rotation={rotation}
        geometry={main.geometry}
        material={stoneFloorWorld}
        colliders={<Floor shape={main} surface={seg.surface} />}
      >
        <Strut r={main.r} />
      </Crumble>
      {seg.kind === 'walk' && (
        <Crumble
          fallAt={seg.lipFallAt}
          position={around(seg.phi, SHAPES.lip.r, seg.y)}
          rotation={rotation}
          geometry={SHAPES.lip.geometry}
          material={stoneFloorWorld}
          drift={[Math.sin(seg.phi) * 1.5, 0, Math.cos(seg.phi) * 1.5]}
          colliders={<Floor shape={SHAPES.lip} surface={seg.surface} />}
        />
      )}
      {seg.kind === 'spinner' && <Spinner seg={seg} />}
    </>
  )
}

// A red bar spinning on a post in the middle of the walkway: jump it as it comes round
const SPINNER_HALF = 1.75
const spinnerGeometry = new THREE.BoxGeometry(SPINNER_HALF * 2, 0.45, 0.45)
function Spinner({ seg }: { seg: Segment }) {
  const spin = seg.index % 2 ? -SPIN : SPIN
  const centre = around(seg.phi, RING.r, seg.y + 0.55)
  const knock = knockOnHit((player) => {
    sfx.knock()
    const rx = player.x - centre[0]
    const rz = player.z - centre[2]
    const vx = spin * rz
    const vz = -spin * rx
    const speed = Math.hypot(vx, vz) || 1
    const push = Math.max(7, speed * 1.4)
    return { x: (vx / speed) * push, y: 5, z: (vz / speed) * push }
  })
  return (
    <Crumble
      fallAt={seg.fallAt}
      position={centre}
      geometry={spinnerGeometry}
      material={barLook}
      turn={(t, out) => out.setFromAxisAngle(Y, spin * t)}
      onCollisionEnter={knock}
      colliders={
        <>
          <CuboidCollider args={[SPINNER_HALF, 0.225, 0.225]} />
          <CylinderCollider args={[0.55, 0.3]} />
        </>
      }
    >
      <mesh material={iron} castShadow>
        <cylinderGeometry args={[0.3, 0.36, 1.1, 14]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={box(0.25, 0.55, 0.55)} material={iron} position={[s * (SPINNER_HALF - 0.12), 0, 0]} />
      ))}
    </Crumble>
  )
}

// Level landings at either end: outside the exit door, and at the top where the crown stairs begin
const START_LANDING = sectorPiece(INNER, OUTER, -SEG, 0, RING.y0, RING.thickness)
const END_LANDING = sectorPiece(INNER, OUTER, 0, SEG, RING.y1, RING.thickness)

// The crown stairs: straight out from the ring's end, a landing, then two flights back up to the crown's edge
// (the left one broken)
const UP: Flight = { ...CROWN_STAIRS.up }
const BACK: Flight[] = CROWN_STAIRS.back.map((f, i) => ({ ...f, breaks: i === 0 ? [0.5] : [], gap: 1.1 }))
const { min: LMIN, max: LMAX } = CROWN_STAIRS.landing
const landingGeometry = new THREE.BoxGeometry(LMAX[0] - LMIN[0], LMAX[1] - LMIN[1], LMAX[2] - LMIN[2])
const LANDING_AT: Point = [(LMIN[0] + LMAX[0]) / 2, (LMIN[1] + LMAX[1]) / 2, (LMIN[2] + LMAX[2]) / 2]

function CrownStairs() {
  return (
    <>
      <Crumble
        fallAt={doomed(T.crownStairs - 2)}
        position={END_LANDING.position}
        geometry={END_LANDING.geometry}
        material={stoneFloorWorld}
        colliders={<ConvexHullCollider args={[END_LANDING.hull]} />}
      />
      <Stairs flight={UP} fallAt={(i) => doomed(T.crownStairs + i * 0.6, 1 + i * 0.3)} />
      <Crumble
        fallAt={doomed(T.crownStairs + 1.5, 2)}
        position={LANDING_AT}
        geometry={landingGeometry}
        material={stoneBlock}
        colliders={<CuboidCollider args={[(LMAX[0] - LMIN[0]) / 2, (LMAX[1] - LMIN[1]) / 2, (LMAX[2] - LMIN[2]) / 2]} />}
      />
      {BACK.map((f, i) => (
        <Stairs key={i} flight={f} fallAt={(k) => doomed(T.crownStairs + 3 + k * 0.6 + i, 3 + k * 0.3 + i * 0.5)} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Wind: streaks blowing past while a gust is on (and a moment before it, as a warning), and a whoosh

const STREAKS = 70
const STREAK_BOX = 26
const streakGeometry = new THREE.BoxGeometry(0.035, 0.035, 2.2)
const streakLook = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })
const STREAK_AT = Array.from({ length: STREAKS }, () => new THREE.Vector3(rand(), rand(), rand()))

function WindStreaks() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const blow = useRef({ drift: 0, heard: -1, dummy: new THREE.Object3D() })
  useFrame((_, delta) => {
    const state = blow.current
    const t = raceClock()
    const high = playerPosition.y > RING.y0 - 8
    const strength = windAt(t, gust)
    const warning = nextGustIn(t) < 0.6 ? 0.35 : 0
    const show = high ? Math.max(strength, warning) : 0
    streakLook.opacity = THREE.MathUtils.lerp(streakLook.opacity, show * 0.55, 1 - Math.exp(-8 * delta))
    // One whoosh per gust (each has its own direction)
    const a = gustDirection(t)
    if (high && strength > 0 && state.heard !== a) {
      state.heard = a
      sfx.gust()
    }
    if (streakLook.opacity < 0.01) {
      mesh.current!.visible = false
      return
    }
    mesh.current!.visible = true
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
    state.drift += delta * 18
    const { dummy } = state
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
    const side = new THREE.Vector3(dir.z, 0, -dir.x)
    STREAK_AT.forEach((o, i) => {
      const along = (((o.x * STREAK_BOX + state.drift) % STREAK_BOX) + STREAK_BOX) % STREAK_BOX - STREAK_BOX / 2
      dummy.position
        .set(playerPosition.x, playerPosition.y + (o.y - 0.3) * 8, playerPosition.z)
        .addScaledVector(dir, along)
        .addScaledVector(side, (o.z - 0.5) * STREAK_BOX)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    })
    mesh.current!.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[streakGeometry, streakLook, STREAKS]} frustumCulled={false} />
}

export function Ring() {
  return (
    <group>
      <Crumble
        fallAt={doomed(T.ring - 1)}
        position={START_LANDING.position}
        geometry={START_LANDING.geometry}
        material={stoneFloorWorld}
        colliders={<ConvexHullCollider args={[START_LANDING.hull]} />}
      />
      {SEGMENTS.map((seg) => (
        <SegmentPiece key={seg.index} seg={seg} />
      ))}
      <CrownStairs />
      <WindStreaks />
    </group>
  )
}
