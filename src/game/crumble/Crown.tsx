import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { allRunners, knockOnHit, loudness, type Vec3 } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { STEP, eliminate, eliminateRacer, finishRace, playerPosition, raceClock, raceOver, racers } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import { CROWN, CROWN_TILES, CRUMBLE_COURSE, SURVIVAL } from './course'
import { Crumble } from './Crumble'
import { addDust } from './dust'
import { box } from './shapes'
import { shakeCamera } from './shake'
import { stoneBlock, stoneDark } from './stone'
import {
  arenaHalf,
  beamAngle,
  beamSpin,
  beginSurvival,
  collapsed,
  quakeAt,
  stageAt,
  survival,
  survivalEnd,
  surviving,
  tileFallAt,
  tileRing,
} from './survival'

// 4. Crown: a 25 x 25 stone platform on top of the tower, with a magic crystal floating over the middle and
// a turret on each corner (out of the beam's reach: safe, while they last). The first to stand on it (you or
// any of the others) starts the survival phase: every stage the outer ring of tiles falls (25 → 20 → 15 → 10 → 5), the beam turns
// faster, rocks drop from the sky more often and quakes come closer together. Hold on to the end to win.

type Point = [number, number, number]

const TOP = CROWN.top
const SIZE = CROWN.tile - 0.04
const tileGeometry = new THREE.BoxGeometry(SIZE, CROWN.thickness, SIZE)
// Each ring its own shade, so you can see which is next to go (the outermost darkest)
const RING_TINTS = ['#ffffff', '#f6efe4', '#ede2d0', '#e2d2ba', '#d6c2a4']
const ringLooks = RING_TINTS.map((c) => {
  const m = stoneBlock.clone()
  m.color.set(c)
  return m
})

// A tile's top, for its cracks: the texture in metres, shifted tile to tile so the cracks differ
function crackTop(seed: number) {
  const h = SIZE / 2
  const shape = new THREE.Shape([new THREE.Vector2(-h, -h), new THREE.Vector2(h, -h), new THREE.Vector2(h, h), new THREE.Vector2(-h, h)])
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, CROWN.thickness / 2 + 0.03, 0)
  const uv = g.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + (seed % 5), uv.getY(i) + ((seed * 7) % 5))
  return g
}

const cornerIndex = CROWN_TILES - 1
const TILES = Array.from({ length: CROWN_TILES * CROWN_TILES }, (_, n) => {
  const i = n % CROWN_TILES
  const j = Math.floor(n / CROWN_TILES)
  const x = -CROWN.half + (i + 0.5) * CROWN.tile
  const z = -CROWN.half + (j + 0.5) * CROWN.tile
  const ring = tileRing(i, j)
  // The fall ripples round the ring over a second or so
  const delay = ((Math.atan2(x, z) + Math.PI) / (Math.PI * 2)) * 1.2
  const fallAt = () => tileFallAt(ring, delay)
  const seed = n * 1.37
  return {
    key: n,
    ring,
    position: [x, TOP - CROWN.thickness / 2, z] as Point,
    fallAt,
    crack: { geometry: crackTop(n * 2.3), at: () => fallAt() - 4 },
    // Quakes shake every tile
    move: (t: number, out: THREE.Vector3) => {
      const q = quakeAt(t)
      out.set(Math.sin(t * 41 + seed) * 0.05 * q, Math.sin(t * 37 + seed * 2) * 0.04 * q, Math.sin(t * 47 + seed * 3) * 0.05 * q)
    },
    turret: (i === 0 || i === cornerIndex) && (j === 0 || j === cornerIndex),
  }
})

