import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, CylinderCollider, RigidBody, TrimeshCollider, useBeforePhysicsStep } from '@react-three/rapier'
import * as THREE from 'three'
import { allRunners, loudness } from '../playerContact'
import { STEP, playerPosition, raceClock } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import {
  FLOOR_Y,
  HELIX,
  LIFT,
  LIFTS,
  PENDULUMS,
  T,
  TOWER,
  WALL_MID,
  WARN,
  around,
  helixAngle,
  helixY,
} from './course'
import { Crumble } from './Crumble'
import { addDust } from './dust'
import { Pendulum } from './Pendulum'
import { box, sectorPiece, spiralPiece } from './shapes'
import { stoneBlock, stoneDark, stoneFloorWorld, stoneWall } from './stone'
import { doomed } from './survival'

// 2. Inner tower: a spiral ramp three times round the inside of the tower, from the gate up to the exit door
// onto the ring outside, with pendulums swinging across it and two lifts up the middle for anyone who falls.
// The walls are broken open in places (sunlight streams in) and bits keep breaking off them. From 45 s the
// ramp crumbles from the bottom up, a segment at a time; then the floor goes, then the lifts.

type Point = [number, number, number]

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
const rand = seeded(11)

// ---------------------------------------------------------------------------------------------------------
// Walls: panels one sector wide and one row (4 m) high, with doors in and out, openings, and pieces that
// break off during the race

const SECTOR = (Math.PI * 2) / TOWER.sectors
const PANEL = sectorPiece(TOWER.inner, TOWER.outer, -SECTOR / 2 + 0.002, SECTOR / 2 - 0.002, 0, TOWER.row - 0.02)
const DOOR_SECTORS = [TOWER.sectors - 1, 0]
const DOOR_ROWS = [1, TOWER.rows - 1] // in at the floor, out at the top of the ramp

type Panel = { row: number; sector: number; phi: number; fallAt: number; drift?: Point }
const OPENINGS: { row: number; sector: number; phi: number }[] = []
const PANELS: Panel[] = []
for (let row = 0; row < TOWER.rows; row++) {
  // Rows 2 to 8 have two openings each and two panels that break away, in different sectors
  const picks: number[] = []
  if (row >= 2 && row <= TOWER.rows - 2) {
    while (picks.length < 4) {
      const k = Math.floor(rand() * TOWER.sectors)
      if (!picks.includes(k)) picks.push(k)
    }
  }
  for (let sector = 0; sector < TOWER.sectors; sector++) {
    const phi = (sector + 0.5) * SECTOR
    if (DOOR_ROWS.includes(row) && DOOR_SECTORS.includes(sector)) continue
    const pick = picks.indexOf(sector)
    if (pick === 0 || pick === 1) {
      OPENINGS.push({ row, sector, phi })
      continue
    }
    const out = [Math.sin(phi) * 2.5, 0, Math.cos(phi) * 2.5] as Point
    PANELS.push(
      pick >= 2
        ? { row, sector, phi, fallAt: T.cracks - 8 + rand() * 90, drift: out }
        : { row, sector, phi, fallAt: Infinity },
    )
  }
}

function Walls() {
  return (
    <>
      {PANELS.map((p) => (
        <Crumble
          key={`${p.row}-${p.sector}`}
          fallAt={p.fallAt}
          position={around(p.phi, WALL_MID, (p.row + 1) * TOWER.row)}
          rotation={[0, p.phi, 0]}
          geometry={PANEL.geometry}
          material={stoneWall}
          drift={p.drift}
          colliders={<ConvexHullCollider args={[PANEL.hull]} />}
        />
      ))}
    </>
  )
}

// Sunlight streaming in through the openings: soft beams slanting down into the shaft
function shaftAlpha() {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 64
  const g = canvas.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 64)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(1, '#000000')
  g.fillStyle = grad
  g.fillRect(0, 0, 1, 64)
  return new THREE.CanvasTexture(canvas)
}
const SHAFT_LENGTH = 11
const shaftGeometry = new THREE.CylinderGeometry(0.9, 1.7, SHAFT_LENGTH, 14, 1, true).translate(0, -SHAFT_LENGTH / 2, 0)
const shaftLook = new THREE.MeshBasicMaterial({
  color: '#fff1bf',
  alphaMap: shaftAlpha(),
  transparent: true,
  opacity: 0.13,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
})
const DOWN = new THREE.Vector3(0, -1, 0)
const SHAFTS = OPENINGS.map(({ row, phi }) => ({
  position: around(phi, WALL_MID, row * TOWER.row + TOWER.row * 0.6),
  quaternion: new THREE.Quaternion().setFromUnitVectors(DOWN, new THREE.Vector3(-Math.sin(phi), -0.6, -Math.cos(phi)).normalize()),
}))

