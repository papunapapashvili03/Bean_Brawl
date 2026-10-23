import { Fragment, type ReactNode } from 'react'
import { ConvexHullCollider, CuboidCollider, CylinderCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { paint } from '../race/materials'
import { sfx } from '../race/sound'
import {
  COURTYARD,
  FLOOR_Y,
  MISSING_TILES,
  PILLARS,
  PILLAR_RADIUS,
  PLAYER_SLOT,
  SPAWNS,
  STAIRS,
  STAIRS_X,
  SWEEPERS,
  T,
  TERRACE,
  around,
} from './course'
import { Crumble } from './Crumble'
import { Pendulum } from './Pendulum'
import { box, sectorPiece } from './shapes'
import { Stairs, type Flight } from './Stairs'
import { stoneBlock, stoneDark, stoneFloorWorld } from './stone'

// 1. Courtyard: a ring of stone tiles round the tower's base, already missing a few, with fallen statues and
// ruined walls. Two broken staircases and a row of broken pillars climb to the gate terrace; wooden sweepers
// turn on posts either side of the tower, and a stone hammer swings across the right-hand stairs. Twenty
// seconds in, cracks spread round from the spawn side, and the tiles follow them down into the clouds.

type Point = [number, number, number]
type Deco = { key: string; node: ReactNode; collider?: ReactNode }

const SECTOR = (Math.PI * 2) / COURTYARD.sectors
const Y = new THREE.Vector3(0, 1, 0)

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
const rand = seeded(5)

const wrap = (phi: number) => Math.atan2(Math.sin(phi), Math.cos(phi))
// How far round from the spawn side (φ = π): 0 there, 1 at the gate (φ = 0)
const fromSpawn = (phi: number) => 1 - Math.abs(wrap(phi)) / Math.PI

// One shape per ring of tiles (all the tiles in a ring are the same, turned round the tower)
const RING_SHAPES = [0, 1, 2].map((ring) =>
  sectorPiece(
    COURTYARD.radii[ring] + 0.04,
    COURTYARD.radii[ring + 1] - 0.04,
    -SECTOR / 2 + 0.004,
    SECTOR / 2 - 0.004,
    0,
    COURTYARD.thickness,
  ),
)

// A copy of a tile's top with its texture shifted, so the cracks differ from tile to tile
function crackFace(face: THREE.BufferGeometry) {
  const g = face.clone()
  const uv = g.getAttribute('uv')
  const du = rand() * 5
  const dv = rand() * 5
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv)
  return g
}

type Tile = {
  ring: number
  sector: number
  phi: number
  position: Point
  rotation: Point
  fallAt: number
  crack: { geometry: THREE.BufferGeometry; at: number }
  deco: Deco[]
}

const TILES: Tile[] = []
for (let ring = 0; ring < 3; ring++) {
  for (let sector = 0; sector < COURTYARD.sectors; sector++) {
    const phi = (sector + 0.5) * SECTOR
    // The gate terrace stands in for the inner ring in front of the door
    if (ring === 0 && Math.abs(wrap(phi)) < TERRACE.half) continue
    if (MISSING_TILES.some(([r, k]) => r === ring && k === sector)) continue
    const d = fromSpawn(phi)
    const rC = (COURTYARD.radii[ring] + COURTYARD.radii[ring + 1]) / 2
    TILES.push({
      ring,
      sector,
      phi,
      position: around(phi, rC, 0),
      rotation: [0, phi, 0],
      // Spawn side first, round to the gate; the outer ring a moment before the inner ones
      fallAt: T.courtyardFall + d * T.courtyardSpan + (2 - ring) * 0.7 + rand() * 0.8,
      crack: { geometry: crackFace(RING_SHAPES[ring].topFace), at: T.cracks + d * T.crackSpread + rand() * 1.5 },
      deco: [],
    })
  }
}

// The tile under a point, and where the point is in that tile's own frame (x round the tower, z outwards)
function tileAt([x, , z]: Point) {
  const r = Math.hypot(x, z)
  const ring = COURTYARD.radii.findIndex((edge, i) => i > 0 && r < edge) - 1
  const sector = Math.floor(((Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2)) / SECTOR)
  return TILES.find((t) => t.ring === ring && t.sector === sector)
}
function toLocal([x, y, z]: Point, tile: Tile): Point {
  const dx = x - tile.position[0]
  const dz = z - tile.position[2]
  const c = Math.cos(tile.phi)
  const s = Math.sin(tile.phi)
  return [dx * c - dz * s, y, dx * s + dz * c]
}
function decorate(at: Point, make: (local: Point, key: string) => Omit<Deco, 'key'>) {
  const tile = tileAt(at)
  if (!tile) return
  const local = toLocal(at, tile)
  const key = `${tile.deco.length}`
  tile.deco.push({ key, ...make(local, key) })
}

