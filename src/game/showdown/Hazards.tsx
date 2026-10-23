import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGrabEdges, type GrabEdge } from '../grab'
import { TapedRod } from '../GripTape'
import { NEON } from '../neon/course'
import { neon } from '../neon/neonMaterial'
import { HotAirBalloon } from '../neon/obstacles'
import { knockOnHit } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { Beam } from '../race/parts'
import { STEP, raceClock } from '../race/race'
import { sfx } from '../race/sound'
import { bars, boxGeometry, merged } from './bars'
import {
  BALLOON,
  BALLOONS,
  CLOUDS,
  CLOUD_RADIUS,
  CYCLE,
  GRID,
  LADDERS,
  ORB,
  PULSE,
  PULSE_POOL,
  PULSE_TRAVEL,
  ROAD,
  ROAD_PILLARS,
  TEAM,
  cloudX,
  roadAcross,
  roadPoint,
  roadY,
  roadZ,
  tileAt,
  tileOut,
  tilePhase,
  type P3,
} from './layout'

// Neon Showdown's moving pieces (see ./layout), all timed off the match clock: the highway and its data
// pulses, the Blackout Grid's tiles, the ladders' orbs, the balloon baskets and the clouds.

const HIDDEN = { x: 0, y: -500, z: 0 }
const spin = new THREE.Quaternion()
const tumble = new THREE.Euler()

// ---------------------------------------------------------------------------------------------------------
// 1. Neon Highway

// Data pulses: eastbound ones in the west team's colour, westbound in the east's
const pulseLooks = PULSE.lanes.map(({ dir }) => {
  const color = dir > 0 ? TEAM.west : TEAM.east
  return {
    core: neon(color, 3),
    shell: new THREE.MeshStandardMaterial({ color: '#0b2b3a', transparent: true, opacity: 0.55, emissive: color, emissiveIntensity: 0.6 }),
  }
})

function pulseState(t: number, slot: number, lane: number) {
  const n = slot + PULSE_POOL * Math.floor((t - slot * PULSE.wave) / (PULSE_POOL * PULSE.wave))
  const age = t - n * PULSE.wave
  const active = n >= 0 && age <= PULSE_TRAVEL && PULSE.pattern[(n + lane * 3) % PULSE.pattern.length] === 1
  return { active, x: PULSE.lanes[lane].dir * (PULSE.speed * age - PULSE.from), age }
}

function Pulse({ slot, lane }: { slot: number; lane: number }) {
  const body = useRef<RapierRigidBody>(null)
  const { offset, dir } = PULSE.lanes[lane]
  useKinematic(body, (t) => {
    const { active, x, age } = pulseState(t, slot, lane)
    if (!active) return { position: HIDDEN }
    const [ax, az] = roadAcross(x)
    return {
      position: { x: x + ax * offset, y: roadY(x) + 0.75 + 0.12 * Math.sin(age * 8), z: roadZ(x) + az * offset },
      rotation: spin.setFromEuler(tumble.set(age * 2, age * 3, 0)),
    }
  })
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, -500, 0]}
      onCollisionEnter={knockOnHit((p) => {
        sfx.knock()
        // On along the pulse's way, and sideways out of its lane (likely off the road)
        const { x } = pulseState(raceClock(), slot, lane)
        const [ax, az] = roadAcross(x)
        const side = Math.sign((p.x - x - ax * offset) * ax + (p.z - roadZ(x) - az * offset) * az) || Math.sign(offset)
        return { x: ax * side * 8 + dir * 6, y: 6, z: az * side * 8 }
      })}
    >
      <CuboidCollider args={[0.5, 0.5, 0.5]} />
      <mesh material={pulseLooks[lane].shell}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh material={pulseLooks[lane].core}>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
      </mesh>
    </RigidBody>
  )
}

