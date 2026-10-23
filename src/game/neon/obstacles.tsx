import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier'
import * as THREE from 'three'
import { useGrabEdges, type GrabEdge } from '../grab'
import { TapedRod } from '../GripTape'
import { knockOnHit } from '../playerContact'
import { COMES_AND_GOES, useKinematic, useTimetable } from '../race/kinematic'
import { paint } from '../race/materials'
import { Beam, Block } from '../race/parts'
import { STEP, raceClock } from '../race/race'
import { sfx } from '../race/sound'
import { neon } from './neonMaterial'
import {
  BALLOONS,
  CLOUDS,
  GRID,
  HIGHWAY_LENGTH,
  LADDER,
  LANDING,
  NEON,
  PAD1,
  PAD2,
  ROAD_WIDTH,
  basketVy,
  basketY,
  cloudX,
  roadPoint,
  roadSlopeX,
  roadY,
  tileX,
  tileZ,
} from './course'

type Point = [number, number, number]
const HIDDEN = { x: 0, y: -500, z: 0 }

// Position and rotation for a visual box stretched between two points
function segment(a: Point, b: Point) {
  const o = new THREE.Object3D()
  o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  o.lookAt(b[0], b[1], b[2])
  const e = o.rotation
  return {
    position: [o.position.x, o.position.y, o.position.z] as Point,
    rotation: [e.x, e.y, e.z] as Point,
    length: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
  }
}

function NeonBar({ a, b, color, size = 0.16, lift = 0.07 }: { a: Point; b: Point; color: string; size?: number; lift?: number }) {
  const s = useMemo(() => segment([a[0], a[1] + lift, a[2]], [b[0], b[1] + lift, b[2]]), [a, b, lift])
  return (
    <mesh position={s.position} rotation={s.rotation} material={neon(color)}>
      <boxGeometry args={[size, size * 0.7, s.length + 0.05]} />
    </mesh>
  )
}

// Horizontal unit vector pointing to the runner's right at distance u along the road
function roadRight(u: number): [number, number] {
  const sx = roadSlopeX(u)
  const len = Math.hypot(1, sx)
  return [1 / len, sx / len]
}

// ---------------------------------------------------------------------------------------------------------
// 1. Neon Highway: a winding road with glowing edges; data pulses race down it towards you

const ROAD_STEP = 2
const PULSE_LANES = [-2.2, 0, 2.2]
const PULSE_SPEED = 9
const PULSE_WAVE = 1.3
// Pulses appear a few metres short of the road's end so the checkpoint pad beyond it is safe ground
const PULSE_START_U = HIGHWAY_LENGTH - 4
const PULSE_TRAVEL = PULSE_START_U / PULSE_SPEED
const PULSE_POOL = Math.ceil(PULSE_TRAVEL / PULSE_WAVE) + 1
const PULSE_GAP_PATTERN = [1, 0, 2, 1, 2, 0, 1, 2] // clear lane per wave
const pulseCore = neon(NEON.cyan, 3)
const pulseShell = new THREE.MeshStandardMaterial({
  color: '#0b2b3a',
  transparent: true,
  opacity: 0.55,
  emissive: NEON.cyan,
  emissiveIntensity: 0.6,
})

function pulseState(t: number, slot: number, lane: number) {
  const n = slot + PULSE_POOL * Math.floor((t - slot * PULSE_WAVE) / (PULSE_POOL * PULSE_WAVE))
  const age = t - n * PULSE_WAVE
  const active = n >= 0 && age <= PULSE_TRAVEL && PULSE_GAP_PATTERN[n % PULSE_GAP_PATTERN.length] !== lane
  return { active, u: PULSE_START_U - PULSE_SPEED * age, age }
}