// A corner turret: a raised block with battlements and a pennant
const TURRET_H = 1
const flagLook = paint('#7cf08a')
const safeLook = new THREE.MeshStandardMaterial({ color: '#7cf08a', emissive: '#4fd96a', emissiveIntensity: 0.8 })
function Turret() {
  const y = CROWN.thickness / 2
  const h = SIZE / 2 - 0.15
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={box(SIZE - 0.2, TURRET_H, SIZE - 0.2)} material={stoneDark} position={[0, TURRET_H / 2, 0]} castShadow receiveShadow />
      {[
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ].map(([x, z], k) => (
        <mesh key={k} geometry={box(0.4, 0.5, 0.4)} material={stoneDark} position={[x, TURRET_H + 0.25, z]} castShadow />
      ))}
      <mesh material={safeLook} position={[0, TURRET_H + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.75, 32]} />
      </mesh>
      <mesh geometry={box(0.08, 2.4, 0.08)} material={stoneDark} position={[h, TURRET_H + 1.2, h]} />
      <mesh material={flagLook} position={[h - 0.35, TURRET_H + 2.1, h]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.3, 0.7, 3]} />
      </mesh>
    </group>
  )
}

function Tiles() {
  return (
    <>
      {TILES.map((tile) => (
        <Crumble
          key={tile.key}
          fallAt={tile.fallAt}
          position={tile.position}
          geometry={tileGeometry}
          material={ringLooks[tile.ring]}
          crack={tile.crack}
          move={tile.move}
          lookAhead={false}
          colliders={
            <>
              <CuboidCollider args={[SIZE / 2, CROWN.thickness / 2, SIZE / 2]} />
              {tile.turret && <CuboidCollider args={[SIZE / 2 - 0.1, TURRET_H / 2, SIZE / 2 - 0.1]} position={[0, CROWN.thickness / 2 + TURRET_H / 2, 0]} />}
            </>
          }
        >
          {tile.turret && <Turret />}
        </Crumble>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The beam: a long bar turning low round the hub under the crystal, faster every stage. Jump it.

const BEAM_HALF = 11
const BEAM_Y = TOP + 0.6
const Y = new THREE.Vector3(0, 1, 0)
const beamLook = new THREE.MeshStandardMaterial({ color: '#3b2f5c', metalness: 0.4, roughness: 0.5 })
const glowLook = new THREE.MeshStandardMaterial({ color: '#b69cff', emissive: '#9d7bff', emissiveIntensity: 1.6 })

function Beam() {
  const body = useRef<RapierRigidBody>(null)
  const turn = useMemo(() => new THREE.Quaternion(), [])
  useKinematic(body, (t) => ({ position: { x: 0, y: BEAM_Y, z: 0 }, rotation: turn.setFromAxisAngle(Y, beamAngle(t)) }), 'hazard')
  const knock = knockOnHit((player) => {
    const spin = beamSpin(raceClock())
    if (!spin) return { x: 0, y: 2, z: 0 }
    sfx.knock()
    const vx = spin * player.z
    const vz = -spin * player.x
    const speed = Math.hypot(vx, vz) || 1
    const push = Math.max(8, speed * 1.3)
    return { x: (vx / speed) * push, y: 5.5, z: (vz / speed) * push }
  })
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, BEAM_Y, 0]} onCollisionEnter={knock}>
      <CuboidCollider args={[BEAM_HALF, 0.25, 0.25]} />
      <CylinderCollider args={[0.7, 0.75]} />
      <mesh geometry={box(BEAM_HALF * 2, 0.5, 0.5)} material={beamLook} castShadow />
      {Array.from({ length: 8 }, (_, k) => (
        <mesh key={k} geometry={box(0.18, 0.52, 0.52)} material={glowLook} position={[-BEAM_HALF + 1.2 + k * ((BEAM_HALF * 2 - 2.4) / 7), 0, 0]} />
      ))}
      <mesh material={stoneDark} castShadow>
        <cylinderGeometry args={[0.75, 0.9, 1.4, 20]} />
      </mesh>
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The crystal: floating over the hub, turning, pulsing faster as the crown comes apart

const CRYSTAL_Y = TOP + 7.5
const crystalLook = new THREE.MeshStandardMaterial({
  color: '#c7b3ff',
  emissive: '#7d55ff',
  emissiveIntensity: 1.2,
  roughness: 0.15,
  metalness: 0.1,
  transparent: true,
  opacity: 0.9,
  flatShading: true,
})

function Crystal() {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    const t = raceClock()
    const g = group.current!
    const stage = surviving(t) ? stageAt(t) + 1 : 0
    const time = clock.elapsedTime
    g.rotation.y = time * (0.4 + stage * 0.25)
    g.position.y = CRYSTAL_Y + Math.sin(time * 1.3) * 0.4
    const pulse = 0.5 + 0.5 * Math.sin(time * (2 + stage * 1.5))
    crystalLook.emissiveIntensity = 1 + pulse * (0.6 + stage * 0.3)
    light.current!.intensity = 60 + pulse * (30 + stage * 20)
  })
  return (
    <group ref={group} position={[0, CRYSTAL_Y, 0]}>
      <mesh material={crystalLook} scale={[1.4, 2.4, 1.4]}>
        <octahedronGeometry args={[1, 0]} />
      </mesh>
      {[0, 1].map((k) => (
        <mesh key={k} material={glowLook} rotation={[Math.PI / 2 + (k ? 0.5 : -0.5), 0, 0]}>
          <torusGeometry args={[2.6 + k * 0.6, 0.06, 8, 48]} />
        </mesh>
      ))}
      {/* A thread of light down to the hub */}
      <mesh material={glowLook} position={[0, -(CRYSTAL_Y - BEAM_Y) / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.12, CRYSTAL_Y - BEAM_Y - 1.5, 8]} />
      </mesh>
      <pointLight ref={light} color="#b69cff" intensity={60} distance={40} decay={2} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Lightning: bolts from the sky into the crystal (and, once the survival phase is on, all round the crown)

const boltLook = new THREE.MeshBasicMaterial({ color: '#eef3ff', transparent: true, opacity: 0, toneMapped: false })

function boltGeometry(to: THREE.Vector3) {
  const from = new THREE.Vector3(to.x + (Math.random() - 0.5) * 30, 110, to.z + (Math.random() - 0.5) * 30)
  const jagged = (a: THREE.Vector3, b: THREE.Vector3, n: number, wobble: number) => {
    const points = [a.clone()]
    for (let k = 1; k < n; k++) {
      const p = a.clone().lerp(b, k / n)
      const w = wobble * Math.sin((Math.PI * k) / n)
      p.x += (Math.random() - 0.5) * w
      p.z += (Math.random() - 0.5) * w
      points.push(p)
    }
    points.push(b.clone())
    return points
  }
  const tube = (points: THREE.Vector3[], radius: number) => {
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let k = 1; k < points.length; k++) path.add(new THREE.LineCurve3(points[k - 1], points[k]))
    return new THREE.TubeGeometry(path, points.length * 2, radius, 5, false)
  }
  const main = jagged(from, to, 16, 9)
  const parts = [tube(main, 0.14)]
  for (const at of [5, 9]) {
    const start = main[at]
    const end = start.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, -12 - Math.random() * 10, (Math.random() - 0.5) * 16))
    parts.push(tube(jagged(start, end, 7, 4), 0.07))
  }
  return parts
}

function Lightning() {
  const group = useRef<THREE.Group>(null)
  const flash = useRef<THREE.DirectionalLight>(null)
  const bolts = useRef({ next: 0, struck: -10, meshes: [] as THREE.Mesh[] })
  useFrame(() => {
    const state = bolts.current
    const t = raceClock()
    const high = playerPosition.y > 30
    const storm = surviving(t)
    if (state.next === 0) state.next = t + 6
    if (t >= state.next && (high || storm)) {
      state.next = t + (storm ? 2 + Math.random() * 3 : 6 + Math.random() * 5)
      state.struck = t
      const target = storm && Math.random() < 0.6
        ? new THREE.Vector3((Math.random() - 0.5) * 34, TOP, (Math.random() - 0.5) * 34)
        : new THREE.Vector3(0, CRYSTAL_Y + 2.5, 0)
      for (const m of state.meshes) {
        group.current!.remove(m)
        m.geometry.dispose()
      }
      state.meshes = boltGeometry(target).map((g) => new THREE.Mesh(g, boltLook))
      for (const m of state.meshes) group.current!.add(m)
      sfx.thunder()
      if (storm) shakeCamera(0.01, 0.4, t)
    }
    const since = t - state.struck
    // A double flicker, then gone
    const on = since < 0.07 || (since > 0.12 && since < 0.3)
    boltLook.opacity = on ? 1 : Math.max(0, 1 - since * 4) * 0.3
    flash.current!.intensity = since < 0.35 ? (on ? 2.2 : 0.6) : 0
  })
  return (
    <>
      <group ref={group} />
      <directionalLight ref={flash} position={[0, 100, 0]} color="#dfe6ff" intensity={0} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Falling debris: a red ring marks where a rock is about to land (every other one where somebody's standing:
// you, if you're up there); a direct hit throws you. And quakes: the crown shakes and bounces everyone about.

const DROP_WARN = 1.6
const DROP_FALL = 0.8
const DROP_HEIGHT = 26
const POOL = 5
const warnGeometry = new THREE.RingGeometry(1.3, 1.7, 32).rotateX(-Math.PI / 2)
const rockGeometry = new THREE.DodecahedronGeometry(0.9, 0)
const warnLook = new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0.8, depthWrite: false })
const onCrown = (p: Vec3) => Math.abs(p.x) < CROWN.half && Math.abs(p.z) < CROWN.half && p.y > TOP - 1
// Somebody on the crown for the next rock to come down on: you, if you're there
function markFor(): Vec3 | null {
  if (onCrown(playerPosition)) return playerPosition
  const up = [...allRunners()].map((r) => r.position()).filter(onCrown)
  return up.length ? up[Math.floor(Math.random() * up.length)] : null
}
function Hazards() {
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const rocks = useRef<(THREE.Mesh | null)[]>([])
  const hazards = useRef({ next: Infinity, count: 0, quake: 0, start: Infinity })
  useFrame(() => {
    const state = hazards.current
    const t = raceClock()
    const drops = survival.drops
    // A new survival phase: set out the first drop
    if (state.start !== survival.start) {
      state.start = survival.start
      drops.length = 0
      state.next = survival.start + 2.5
      state.count = 0
      state.quake = 0
    }
    const up = onCrown(playerPosition)
    if (surviving(t) && t >= state.next && t < survivalEnd() - 1) {
      const stage = stageAt(t)
      const half = arenaHalf(stageAt(t + DROP_WARN)) - 0.8
      const mark = state.count % 2 === 1 ? markFor() : null
      const x = mark ? THREE.MathUtils.clamp(mark.x, -half, half) : (Math.random() * 2 - 1) * half
      const z = mark ? THREE.MathUtils.clamp(mark.z, -half, half) : (Math.random() * 2 - 1) * half
      drops.push({ x, z, land: t + DROP_WARN, done: false })
      if (drops.length > POOL) drops.shift()
      state.count++
      state.next = t + SURVIVAL.debrisEvery[stage]
    }
    // Landings
    for (const d of drops) {
      if (d.done || t < d.land) continue
      d.done = true
      addDust({ x: d.x, y: TOP + 0.3, z: d.z }, 8, 1.6, 0.9)
      for (const runner of allRunners()) {
        const p = runner.position()
        const dx = p.x - d.x
        const dz = p.z - d.z
        const dist = Math.hypot(dx, dz)
        const dy = p.y - TOP
        if (dist < 1.9 && dy > -0.5 && dy < 3) {
          withVolume(loudness(runner), () => {
            sfx.knock()
            runner.knock({ x: (dx / (dist || 1)) * 11, y: 7, z: (dz / (dist || 1)) * 11 })
          })
        }
      }
      if (up) {
        sfx.crumble()
        shakeCamera(0.02 * Math.max(0, 1 - Math.hypot(playerPosition.x - d.x, playerPosition.z - d.z) / 14), 0.35, t)
      }
    }
    // Quakes
    const quakes = survival.quakes
    while (state.quake < quakes.length && t >= quakes[state.quake]) {
      state.quake++
      if (up) {
        sfx.rumble()
        shakeCamera(0.03, 1.6, t)
      }
      for (const runner of allRunners()) {
        const p = runner.position()
        if (onCrown(p) && p.y < TOP + 1.6) runner.knock({ x: (Math.random() - 0.5) * 3, y: 3.5, z: (Math.random() - 0.5) * 3 })
      }
    }
    // Draw
    for (let k = 0; k < POOL; k++) {
      const d = drops[k]
      const ring = rings.current[k]!
      const rock = rocks.current[k]!
      if (!d || d.done) {
        ring.visible = rock.visible = false
        continue
      }
      const left = d.land - t
      ring.visible = true
      ring.position.set(d.x, TOP + 0.06, d.z)
      ring.scale.setScalar(1 + 0.15 * Math.sin(t * 20))
      rock.visible = left < DROP_FALL
      const k2 = 1 - left / DROP_FALL
      rock.position.set(d.x, TOP + 0.9 + DROP_HEIGHT * (1 - k2 * k2), d.z)
      rock.rotation.set(t * 3, t * 2, 0)
    }
  })
  return (
    <>
      {Array.from({ length: POOL }, (_, k) => (
        <group key={k}>
          <mesh
            ref={(m) => {
              rings.current[k] = m
            }}
            geometry={warnGeometry}
            material={warnLook}
            visible={false}
            renderOrder={2}
          />
          <mesh
            ref={(m) => {
              rocks.current[k] = m
            }}
            geometry={rockGeometry}
            material={stoneDark}
            visible={false}
            castShadow
          />
        </group>
      ))}
    </>
  )
}

// Starts the survival phase when anybody first stands on the crown; ends it for the player (a win) if they're
// still in at the end; and puts anyone who falls off it out (there's the tower's roof below, but that doesn't
// count), and once the rest of the tower has gone, anyone who isn't up there
const ON_CROWN = CRUMBLE_COURSE.checkpoints.length // the crown's checkpoint (the last)
const standingOnCrown = (p: Vec3) => Math.abs(p.x) < CROWN.half && Math.abs(p.z) < CROWN.half && p.y > TOP + 0.5 && p.y < TOP + 4
function SurvivalRules() {
  const reached = useRef(false)
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (!surviving(t)) {
      reached.current = false
      for (const runner of allRunners()) {
        if (!standingOnCrown(runner.position())) continue
        beginSurvival(t)
        sfx.rumble()
        break
      }
      return
    }
    // (Somebody else got there first and you're still on your way up: you've a moment to get there too)
    const out = (y: number, wasUp: boolean) => y < TOP - 6 && (wasUp || collapsed(t))
    for (const racer of racers()) {
      if (racer.outClock === null && out(racer.at.y, racer.checkpoint >= ON_CROWN)) eliminateRacer(racer)
    }
    if (raceOver()) return
    const p = playerPosition
    if (standingOnCrown(p)) reached.current = true
    if (out(p.y, reached.current)) eliminate()
    else if (t >= survivalEnd()) finishRace()
  })
  return null
}

export function Crown() {
  return (
    <group>
      <Tiles />
      <Beam />
      <Crystal />
      <Lightning />
      <Hazards />
      <SurvivalRules />
    </group>
  )
}