export function Highway() {
  // The road in short straight pieces. Where it's low, each piece reaches down into the ground (no gap to get
  // stuck in); where it's up on the overpass, it's a slab you can walk under.
  const pieces = useMemo(() => {
    const out: { a: P3; b: P3; thickness: number }[] = []
    for (let x = ROAD.x0; x < ROAD.x1 - 1e-6; x += ROAD.step) {
      const a = roadPoint(x)
      const b = roadPoint(Math.min(x + ROAD.step, ROAD.x1))
      const high = Math.max(a[1], b[1])
      out.push({ a, b, thickness: high > 3.5 ? 1 : high + 0.6 })
    }
    return out
  }, [])
  // Glowing edges (yellow on the north, cyan on the south) and a dashed pink line down the middle
  const glow = useMemo(() => {
    const edge = (x: number, side: number): P3 => {
      const [ax, az] = roadAcross(x)
      const d = side * (ROAD.width / 2 - 0.12)
      return [x + ax * d, roadY(x) + 0.07, roadZ(x) + az * d]
    }
    const north: [P3, P3][] = []
    const south: [P3, P3][] = []
    const middle: [P3, P3][] = []
    for (let x = ROAD.x0, i = 0; x < ROAD.x1 - 1e-6; x += ROAD.step, i++) {
      const x1 = Math.min(x + ROAD.step, ROAD.x1)
      north.push([edge(x, -1), edge(x1, -1)])
      south.push([edge(x, 1), edge(x1, 1)])
      if (i % 2 === 0) middle.push([edge(x, 0), edge(x1, 0)])
    }
    return [
      { geometry: bars(north, 0.16, 0.11), color: NEON.yellow },
      { geometry: bars(south, 0.16, 0.11), color: NEON.cyan },
      { geometry: bars(middle, 0.22, 0.15), color: NEON.pink },
    ]
  }, [])
  // Pillars under the overpass, ringed with light
  const pillars = useMemo(() => {
    const posts: THREE.BufferGeometry[] = []
    const rings: THREE.BufferGeometry[] = []
    for (const x of ROAD_PILLARS) {
      const h = roadY(x) - 1
      const z = roadZ(x)
      posts.push(boxGeometry([x - 0.5, 0, z - 0.5], [x + 0.5, h, z + 0.5]))
      for (const y of [0.9, 2.2]) rings.push(boxGeometry([x - 0.54, y, z - 0.54], [x + 0.54, y + 0.08, z + 0.54]))
    }
    return { posts: merged(posts), rings: merged(rings) }
  }, [])
  const pulses = []
  for (let slot = 0; slot < PULSE_POOL; slot++) {
    for (let lane = 0; lane < PULSE.lanes.length; lane++) pulses.push(<Pulse key={`${slot}-${lane}`} slot={slot} lane={lane} />)
  }
  return (
    <group>
      {pieces.map(({ a, b, thickness }, i) => (
        <Beam key={i} from={a} to={b} width={ROAD.width} thickness={thickness} top={NEON.road} side={NEON.roadSide} extend={0.35} />
      ))}
      {glow.map((g) => (
        <mesh key={g.color} geometry={g.geometry} material={neon(g.color)} />
      ))}
      <RigidBody type="fixed" colliders={false}>
        {ROAD_PILLARS.map((x) => (
          <CuboidCollider key={x} args={[0.5, (roadY(x) - 1) / 2, 0.5]} position={[x, (roadY(x) - 1) / 2, roadZ(x)]} />
        ))}
        <mesh geometry={pillars.posts} material={paint(NEON.roadSide)} castShadow receiveShadow />
        <mesh geometry={pillars.rings} material={neon(NEON.purple, 2)} />
      </RigidBody>
      {pulses}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// 2. Blackout Grid

const GRID_COLORS = [NEON.cyan, NEON.pink, NEON.yellow, NEON.purple]
// One material per tile (each flashes on its own schedule), created once for the level
const tileLooks = Array.from({ length: GRID.n * GRID.n }, (_, i) => {
  const color = new THREE.Color(GRID_COLORS[(Math.floor(i / GRID.n) + (i % GRID.n)) % GRID_COLORS.length])
  return { color, fill: new THREE.MeshStandardMaterial({ color: '#15102e', emissive: color, emissiveIntensity: 0.9, transparent: true }) }
})
const tileGeometry = new THREE.BoxGeometry(GRID.tile, GRID.thick, GRID.tile)
const tileEdges = new THREE.EdgesGeometry(tileGeometry)
const white = new THREE.Color('#ffffff')
const TILE_Y = GRID.top - GRID.thick / 2

function Tile({ r, c }: { r: number; c: number }) {
  const body = useRef<RapierRigidBody>(null)
  const x = tileAt(c)
  const z = tileAt(r)
  const look = tileLooks[r * GRID.n + c]
  // The collider drops away while the tile is blacked out; the glowing outline stays so you can see the grid
  useKinematic(body, (t) => ({ position: tileOut(tilePhase(r, c, t)) ? { x, y: -60, z } : { x, y: TILE_Y, z } }))
  useFrame((state) => {
    const phase = tilePhase(r, c, raceClock())
    const flash = phase === CYCLE - 1 && Math.sin(state.clock.elapsedTime * 28) > 0
    look.fill.emissive.copy(flash ? white : look.color)
    look.fill.emissiveIntensity = flash ? 2.2 : 0.9
    look.fill.opacity = tileOut(phase) ? 0.08 : 1
  })
  return (
    <group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[x, TILE_Y, z]}>
        <CuboidCollider args={[GRID.tile / 2, GRID.thick / 2, GRID.tile / 2]} />
      </RigidBody>
      <group position={[x, TILE_Y, z]}>
        <mesh geometry={tileGeometry} material={look.fill} receiveShadow />
        <lineSegments geometry={tileEdges} material={neon(NEON.cyan, 1.8)} />
      </group>
    </group>
  )
}

export function BlackoutGrid() {
  const tiles = []
  for (let r = 0; r < GRID.n; r++) for (let c = 0; c < GRID.n; c++) tiles.push(<Tile key={`${r}-${c}`} r={r} c={c} />)
  return <group>{tiles}</group>
}

// ---------------------------------------------------------------------------------------------------------
// 3. Ladder Climb

const ORB_COLORS = [NEON.pink, NEON.yellow, NEON.cyan]

function Orb({ ladder, lane, slot }: { ladder: (typeof LADDERS)[number]; lane: number; slot: number }) {
  const body = useRef<RapierRigidBody>(null)
  const { from, to } = ladder
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const travel = length / ORB.speed
  const pool = Math.ceil(travel / ORB.interval) + 1
  const laneOffset = lane * 0.55
  useKinematic(body, (t) => {
    const local = t - laneOffset
    const n = slot + pool * Math.floor((local - slot * ORB.interval) / (pool * ORB.interval))
    const age = local - n * ORB.interval
    if (n < 0 || age > travel) return { position: HIDDEN }
    const f = 1 - age / travel // from the top (f = 1) down to the bottom
    const bounce = ORB.bounce * Math.abs(Math.sin((Math.PI * age) / ORB.hop))
    return {
      position: {
        x: from[0] + (to[0] - from[0]) * f,
        y: from[1] + (to[1] - from[1]) * f + ORB.radius + 0.3 + bounce,
        z: ORB.lanes[lane],
      },
    }
  })
  const down = Math.sign(from[0] - to[0])
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, -500, 0]}
      onCollisionEnter={knockOnHit(() => {
        sfx.knock()
        return { x: down * 9, y: 4, z: 0 } // back down the ladder
      })}
    >
      <BallCollider args={[ORB.radius]} />
      <mesh material={neon(ORB_COLORS[lane], 3)}>
        <sphereGeometry args={[ORB.radius, 20, 16]} />
      </mesh>
    </RigidBody>
  )
}