function Pulse({ slot, lane }: { slot: number; lane: number }) {
  const body = useRef<RapierRigidBody>(null)
  const spin = useMemo(() => new THREE.Quaternion(), [])
  const tumble = useMemo(() => new THREE.Euler(), [])
  const offset = PULSE_LANES[lane]
  useKinematic(body, (t) => {
    const { active, u, age } = pulseState(t, slot, lane)
    if (!active) return { position: HIDDEN }
    const [rx, rz] = roadRight(u)
    const [x, y, z] = roadPoint(u)
    return {
      position: { x: x + rx * offset, y: y + 0.75 + 0.12 * Math.sin(age * 8), z: z + rz * offset },
      rotation: spin.setFromEuler(tumble.set(age * 2, age * 3, 0)),
    }
  }, 'hazard')
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, -500, 0]}
      onCollisionEnter={knockOnHit((p) => {
        sfx.knock()
        // Back, up and sideways out of the pulse's lane. Straight back alone let the pulse (moving the same
        // way) keep catching up and shove the runner all the way to the start.
        const { u } = pulseState(raceClock(), slot, lane)
        const [rx, rz] = roadRight(u)
        const [cx, , cz] = roadPoint(u)
        const side = Math.sign((p.x - cx) * rx + (p.z - cz) * rz - offset) || (lane === 0 ? -1 : 1)
        return { x: rx * side * 8, y: 6, z: rz * side * 8 + 6 }
      })}
    >
      <CuboidCollider args={[0.5, 0.5, 0.5]} />
      <mesh material={pulseShell}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh material={pulseCore}>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
      </mesh>
    </RigidBody>
  )
}