// ---------------------------------------------------------------------------------------------------------
// Things on the tiles: the start pads, statues (standing, and fallen across the way), ruined walls, rubble

const marble = paint('#d9d2c4')
const padLook = paint('#e8dcc0')
const yourPad = paint('#ffd23f')

SPAWNS.forEach((at, i) =>
  decorate(at, (local) => ({
    node: (
      <mesh position={[local[0], 0.03, local[2]]} material={i === PLAYER_SLOT ? yourPad : padLook} receiveShadow>
        <cylinderGeometry args={[0.6, 0.6, 0.05, 20]} />
      </mesh>
    ),
  })),
)

function StandingStatue() {
  return (
    <group>
      <mesh geometry={box(1.5, 0.8, 1.5)} material={stoneDark} position={[0, 0.4, 0]} castShadow receiveShadow />
      <mesh material={marble} position={[0, 1.65, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.55, 1.7, 14]} />
      </mesh>
      <mesh material={marble} geometry={box(1.05, 0.34, 0.5)} position={[0, 2.5, 0]} castShadow />
      <mesh material={marble} position={[0, 2.95, 0]} castShadow>
        <sphereGeometry args={[0.3, 14, 10]} />
      </mesh>
      {/* One arm raised, holding a sword up */}
      <mesh material={marble} geometry={box(0.2, 0.9, 0.2)} position={[0.52, 2.9, 0]} rotation={[0, 0, -0.25]} castShadow />
      <mesh material={marble} geometry={box(0.08, 1.4, 0.2)} position={[0.66, 3.95, 0]} rotation={[0, 0, -0.25]} castShadow />
    </group>
  )
}

// Toppled off its plinth and lying across the way (along the tile's z), its head rolled off to one side
function FallenStatue() {
  return (
    <group>
      <mesh geometry={box(1.5, 0.6, 1.5)} material={stoneDark} position={[0.4, 0.3, -2.2]} rotation={[0, 0.3, 0]} castShadow receiveShadow />
      <group position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0.15]}>
        <mesh material={marble} castShadow>
          <cylinderGeometry args={[0.3, 0.5, 1.7, 14]} />
        </mesh>
        <mesh material={marble} geometry={box(1.0, 0.34, 0.5)} position={[0, 0.95, 0]} castShadow />
      </group>
      <mesh material={marble} position={[0.9, 0.3, 1.9]} castShadow>
        <sphereGeometry args={[0.3, 14, 10]} />
      </mesh>
      <mesh material={marble} geometry={box(0.08, 1.4, 0.2)} position={[-0.9, 0.1, 0.4]} rotation={[Math.PI / 2, 0, 0.8]} castShadow />
    </group>
  )
}

const STATUES: { phi: number; r: number; fallen: boolean }[] = [
  { phi: 0.6, r: 18.3, fallen: false },
  { phi: -0.6, r: 18.3, fallen: false },
  { phi: 2.45, r: 18.5, fallen: false },
  { phi: 1.9, r: 17.5, fallen: true },
  { phi: 4.3, r: 12.8, fallen: true },
  { phi: 3.75, r: 9.2, fallen: true },
  { phi: 5.3, r: 18.4, fallen: false },
]
STATUES.forEach(({ phi, r, fallen }) =>
  decorate(around(phi, r, 0), (local, key) => ({
    node: (
      <group position={local} rotation={[0, fallen ? 0 : Math.PI, 0]}>
        {fallen ? <FallenStatue /> : <StandingStatue />}
      </group>
    ),
    collider: fallen ? (
      <Fragment key={key}>
        <CuboidCollider args={[0.45, 0.45, 1.1]} position={[local[0], 0.45, local[2]]} />
        <CuboidCollider args={[0.75, 0.3, 0.75]} position={[local[0] + 0.4, 0.3, local[2] - 2.2]} rotation={[0, 0.3, 0]} />
      </Fragment>
    ) : (
      <Fragment key={key}>
        <CuboidCollider args={[0.75, 0.4, 0.75]} position={[local[0], 0.4, local[2]]} />
        <CylinderCollider args={[1.2, 0.5]} position={[local[0], 2, local[2]]} />
      </Fragment>
    ),
  })),
)