function Ladder({ ladder }: { ladder: (typeof LADDERS)[number] }) {
  const { from, to, width } = ladder
  const glow = useMemo(() => {
    const half = width / 2
    const rails: [P3, P3][] = [-1, 1].map((s) => [
      [from[0], from[1] + 0.35, s * half],
      [to[0], to[1] + 0.35, s * half],
    ])
    // Rungs across the ramp (it's smooth to run on: these are just light)
    const rungs: [P3, P3][] = []
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const n = Math.floor(length / 1.6)
    for (let i = 1; i < n; i++) {
      const f = i / n
      const x = from[0] + (to[0] - from[0]) * f
      const y = from[1] + (to[1] - from[1]) * f + 0.06
      rungs.push([
        [x, y, -half + 0.2],
        [x, y, half - 0.2],
      ])
    }
    return { rails: bars(rails, 0.28, 0.2), rungs: bars(rungs, 0.18, 0.06) }
  }, [from, to, width])
  const travel = Math.hypot(to[0] - from[0], to[1] - from[1]) / ORB.speed
  const pool = Math.ceil(travel / ORB.interval) + 1
  const orbs = []
  for (let lane = 0; lane < ORB.lanes.length; lane++) for (let slot = 0; slot < pool; slot++) orbs.push(<Orb key={`${lane}-${slot}`} ladder={ladder} lane={lane} slot={slot} />)
  return (
    <group>
      <Beam from={from} to={to} width={width} top="#ff7ae6" side={NEON.purple} extend={0.3} />
      <mesh geometry={glow.rails} material={neon(NEON.pink)} />
      <mesh geometry={glow.rungs} material={neon(NEON.cyan, 1.6)} />
      {orbs}
    </group>
  )
}