export function Highway() {
  const segments = useMemo(() => {
    const out: { a: Point; b: Point; i: number }[] = []
    for (let u = 0, i = 0; u < HIGHWAY_LENGTH; u += ROAD_STEP, i++) {
      out.push({ a: roadPoint(u), b: roadPoint(Math.min(u + ROAD_STEP, HIGHWAY_LENGTH)), i })
    }
    return out
  }, [])
  const edge = (p: Point, u: number, side: number): Point => {
    const [rx, rz] = roadRight(u)
    const d = side * (ROAD_WIDTH / 2 - 0.12)
    return [p[0] + rx * d, p[1], p[2] + rz * d]
  }
  const pulses = []
  for (let slot = 0; slot < PULSE_POOL; slot++) {
    for (let lane = 0; lane < PULSE_LANES.length; lane++) pulses.push(<Pulse key={`${slot}-${lane}`} slot={slot} lane={lane} />)
  }
  return (
    <group>
      {segments.map(({ a, b, i }) => {
        const u0 = i * ROAD_STEP
        const u1 = Math.min(u0 + ROAD_STEP, HIGHWAY_LENGTH)
        return (
          <group key={i}>
            <Beam from={a} to={b} width={ROAD_WIDTH} top={NEON.road} side={NEON.roadSide} extend={0.35} />
            <NeonBar a={edge(a, u0, -1)} b={edge(b, u1, -1)} color={NEON.yellow} />
            <NeonBar a={edge(a, u0, 1)} b={edge(b, u1, 1)} color={NEON.cyan} />
            {i % 2 === 0 && <NeonBar a={a} b={b} color={NEON.pink} size={0.22} />}
          </group>
        )
      })}
      {/* Checkpoint pad at the end of the highway */}
      <Block min={[-6, roadY(HIGHWAY_LENGTH) - 1, PAD1.z1]} max={[6, roadY(HIGHWAY_LENGTH), PAD1.z0]} color={NEON.roadSide} top={NEON.road} />
      {pulses}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// 2. Blackout Grid: tiles drop out in a V-shaped band that sweeps down the grid on the beat

const BEAT = 0.75
const CYCLE = 7 // beats
const GRID_COLORS = [NEON.cyan, NEON.pink, NEON.yellow, NEON.purple]

// Beats until this tile's blackout: 0-1 = off, CYCLE-1 = warning (flashing) one beat before
function tilePhase(r: number, c: number, t: number) {
  const beat = Math.floor(t / BEAT)
  const center = (GRID.cols - 1) / 2
  return ((((beat - (r + Math.abs(c - center))) % CYCLE) + CYCLE) % CYCLE) as number
}
const isOff = (phase: number) => phase <= 1

// One material per tile (each flashes on its own schedule), created once for the level
const tileLooks = Array.from({ length: GRID.rows * GRID.cols }, (_, i) => {
  const color = new THREE.Color(GRID_COLORS[(Math.floor(i / GRID.cols) + (i % GRID.cols)) % GRID_COLORS.length])
  return {
    color,
    fill: new THREE.MeshStandardMaterial({ color: '#15102e', emissive: color, emissiveIntensity: 0.9, transparent: true }),
  }
})
const tileGeometry = new THREE.BoxGeometry(GRID.tile, 0.5, GRID.tile)
const tileEdges = new THREE.EdgesGeometry(tileGeometry)
const white = new THREE.Color('#ffffff')

function Tile({ r, c }: { r: number; c: number }) {
  const body = useRef<RapierRigidBody>(null)
  const x = tileX(c)
  const z = tileZ(r)
  const collider = useRef<RapierCollider>(null)
  const look = tileLooks[r * GRID.cols + c]
  // The tile stops being solid while it's blacked out (the glowing outline stays, so you can see the grid). It
  // stays where it is: one that dropped away and shot back would fling anyone caught in the gap as it came.
  // On the timetable it's "gone" (far below) while it's out, for the bots looking ahead.
  useTimetable(body, (t) => ({ position: isOff(tilePhase(r, c, t)) ? { x, y: -400, z } : { x, y: -0.25, z } }))
  useBeforePhysicsStep(() => {
    const solid = !isOff(tilePhase(r, c, raceClock() + STEP))
    if (collider.current && collider.current.isEnabled() !== solid) collider.current.setEnabled(solid)
  })
  useFrame((state) => {
    const phase = tilePhase(r, c, raceClock())
    const flash = phase === CYCLE - 1 && Math.sin(state.clock.elapsedTime * 28) > 0
    look.fill.emissive.copy(flash ? white : look.color)
    look.fill.emissiveIntensity = flash ? 2.2 : 0.9
    look.fill.opacity = isOff(phase) ? 0.08 : 1
  })
  return (
    <group>
      <RigidBody ref={body} type="fixed" colliders={false} position={[x, -0.25, z]}>
        <CuboidCollider ref={collider} args={[GRID.tile / 2, 0.25, GRID.tile / 2]} collisionGroups={COMES_AND_GOES} />
      </RigidBody>
      <group position={[x, -0.25, z]}>
        <mesh geometry={tileGeometry} material={look.fill} receiveShadow />
        <lineSegments geometry={tileEdges} material={neon(NEON.cyan, 1.8)} />
      </group>
    </group>
  )
}

export function BlackoutGrid() {
  const tiles = []
  for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) tiles.push(<Tile key={`${r}-${c}`} r={r} c={c} />)
  return (
    <group>
      {tiles}
      <Block min={[-6, -1, PAD2.z1]} max={[6, 0, PAD2.z0]} color={NEON.roadSide} top={NEON.road} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// 3. Ladder Climb: a long pink ramp; glowing orbs bounce down it in three lanes

const ORB_LANES = [-1.8, 0, 1.8]
const ORB_RADIUS = 0.55
const ORB_SPEED = 7
const ORB_INTERVAL = 1.6
const ORB_BOUNCE = 1.4
const ORB_HOP = 0.55 // seconds per bounce
const LADDER_LENGTH = Math.hypot(LADDER.to[1] - LADDER.from[1], LADDER.to[2] - LADDER.from[2])
const ORB_TRAVEL = LADDER_LENGTH / ORB_SPEED
const ORB_POOL = Math.ceil(ORB_TRAVEL / ORB_INTERVAL) + 1
const ORB_COLORS = [NEON.pink, NEON.yellow, NEON.cyan]

function Orb({ lane, slot }: { lane: number; slot: number }) {
  const body = useRef<RapierRigidBody>(null)
  const laneOffset = lane * 0.55
  useKinematic(body, (t) => {
    const local = t - laneOffset
    const n = slot + ORB_POOL * Math.floor((local - slot * ORB_INTERVAL) / (ORB_POOL * ORB_INTERVAL))
    const age = local - n * ORB_INTERVAL
    if (n < 0 || age > ORB_TRAVEL) return { position: HIDDEN }
    const f = 1 - age / ORB_TRAVEL // from the top (f = 1) down to the bottom
    const bounce = ORB_BOUNCE * Math.abs(Math.sin((Math.PI * age) / ORB_HOP))
    return {
      position: {
        x: ORB_LANES[lane],
        y: LADDER.from[1] + (LADDER.to[1] - LADDER.from[1]) * f + ORB_RADIUS + 0.3 + bounce,
        z: LADDER.from[2] + (LADDER.to[2] - LADDER.from[2]) * f,
      },
    }
  }, 'hazard')
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, -500, 0]}
      onCollisionEnter={knockOnHit(() => {
        sfx.knock()
        return { x: 0, y: 4, z: 9 } // back down the ladder
      })}
    >
      <BallCollider args={[ORB_RADIUS]} />
      <mesh material={neon(ORB_COLORS[lane], 3)}>
        <sphereGeometry args={[ORB_RADIUS, 20, 16]} />
      </mesh>
    </RigidBody>
  )
}