// Broken stubs of an old wall round the rim
const RUINS = [2, 5, 10, 13].flatMap((sector) => [-0.25, 0.22].map((f) => ({ phi: (sector + 0.5 + f) * SECTOR, h: 0.5 + rand() * 1.1 })))
RUINS.forEach(({ phi, h }) =>
  decorate(around(phi, 19.3, 0), (local, key) => ({
    node: <mesh geometry={box(2.4, h, 0.6)} material={stoneBlock} position={[local[0], h / 2, local[2]]} castShadow receiveShadow />,
    collider: <CuboidCollider key={key} args={[1.2, h / 2, 0.3]} position={[local[0], h / 2, local[2]]} />,
  })),
)

// Loose rubble: just for looks (nothing to trip over)
const rubbleGeometry = new THREE.DodecahedronGeometry(0.7, 0)
for (const tile of TILES) {
  if (rand() < 0.45) continue
  const n = 1 + Math.floor(rand() * 3)
  for (let i = 0; i < n; i++) {
    const size = 0.25 + rand() * 0.4
    const x = (rand() - 0.5) * 2.5
    const z = (rand() - 0.5) * 2.5
    tile.deco.push({
      key: `rubble${i}`,
      node: (
        <mesh
          geometry={rubbleGeometry}
          material={stoneBlock}
          position={[x, size * 0.3, z]}
          scale={[size, size * 0.6, size * 1.2]}
          rotation={[rand() * 0.5, rand() * Math.PI, rand() * 0.5]}
          castShadow
        />
      ),
    })
  }
}