export function Ladders() {
  return (
    <>
      {LADDERS.map((l, i) => (
        <Ladder key={i} ladder={l} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// 4. Balloon Lift

function stripeTexture(colors: string[]) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 16
  const g = canvas.getContext('2d')!
  const w = canvas.width / (colors.length * 2)
  for (let i = 0; i < colors.length * 2; i++) {
    g.fillStyle = colors[i % colors.length]
    g.fillRect(i * w, 0, w + 1, canvas.height)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
const balloonLooks = [
  ['#3de8ff', '#6c5cff'],
  ['#ff4fd8', '#ffe14d'],
  ['#ff7a3d', '#e23b4e'],
].map((c) => new THREE.MeshStandardMaterial({ map: stripeTexture(c), roughness: 0.6, emissive: '#ff3d7a', emissiveIntensity: 0.12 }))

const BOB_W = (Math.PI * 2) / BALLOON.period
type Balloon = (typeof BALLOONS)[number]
const basketY = (b: Balloon, t: number) => BALLOON.base + BALLOON.bob * Math.sin(BOB_W * t + b.phase)
const basketVy = (b: Balloon, t: number) => BALLOON.bob * BOB_W * Math.cos(BOB_W * t + b.phase)

// Every basket rim is a moving ledge you can catch and pull yourself up from (see ../grab).
// Corners of each side, relative to the basket centre, with the outward direction of that side.
const RIM_SIDES = [
  { a: [-1, 1], b: [1, 1], out: { x: 0, z: 1 } },
  { a: [-1, -1], b: [1, -1], out: { x: 0, z: -1 } },
  { a: [1, -1], b: [1, 1], out: { x: 1, z: 0 } },
  { a: [-1, -1], b: [-1, 1], out: { x: -1, z: 0 } },
] as const
const RIM_TAPE = RIM_SIDES.map((side) => ({
  a: [side.a[0] * BALLOON.half, 0, side.a[1] * BALLOON.half] as P3,
  b: [side.b[0] * BALLOON.half, 0, side.b[1] * BALLOON.half] as P3,
}))
// Module-level so the physics step can move them in place
const basketRims: GrabEdge[][] = BALLOONS.map((balloon) =>
  RIM_SIDES.map((side) => ({
    kind: 'ledge',
    a: { x: balloon.x + side.a[0] * BALLOON.half, y: basketY(balloon, 0), z: balloon.z + side.a[1] * BALLOON.half },
    b: { x: balloon.x + side.b[0] * BALLOON.half, y: basketY(balloon, 0), z: balloon.z + side.b[1] * BALLOON.half },
    out: side.out,
    vel: { x: 0, y: 0, z: 0 },
  })),
)

function BalloonPlatform({ balloon, index }: { balloon: Balloon; index: number }) {
  const body = useRef<RapierRigidBody>(null)
  useKinematic(body, (t) => ({ position: { x: balloon.x, y: basketY(balloon, t), z: balloon.z } }))
  // Keep the rim ledges on the basket: same timetable, same step
  const rims = basketRims[index]
  useGrabEdges(rims)
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    const y = basketY(balloon, t)
    const vy = basketVy(balloon, t)
    for (const rim of rims) {
      rim.a.y = rim.b.y = y
      rim.vel!.y = vy
    }
  })
  const size = BALLOON.half * 2
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[balloon.x, basketY(balloon, 0), balloon.z]}>
      <CuboidCollider args={[BALLOON.half, 0.35, BALLOON.half]} position={[0, -0.35, 0]} />
      <mesh material={paint('#b0713c')} position={[0, -0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[size, 0.7, size]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={neon(NEON.yellow, 1.4)}>
        <ringGeometry args={[1.25, 1.4, 4, 1, Math.PI / 4]} />
      </mesh>
      {RIM_TAPE.map((r, i) => (
        <TapedRod key={i} a={r.a} b={r.b} tape="neon" />
      ))}
      <HotAirBalloon material={balloonLooks[index % balloonLooks.length]} />
    </RigidBody>
  )
}

export function Balloons() {
  return (
    <>
      {BALLOONS.map((b, i) => (
        <BalloonPlatform key={i} balloon={b} index={i} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// 5. Cloud Hop

const cloudLook = new THREE.MeshStandardMaterial({ color: '#fdf2ff', emissive: '#ff9ce8', emissiveIntensity: 0.25, roughness: 1 })
const PUFFS: [number, number, number, number][] = [
  [0, -0.35, 0, 1.25],
  [1.05, -0.45, 0.35, 0.9],
  [-1.05, -0.45, -0.3, 0.95],
  [0.4, -0.5, -1.05, 0.85],
  [-0.45, -0.5, 1.05, 0.85],
  [1.2, -0.7, -0.9, 0.7],
  [-1.2, -0.7, 0.9, 0.7],
]

function Cloud({ cloud }: { cloud: (typeof CLOUDS)[number] }) {
  const body = useRef<RapierRigidBody>(null)
  useKinematic(body, (t) => ({ position: { x: cloudX(cloud, t), y: cloud.top, z: cloud.z } }))
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[cloudX(cloud, 0), cloud.top, cloud.z]}>
      <CylinderCollider args={[0.4, CLOUD_RADIUS]} position={[0, -0.4, 0]} />
      {PUFFS.map(([x, y, z, r], i) => (
        <mesh key={i} material={cloudLook} position={[x, y, z]} scale={[1, 0.62, 1]} castShadow receiveShadow>
          <sphereGeometry args={[r, 18, 14]} />
        </mesh>
      ))}
    </RigidBody>
  )
}

export function Clouds() {
  return (
    <>
      {CLOUDS.map((c, i) => (
        <Cloud key={i} cloud={c} />
      ))}
    </>
  )
}