export function LadderClimb() {
  const rungs = useMemo(() => {
    const out: Point[] = []
    const n = Math.floor(LADDER_LENGTH / 1.6)
    for (let i = 1; i < n; i++) {
      const f = i / n
      out.push([0, LADDER.from[1] + (LADDER.to[1] - LADDER.from[1]) * f, LADDER.from[2] + (LADDER.to[2] - LADDER.from[2]) * f])
    }
    return out
  }, [])
  const half = LADDER.width / 2
  const rail = (side: number, lift: number): [Point, Point] => [
    [side * half, LADDER.from[1] + lift, LADDER.from[2]],
    [side * half, LADDER.to[1] + lift, LADDER.to[2]],
  ]
  const pitch = Math.atan2(LADDER.to[1] - LADDER.from[1], LADDER.from[2] - LADDER.to[2])
  const orbs = []
  for (let lane = 0; lane < ORB_LANES.length; lane++)
    for (let slot = 0; slot < ORB_POOL; slot++) orbs.push(<Orb key={`${lane}-${slot}`} lane={lane} slot={slot} />)
  return (
    <group>
      <Beam from={LADDER.from} to={LADDER.to} width={LADDER.width} top="#ff7ae6" side={NEON.purple} extend={0.3} />
      {/* Ladder rails and rungs (visual: the ramp itself is smooth to run on) */}
      {[-1, 1].map((s) => (
        <NeonBar key={s} a={rail(s, 0.35)[0]} b={rail(s, 0.35)[1]} color={NEON.pink} size={0.28} />
      ))}
      {rungs.map((p, i) => (
        <mesh key={i} position={[p[0], p[1] + 0.05, p[2]]} rotation={[-pitch, 0, 0]} material={neon(NEON.cyan, 1.6)}>
          <boxGeometry args={[LADDER.width - 0.4, 0.06, 0.18]} />
        </mesh>
      ))}
      {orbs}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// 4. Balloon Lift: basket platforms bobbing under striped hot-air balloons

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
  ['#ff3d5a', '#ffb547'],
  ['#ff4fd8', '#ffe14d'],
  ['#ff7a3d', '#e23b4e'],
].map((c) => new THREE.MeshStandardMaterial({ map: stripeTexture(c), roughness: 0.6, emissive: '#ff3d7a', emissiveIntensity: 0.12 }))


// Every basket rim is a moving ledge you can catch and pull yourself up from (see ../grab).
// Corners of each side, relative to the basket centre, with the outward direction of that side.
const BASKET_HALF = 1.6
const RIM_SIDES = [
  { a: [-1, 1], b: [1, 1], out: { x: 0, z: 1 } },
  { a: [-1, -1], b: [1, -1], out: { x: 0, z: -1 } },
  { a: [1, -1], b: [1, 1], out: { x: 1, z: 0 } },
  { a: [-1, -1], b: [-1, 1], out: { x: -1, z: 0 } },
] as const
const RIM_TAPE = RIM_SIDES.map((side) => ({
  a: [side.a[0] * BASKET_HALF, 0, side.a[1] * BASKET_HALF] as Point,
  b: [side.b[0] * BASKET_HALF, 0, side.b[1] * BASKET_HALF] as Point,
}))
// Module-level so the physics step can move them in place
const basketRims: GrabEdge[][] = BALLOONS.map((balloon) =>
  RIM_SIDES.map((side) => ({
    kind: 'ledge',
    a: { x: balloon.x + side.a[0] * BASKET_HALF, y: basketY(balloon, 0), z: balloon.z + side.a[1] * BASKET_HALF },
    b: { x: balloon.x + side.b[0] * BASKET_HALF, y: basketY(balloon, 0), z: balloon.z + side.b[1] * BASKET_HALF },
    out: side.out,
    vel: { x: 0, y: 0, z: 0 },
  })),
)

// The front edge of the landing deck after the last balloon, for jumps that come up short
const LANDING_TAPE = {
  a: [LANDING.min[0], LANDING.max[1], LANDING.max[2]] as Point,
  b: [LANDING.max[0], LANDING.max[1], LANDING.max[2]] as Point,
}
const LANDING_EDGE: GrabEdge[] = [
  {
    kind: 'ledge',
    a: { x: LANDING_TAPE.a[0], y: LANDING_TAPE.a[1], z: LANDING_TAPE.a[2] },
    b: { x: LANDING_TAPE.b[0], y: LANDING_TAPE.b[1], z: LANDING_TAPE.b[2] },
    out: { x: 0, z: 1 },
  },
]

// The envelope rides high on long ropes so it stays above the chase camera's line of sight to the next basket
const ENVELOPE_Y = 10
const SKIRT_Y = 7

export function HotAirBalloon({ material }: { material: THREE.Material }) {
  const ropes = useMemo(
    () =>
      [
        [-1.4, -1.4],
        [1.4, -1.4],
        [-1.4, 1.4],
        [1.4, 1.4],
      ].map(([x, z]) => segment([x, 0.1, z], [x * 0.55, SKIRT_Y - 0.6, z * 0.55])),
    [],
  )
  return (
    <group>
      <mesh material={material} position={[0, ENVELOPE_Y, 0]} scale={[1, 1.15, 1]} castShadow>
        <sphereGeometry args={[2.4, 32, 24]} />
      </mesh>
      <mesh material={material} position={[0, SKIRT_Y, 0]}>
        <coneGeometry args={[1.2, 1.4, 24, 1, true]} />
      </mesh>
      {/* Burner glow and ropes down to the basket */}
      <mesh position={[0, SKIRT_Y - 0.9, 0]} material={neon('#ff9a3d', 3)}>
        <coneGeometry args={[0.25, 0.6, 12]} />
      </mesh>
      {ropes.map((r, i) => (
        <mesh key={i} position={r.position} rotation={r.rotation} material={paint('#c9a27e')}>
          <boxGeometry args={[0.06, 0.06, r.length]} />
        </mesh>
      ))}
    </group>
  )
}

function BalloonPlatform({ balloon, index }: { balloon: (typeof BALLOONS)[number]; index: number }) {
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
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[balloon.x, basketY(balloon, 0), balloon.z]}>
      <CuboidCollider args={[1.6, 0.35, 1.6]} position={[0, -0.35, 0]} />
      <mesh material={paint('#b0713c')} position={[0, -0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.7, 3.2]} />
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

export function BalloonLift() {
  useGrabEdges(LANDING_EDGE)
  return (
    <>
      {BALLOONS.map((b, i) => (
        <BalloonPlatform key={i} balloon={b} index={i} />
      ))}
      <TapedRod a={LANDING_TAPE.a} b={LANDING_TAPE.b} tape="neon" />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// 5. Cloud Hop: flat-topped pink-lit clouds; two drift from side to side

const CLOUD_RADIUS = 1.8
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

export function CloudHop() {
  return (
    <>
      {CLOUDS.map((c, i) => (
        <Cloud key={i} cloud={c} />
      ))}
    </>
  )
}