function Tiles() {
  return (
    <>
      {TILES.map((t) => {
        const shape = RING_SHAPES[t.ring]
        return (
          <Crumble
            key={`${t.ring}-${t.sector}`}
            fallAt={t.fallAt}
            position={t.position}
            rotation={t.rotation}
            geometry={shape.geometry}
            material={stoneFloorWorld}
            crack={t.crack}
            colliders={
              <>
                <ConvexHullCollider args={[shape.hull]} />
                {t.deco.map((d) => d.collider)}
              </>
            }
          >
            {t.deco.map((d) => (
              <group key={d.key}>{d.node}</group>
            ))}
          </Crumble>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The way up to the gate: the terrace in front of the door, two broken staircases, and pillars up the middle

const TERRACE_STEP = (TERRACE.half * 2) / TERRACE.pieces
const TERRACE_SHAPE = sectorPiece(TERRACE.r0, TERRACE.r1, -TERRACE_STEP / 2 + 0.004, TERRACE_STEP / 2 - 0.004, 0, FLOOR_Y + COURTYARD.thickness)
const TERRACE_PIECES = Array.from({ length: TERRACE.pieces }, (_, i) => {
  const phi = -TERRACE.half + (i + 0.5) * TERRACE_STEP
  const outer = i === 0 || i === TERRACE.pieces - 1
  return {
    phi,
    position: around(phi, (TERRACE.r0 + TERRACE.r1) / 2, FLOOR_Y),
    fallAt: T.terrace + (outer ? 0 : 1.5) + rand() * 0.5,
  }
})

function Terrace() {
  return (
    <>
      {TERRACE_PIECES.map((p, i) => (
        <Crumble
          key={i}
          fallAt={p.fallAt}
          position={p.position}
          rotation={[0, p.phi, 0]}
          geometry={TERRACE_SHAPE.geometry}
          material={stoneFloorWorld}
          colliders={<ConvexHullCollider args={[TERRACE_SHAPE.hull]} />}
        />
      ))}
    </>
  )
}

const FLIGHTS: Flight[] = [-1, 1].map((side) => ({
  from: [side * STAIRS_X, 0, STAIRS.bottomZ],
  to: [side * STAIRS_X, FLOOR_Y, STAIRS.topZ],
  width: STAIRS.width,
  breaks: STAIRS.gaps,
  gap: STAIRS.gap,
}))

const pillarGeometry = (height: number) => new THREE.CylinderGeometry(PILLAR_RADIUS, PILLAR_RADIUS + 0.1, height, 20)
const PILLAR_PIECES = PILLARS.map((p, i) => {
  const height = p.top + COURTYARD.thickness
  return { ...p, height, geometry: pillarGeometry(height), fallAt: T.terrace - 1 + i * 0.5 }
})

function Pillars() {
  return (
    <>
      {PILLAR_PIECES.map((p) => (
        <Crumble
          key={p.z}
          fallAt={p.fallAt}
          position={[0, p.top - p.height / 2, p.z]}
          geometry={p.geometry}
          material={stoneBlock}
          colliders={<CylinderCollider args={[p.height / 2, PILLAR_RADIUS]} />}
        />
      ))}
    </>
  )
}

// A stone hammer swinging across the right-hand stairs (+x) from a wooden gantry
const HAMMER = { x: STAIRS_X, z: 13.8, length: 4.2 }
const stairTop = (z: number) => 0.125 + ((STAIRS.bottomZ - z) * FLOOR_Y) / (STAIRS.bottomZ - STAIRS.topZ)
const HAMMER_PIVOT: Point = [HAMMER.x, stairTop(HAMMER.z) + 0.75 + HAMMER.length, HAMMER.z]
const HAMMER_AXIS: Point = [0, 0, 1]
const GANTRY_SPAN = 3.9
const wood = new THREE.MeshStandardMaterial({ color: '#6e4b2e', roughness: 0.85 })
const GANTRY_HEIGHT = HAMMER_PIVOT[1] + 0.4
// Two posts either side of the stairs, and the beam across them the hammer hangs from
const GANTRY: { position: Point; geometry: THREE.BufferGeometry; post: boolean }[] = [
  ...[-1, 1].map((s) => ({
    position: [HAMMER.x + s * GANTRY_SPAN, GANTRY_HEIGHT / 2, HAMMER.z] as Point,
    geometry: new THREE.BoxGeometry(0.35, GANTRY_HEIGHT, 0.35),
    post: true,
  })),
  {
    position: [HAMMER.x, GANTRY_HEIGHT - 0.2, HAMMER.z],
    geometry: new THREE.BoxGeometry(GANTRY_SPAN * 2 + 0.6, 0.4, 0.45),
    post: false,
  },
]

function Hammer() {
  return (
    <>
      {GANTRY.map((part, i) => (
        <Crumble
          key={i}
          fallAt={T.terrace - 2 + i * 0.3}
          position={part.position}
          geometry={part.geometry}
          material={wood}
          colliders={part.post ? <CuboidCollider args={[0.18, GANTRY_HEIGHT / 2, 0.18]} /> : null}
        />
      ))}
      <Pendulum
        pivot={HAMMER_PIVOT}
        axis={HAMMER_AXIS}
        length={HAMMER.length}
        swing={0.9}
        period={2.8}
        phase={0}
        head="hammer"
        fallAt={T.terrace - 2}
      />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Sweepers: a wooden bar turning low on a post either side of the tower. Jump it, or get swept away.

type Sweeper = (typeof SWEEPERS)[number]
const BAR_Y = 0.55
const barGeometry = (length: number) => new THREE.BoxGeometry(length * 2, 0.5, 0.5)
const postGeometry = new THREE.CylinderGeometry(0.45, 0.55, 1.6, 16)
const iron = new THREE.MeshStandardMaterial({ color: '#4a4d57', metalness: 0.6, roughness: 0.4 })

function SweeperPost({ sweeper }: { sweeper: Sweeper }) {
  const fallAt = T.courtyardFall + fromSpawn(Math.atan2(sweeper.x, sweeper.z)) * T.courtyardSpan + 0.7
  const turn = (t: number, out: THREE.Quaternion) => out.setFromAxisAngle(Y, sweeper.spin * t)
  const knock = knockOnHit((player) => {
    sfx.knock()
    const rx = player.x - sweeper.x
    const rz = player.z - sweeper.z
    const vx = sweeper.spin * rz
    const vz = -sweeper.spin * rx
    const speed = Math.hypot(vx, vz) || 1
    const push = Math.max(7, speed * 1.3)
    return { x: (vx / speed) * push, y: 5, z: (vz / speed) * push }
  })
  return (
    <>
      <Crumble
        fallAt={fallAt}
        position={[sweeper.x, 0.8, sweeper.z]}
        geometry={postGeometry}
        material={stoneDark}
        colliders={<CylinderCollider args={[0.8, 0.45]} />}
      />
      <Crumble
        fallAt={fallAt}
        position={[sweeper.x, BAR_Y, sweeper.z]}
        geometry={barGeometry(sweeper.length)}
        material={wood}
        turn={turn}
        onCollisionEnter={knock}
        colliders={<CuboidCollider args={[sweeper.length, 0.25, 0.25]} />}
      >
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={box(0.3, 0.6, 0.6)} material={iron} position={[s * (sweeper.length - 0.15), 0, 0]} />
        ))}
        <mesh geometry={box(0.6, 0.6, 0.6)} material={iron} />
      </Crumble>
    </>
  )
}

export function Courtyard() {
  return (
    <group>
      <Tiles />
      <Terrace />
      {FLIGHTS.map((f, i) => (
        <Stairs key={i} flight={f} fallAt={T.terrace - 3} stagger={0.8} />
      ))}
      <Pillars />
      <Hammer />
      {SWEEPERS.map((s, i) => (
        <SweeperPost key={i} sweeper={s} />
      ))}
    </group>
  )
}