function LightShafts() {
  return (
    <>
      {SHAFTS.map((s, i) => (
        <mesh key={i} geometry={shaftGeometry} material={shaftLook} position={s.position} quaternion={s.quaternion} renderOrder={2} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Floor, roof, and the stem the crown stands on

const FLOOR_PIECES = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2
  return { ...sectorPiece(0.02, TOWER.inner + 0.02, a, a + Math.PI / 3, FLOOR_Y, 1), fallAt: T.floor + i * 0.5 }
})
const ROOF_Y = TOWER.top
const roofGeometry = new THREE.CylinderGeometry(TOWER.outer, TOWER.outer, 1, 40)
const STEM_RADIUS = 2.4
const runeLook = new THREE.MeshStandardMaterial({ color: '#7a4dff', emissive: '#8f6bff', emissiveIntensity: 1.4 })

function FloorAndRoof() {
  const stemHeight = TOWER.coreTop - ROOF_Y - 1
  return (
    <>
      {FLOOR_PIECES.map((p, i) => (
        <Crumble
          key={i}
          fallAt={p.fallAt}
          position={p.position}
          geometry={p.geometry}
          material={stoneFloorWorld}
          colliders={<ConvexHullCollider args={[p.hull]} />}
        />
      ))}
      <Crumble
        fallAt={Infinity}
        position={[0, ROOF_Y + 0.5, 0]}
        geometry={roofGeometry}
        material={stoneDark}
        colliders={<CylinderCollider args={[0.5, TOWER.outer]} />}
      />
      <RigidBody type="fixed" colliders={false} position={[0, ROOF_Y + 1 + stemHeight / 2, 0]}>
        <CylinderCollider args={[stemHeight / 2, STEM_RADIUS]} />
        <mesh material={stoneBlock} castShadow receiveShadow>
          <cylinderGeometry args={[STEM_RADIUS, STEM_RADIUS + 0.3, stemHeight, 28]} />
        </mesh>
        {[-3, 0, 3].map((y) => (
          <mesh key={y} material={runeLook} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[STEM_RADIUS + 0.12, 0.08, 8, 40]} />
          </mesh>
        ))}
      </RigidBody>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The spiral ramp: every segment the same shape, turned and raised a step from the last

const SEG_TURN = helixAngle(1) / HELIX.segments
const SEG_RISE = (HELIX.y1 - HELIX.y0) / HELIX.segments
const SEGMENT = spiralPiece(
  HELIX.r - HELIX.width / 2,
  HELIX.r + HELIX.width / 2,
  -SEG_TURN / 2,
  SEG_TURN / 2,
  -SEG_RISE / 2,
  SEG_RISE / 2,
  HELIX.thickness,
)
const SEGMENTS = Array.from({ length: HELIX.segments }, (_, i) => {
  const s = (i + 0.5) / HELIX.segments
  const phi = helixAngle(s)
  return {
    phi,
    position: around(phi, HELIX.r, helixY(s)),
    fallAt: doomed(T.helix + i * T.helixStep, (HELIX.segments - i) * 0.08),
  }
})
// When the ramp's segment at a point along it falls (ignoring the late collapse)
const segmentFalls = (s: number) => T.helix + Math.min(HELIX.segments - 1, Math.floor(s * HELIX.segments)) * T.helixStep
// A level landing at the top, beside the exit door
const TOP_LANDING = sectorPiece(HELIX.r - HELIX.width / 2, TOWER.inner, 0, SEG_TURN, HELIX.y1, HELIX.thickness)

function Ramp() {
  return (
    <>
      {SEGMENTS.map((seg, i) => (
        <Crumble
          key={i}
          fallAt={seg.fallAt}
          position={seg.position}
          rotation={[0, seg.phi, 0]}
          geometry={SEGMENT.geometry}
          material={stoneFloorWorld}
          colliders={<TrimeshCollider args={[SEGMENT.vertices, SEGMENT.indices]} />}
        />
      ))}
      <Crumble
        fallAt={doomed(T.helix + HELIX.segments * T.helixStep)}
        position={TOP_LANDING.position}
        geometry={TOP_LANDING.geometry}
        material={stoneFloorWorld}
        colliders={<ConvexHullCollider args={[TOP_LANDING.hull]} />}
      />
    </>
  )
}

// Pendulums across the ramp, each hung from a beam out of the wall, swinging from side to side
const PENDULUM_RADIUS = 4
const PENDULUM_LENGTH = 4
const PENDULUM_SPECS = PENDULUMS.map((s, i) => {
  const phi = helixAngle(s)
  const pivotY = helixY(s) + PENDULUM_LENGTH + 1.2
  return {
    pivot: around(phi, PENDULUM_RADIUS, pivotY),
    axis: [Math.cos(phi), 0, -Math.sin(phi)] as Point,
    beam: { position: around(phi, 4.05, pivotY + 0.25), phi },
    head: (i % 2 ? 'hammer' : 'ball') as 'hammer' | 'ball',
    period: 3 + (i % 3) * 0.35,
    phase: i * 1.3,
    fallAt: segmentFalls(s) + 0.4,
  }
})
const beamGeometry = box(0.35, 0.35, 4.5)

function Pendulums() {
  return (
    <>
      {PENDULUM_SPECS.map((p, i) => (
        <group key={i}>
          <Crumble
            fallAt={p.fallAt}
            position={p.beam.position}
            rotation={[0, p.beam.phi, 0]}
            geometry={beamGeometry}
            material={stoneDark}
            colliders={<CuboidCollider args={[0.175, 0.175, 2.25]} />}
          />
          <Pendulum
            pivot={p.pivot}
            axis={p.axis}
            length={PENDULUM_LENGTH}
            swing={0.38}
            period={p.period}
            phase={p.phase}
            head={p.head}
            fallAt={p.fallAt}
          />
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Lifts: glowing stone discs riding up and down the middle of the shaft, waiting a moment at each end

const smooth = (x: number) => x * x * (3 - 2 * x)
function liftHeight(t: number, phase: number) {
  const u = (((t / LIFT.period + phase / (Math.PI * 2)) % 1) + 1) % 1
  const k = u < 0.15 ? 0 : u < 0.5 ? smooth((u - 0.15) / 0.35) : u < 0.65 ? 1 : 1 - smooth((u - 0.65) / 0.35)
  return LIFT.y0 + (LIFT.y1 - LIFT.y0) * k
}
const LIFT_FALLS = LIFTS.map((_, i) => doomed(T.lifts + i, i))
const liftGeometry = new THREE.CylinderGeometry(LIFT.radius, LIFT.radius * 0.8, 0.5, 32)
const glowLook = new THREE.MeshStandardMaterial({ color: '#8fe3ff', emissive: '#5cd6ff', emissiveIntensity: 1.2 })

function Lifts() {
  // A lift coming down on somebody standing under it shoves them out of the way (rather than pressing them
  // into the floor)
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    LIFTS.forEach((lift, i) => {
      if (t >= LIFT_FALLS[i]() - WARN) return
      const bottom = liftHeight(t, lift.phase) - 0.5
      if (bottom >= liftHeight(t - STEP, lift.phase) - 0.5) return
      for (const runner of allRunners()) {
        const p = runner.position()
        const dx = p.x - lift.x
        const dz = p.z
        const d = Math.hypot(dx, dz)
        if (d < LIFT.radius + 0.5 && p.y < bottom && p.y + 1.3 > bottom) {
          const away = d > 0.05 ? { x: dx / d, z: dz / d } : { x: Math.sign(lift.x), z: 0 }
          runner.knock({ x: away.x * 7, y: 1, z: away.z * 7 })
        }
      }
    })
  })
  return (
    <>
      {LIFTS.map((lift, i) => (
        <Crumble
          key={i}
          fallAt={LIFT_FALLS[i]}
          position={[lift.x, LIFT.y0 - 0.25, 0]}
          geometry={liftGeometry}
          material={stoneBlock}
          move={(t, out) => out.set(0, liftHeight(t, lift.phase) - LIFT.y0, 0)}
          colliders={<CylinderCollider args={[0.25, LIFT.radius]} />}
        >
          <mesh material={glowLook} position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[LIFT.radius * 0.55, LIFT.radius * 0.72, 32]} />
          </mesh>
        </Crumble>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Rubble: chunks breaking off the inside of the wall above you, smashing on the ramp below. A direct hit
// knocks you (or anyone else there) about.

const ROCKS = 10
const RUBBLE_EVERY = 0.8
const rockGeometry = new THREE.DodecahedronGeometry(0.35, 0)
const G = 20
type Rock = { live: boolean; x: number; y: number; z: number; vy: number; spin: number; size: number }

// The height of the ramp's top where it passes angle phi, highest first below `y` (or null)
function rampBelow(phi: number, y: number, t: number) {
  const turn = helixAngle(1) / HELIX.turns
  const base = ((phi % turn) + turn) % turn
  let best: number | null = null
  for (let k = 0; k < HELIX.turns; k++) {
    const s = (base + k * turn) / helixAngle(1)
    const h = helixY(s)
    if (h < y && t < segmentFalls(s) && (best === null || h > best)) best = h
  }
  return best
}

function Rubble() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const fall = useRef({
    rocks: Array.from({ length: ROCKS }, (): Rock => ({ live: false, x: 0, y: 0, z: 0, vy: 0, spin: 0, size: 1 })),
    next: 0,
    dummy: new THREE.Object3D(),
  })
  useFrame((_, delta) => {
    const state = fall.current
    const dt = Math.min(delta, 0.05)
    const t = raceClock()
    const { rocks, dummy } = state
    const inside = Math.hypot(playerPosition.x, playerPosition.z) < TOWER.inner && playerPosition.y > FLOOR_Y - 1 && playerPosition.y < HELIX.y1 + 2
    // Break a chunk off the wall somewhere above the player
    if (inside && t > state.next) {
      state.next = t + RUBBLE_EVERY * (0.6 + Math.random() * 0.8)
      const rock = rocks.find((r) => !r.live)
      if (rock) {
        const phi = Math.atan2(playerPosition.x, playerPosition.z) + (Math.random() - 0.3) * 1.6
        const r = HELIX.r - HELIX.width / 2 + 0.6 + Math.random() * (HELIX.width - 1)
        Object.assign(rock, {
          live: true,
          x: r * Math.sin(phi),
          y: Math.min(TOWER.top - 1, playerPosition.y + 5 + Math.random() * 5),
          z: r * Math.cos(phi),
          vy: 0,
          spin: Math.random() * 6,
          size: 0.7 + Math.random() * 0.8,
        })
        addDust({ x: TOWER.inner * Math.sin(phi), y: rock.y, z: TOWER.inner * Math.cos(phi) }, 2, 0.8, 0.5)
      }
    }
    rocks.forEach((rock, i) => {
      if (rock.live) {
        const before = rock.y
        rock.vy -= G * dt
        rock.y += rock.vy * dt
        const floor = rampBelow(Math.atan2(rock.x, rock.z), before + 0.01, t)
        if (rock.y < -40 || (floor !== null && rock.y - 0.3 * rock.size <= floor)) {
          rock.live = false
          const at = { x: rock.x, y: floor ?? rock.y, z: rock.z }
          addDust(at, 5, 1.2, 0.6)
          for (const runner of allRunners()) {
            const p = runner.position()
            const dx = p.x - at.x
            const dz = p.z - at.z
            const d = Math.hypot(dx, dz)
            const dy = p.y - at.y
            if (d < 1.2 && dy > -0.5 && dy < 2.5) {
              withVolume(loudness(runner), () => {
                sfx.knock()
                runner.knock({ x: (dx / (d || 1)) * 6, y: 4, z: (dz / (d || 1)) * 6 })
              })
            }
          }
          if (Math.hypot(playerPosition.x - at.x, playerPosition.z - at.z) < 12) sfx.crumble()
        }
      }
      dummy.position.set(rock.x, rock.live ? rock.y : -500, rock.z)
      dummy.rotation.set(rock.spin * rock.y, rock.spin, 0)
      dummy.scale.setScalar(rock.size)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    })
    mesh.current!.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[rockGeometry, stoneDark, ROCKS]} castShadow frustumCulled={false} />
}

// A warm light that climbs the shaft with you, so the inside isn't lost in the walls' shadow
function Lantern() {
  const light = useRef<THREE.PointLight>(null)
  useFrame(() => {
    const l = light.current!
    const inside = Math.hypot(playerPosition.x, playerPosition.z) < TOWER.outer + 3 && playerPosition.y < TOWER.top
    l.position.set(0, THREE.MathUtils.clamp(playerPosition.y + 4, FLOOR_Y + 2, TOWER.top - 2), 0)
    l.intensity = THREE.MathUtils.lerp(l.intensity, inside ? 35 : 0, 0.05)
  })
  return <pointLight ref={light} color="#ffd7a1" intensity={0} distance={24} decay={2} />
}

export function InnerTower() {
  return (
    <group>
      <Walls />
      <LightShafts />
      <FloorAndRoof />
      <Ramp />
      <Pendulums />
      <Lifts />
      <Rubble />
      <Lantern />
    </group>
  )
}
