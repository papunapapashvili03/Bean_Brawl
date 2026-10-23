import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BallCollider,
  CoefficientCombineRule,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier'
import * as THREE from 'three'
import { allRunners, knockOnHit, loudness } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { Beam } from '../race/parts'
import { raceClock, surfaces } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import {
  BRIDGE,
  BUMPERS,
  BUMPER_STAIRS,
  CANNONS,
  COLORS,
  DRONES,
  PILLARS,
  RAMPS,
  RAMP_WIDTH,
  ROLLERS,
  ROLLER_RADIUS,
  TIERS,
} from './course'

const GRAVITY = 20
const HIDDEN = { x: 0, y: -500, z: 0 }
const xAxis = new THREE.Vector3(1, 0, 0)
const yAxis = new THREE.Vector3(0, 1, 0)
const zAxis = new THREE.Vector3(0, 0, 1)

// Timetabled pool: which release a pooled slot is showing and how long ago it was released
function poolRelease(t: number, slot: number, pool: number, interval: number) {
  const n = slot + pool * Math.floor((t - slot * interval) / (pool * interval))
  return { n, age: t - n * interval }
}

// ---------------------------------------------------------------------------------------------------------
// Slime Shore: stepping pillars

export function Pillars() {
  return (
    <>
      {PILLARS.map(([x, z, top, r], i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={[x, top / 2 - 3, z]}>
          <CylinderCollider args={[top / 2 + 3, r]} />
          <mesh material={paint(COLORS.pillar)} castShadow receiveShadow>
            <cylinderGeometry args={[r, r, top + 6, 24]} />
          </mesh>
          <mesh position={[0, top / 2 + 3 - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[r * 0.55, r * 0.8, 24]} />
            <meshStandardMaterial color="#7df9ff" emissive="#7df9ff" emissiveIntensity={0.6} />
          </mesh>
        </RigidBody>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Boulder switchbacks: ramps with heavy balls rolling down them on a timetable

const BOULDER_RADIUS = 0.9
const BOULDER_SPEED = 7
const BOULDER_INTERVAL = 2.6
const BOULDER_POOL = 3
const boulderMaterial = new THREE.MeshStandardMaterial({ color: '#2a2a35', metalness: 0.6, roughness: 0.35 })
const boulderBand = new THREE.MeshStandardMaterial({ color: '#8aa0ff', emissive: '#4455ff', emissiveIntensity: 0.4 })

type Ramp = (typeof RAMPS)[number]

// Down the ramp, across the tier to its edge, then over it and down into the slime
function boulderPath(ramp: Ramp, age: number, out: THREE.Vector3) {
  const [tx, ty, tz] = ramp.top
  const [bx, by] = ramp.bottom
  const dir = Math.sign(bx - tx)
  const rampLength = Math.hypot(bx - tx, by - ty)
  const lift = BOULDER_RADIUS / Math.cos(Math.atan2(Math.abs(ty - by), Math.abs(bx - tx)))
  const tRamp = rampLength / BOULDER_SPEED
  const tFlat = Math.abs(ramp.edgeX - bx) / BOULDER_SPEED
  if (age < tRamp) {
    const f = age / tRamp
    out.set(tx + (bx - tx) * f, ty + (by - ty) * f + lift, tz)
  } else if (age < tRamp + tFlat) {
    out.set(bx + dir * BOULDER_SPEED * (age - tRamp), by + BOULDER_RADIUS, tz)
  } else {
    const fall = age - tRamp - tFlat
    out.set(ramp.edgeX + dir * BOULDER_SPEED * fall, by + BOULDER_RADIUS - 0.5 * GRAVITY * fall * fall, tz)
  }
  return { distance: BOULDER_SPEED * age, dir }
}

function Boulder({ ramp, slot }: { ramp: Ramp; slot: number }) {
  const body = useRef<RapierRigidBody>(null)
  const pos = useMemo(() => new THREE.Vector3(), [])
  const rot = useMemo(() => new THREE.Quaternion(), [])
  useKinematic(body, (t) => {
    const { n, age } = poolRelease(t - ramp.offset, slot, BOULDER_POOL, BOULDER_INTERVAL)
    if (n < 0) return { position: HIDDEN }
    const { distance, dir } = boulderPath(ramp, age, pos)
    if (pos.y < -3) return { position: HIDDEN }
    return { position: pos, rotation: rot.setFromAxisAngle(zAxis, (-dir * distance) / BOULDER_RADIUS) }
  }, 'hazard')
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, -500, 0]}
      onCollisionEnter={knockOnHit(() => {
        sfx.knock()
        // Along the ball's travel, and a little towards the open front edge of the ramp
        const dir = Math.sign(ramp.bottom[0] - ramp.top[0])
        return { x: dir * 10, y: 5, z: 2.5 }
      })}
    >
      <BallCollider args={[BOULDER_RADIUS]} />
      <mesh material={boulderMaterial} castShadow>
        <sphereGeometry args={[BOULDER_RADIUS, 24, 18]} />
      </mesh>
      <mesh material={boulderBand} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[BOULDER_RADIUS, 0.06, 8, 32]} />
      </mesh>
      <mesh material={boulderBand}>
        <torusGeometry args={[BOULDER_RADIUS, 0.06, 8, 32]} />
      </mesh>
    </RigidBody>
  )
}

export function Switchbacks() {
  return (
    <>
      {RAMPS.map((ramp, i) => (
        <group key={i}>
          <Beam from={ramp.bottom} to={ramp.top} width={RAMP_WIDTH} top={COLORS.top} side={COLORS.trim} />
          {Array.from({ length: BOULDER_POOL }, (_, slot) => (
            <Boulder key={slot} ramp={ramp} slot={slot} />
          ))}
          {/* Boulder chute at the top of each ramp */}
          <mesh material={paint('#1f2a55')} position={[ramp.top[0] + Math.sign(ramp.top[0]) * 1.2, ramp.top[1] + 1.4, ramp.top[2]]}>
            <boxGeometry args={[1.2, 2.8, RAMP_WIDTH]} />
          </mesh>
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Cannon gallery: cannons on posts either side of a narrow bridge fire balls across it

const CANNON_PERIOD = 2.4
const SHOT_SPEED = 16
const SHOT_TIME = 1.4
const SHOT_RADIUS = 0.45
const DECK = BRIDGE.max[1]
const MUZZLE_X = 4.6

function Cannon({ z, side, offset }: (typeof CANNONS)[number]) {
  const shot = useRef<RapierRigidBody>(null)
  const barrel = useRef<THREE.Group>(null)
  const shotAge = (t: number) => (((t - offset) % CANNON_PERIOD) + CANNON_PERIOD) % CANNON_PERIOD
  useKinematic(shot, (t) => {
    const age = shotAge(t)
    if (age > SHOT_TIME) return { position: HIDDEN }
    return { position: { x: side * MUZZLE_X - side * SHOT_SPEED * age, y: DECK + 1.1, z } }
  }, 'hazard')
  // Recoil: the barrel kicks back as it fires and eases forward again
  useFrame(() => {
    const age = shotAge(raceClock())
    barrel.current!.position.x = side * (5.9 + 0.5 * Math.exp(-age * 6))
  })
  return (
    <group>
      {/* Post rising out of the slime beside the bridge */}
      <mesh material={paint(COLORS.wall)} position={[side * 6.2, (DECK - 6) / 2, z]} castShadow>
        <boxGeometry args={[1.8, DECK + 6, 1.8]} />
      </mesh>
      <mesh material={paint(COLORS.trim)} position={[side * 6.2, DECK + 0.1, z]}>
        <boxGeometry args={[2, 0.2, 2]} />
      </mesh>
      <group ref={barrel} position={[side * 5.9, DECK + 1.1, z]}>
        <mesh material={paint('#262633')} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.55, 0.65, 2.2, 20]} />
        </mesh>
        <mesh material={paint('#ffd23f')} position={[-side * 1.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.55, 0.1, 8, 20]} />
        </mesh>
      </group>
      <RigidBody
        ref={shot}
        type="kinematicPosition"
        colliders={false}
        position={[0, -500, 0]}
        onCollisionEnter={knockOnHit(() => {
          sfx.knock()
          return { x: -side * 11, y: 4, z: 0 }
        })}
      >
        <BallCollider args={[SHOT_RADIUS]} />
        <mesh material={boulderMaterial} castShadow>
          <sphereGeometry args={[SHOT_RADIUS, 16, 12]} />
        </mesh>
      </RigidBody>
    </group>
  )
}

export function CannonGallery() {
  const [x0, y0, z0] = BRIDGE.min
  const [x1, y1, z1] = BRIDGE.max
  return (
    <>
      <RigidBody type="fixed" position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]}>
        <mesh material={[paint(COLORS.trim), paint(COLORS.trim), paint('#ffe066'), paint(COLORS.trim), paint(COLORS.trim), paint(COLORS.trim)]} castShadow receiveShadow>
          <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
        </mesh>
      </RigidBody>
      {CANNONS.map((c) => (
        <Cannon key={c.z} {...c} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Bumper deck: glowing striped pillars that bounce you away. Touch is detected by position, which is
// reliable for stationary bodies (Rapier contact events proved unreliable for those in the door maze).

const BUMPER_RADIUS = 0.75
const BUMPER_HEIGHT = 2.2
const DECK_Y = TIERS.bumpers.max[1]
const bumperX = (b: (typeof BUMPERS)[number], t: number) => b.x + b.slide * Math.sin(t * 0.9 + b.z)
const STRIPES = ['#ff4fd8', '#7df9ff', '#ffe066', '#ff4fd8', '#7df9ff']

function Bumper({ bumper }: { bumper: (typeof BUMPERS)[number] }) {
  const body = useRef<RapierRigidBody>(null)
  const look = useRef<THREE.Group>(null)
  const lastHit = useRef(-10)
  const hits = useRef(new Map<number, number>()) // when it last bumped each runner (by handle)
  useKinematic(body, (t) => ({ position: { x: bumperX(bumper, t), y: DECK_Y, z: bumper.z } }), 'hazard')

  useFrame(() => {
    const t = raceClock()
    for (const runner of allRunners()) {
      const p = runner.position()
      const dx = p.x - bumperX(bumper, t)
      const dz = p.z - bumper.z
      const dist = Math.hypot(dx, dz)
      const touching = dist < BUMPER_RADIUS + 0.62 && p.y > DECK_Y && p.y < DECK_Y + BUMPER_HEIGHT + 1
      if (touching && t - (hits.current.get(runner.handle) ?? -10) > 0.4) {
        hits.current.set(runner.handle, t)
        lastHit.current = t
        withVolume(loudness(runner), sfx.knock)
        const len = dist || 1
        runner.knock({ x: (dx / len) * 11, y: 4, z: (dz / len) * 11 })
      }
    }
    // Squash-pop when it bumps someone
    const pop = Math.max(0, 1 - (t - lastHit.current) * 4)
    const s = 1 + 0.25 * pop
    look.current!.scale.set(s, 1 - 0.15 * pop, s)
  })

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[bumper.x, DECK_Y, bumper.z]}>
      <CylinderCollider args={[BUMPER_HEIGHT / 2, BUMPER_RADIUS]} position={[0, BUMPER_HEIGHT / 2, 0]} />
      <group ref={look}>
        <mesh material={paint('#f6f6ff')} position={[0, BUMPER_HEIGHT / 2, 0]} castShadow>
          <cylinderGeometry args={[BUMPER_RADIUS, BUMPER_RADIUS, BUMPER_HEIGHT, 24]} />
        </mesh>
        {STRIPES.map((c, i) => (
          <mesh key={i} position={[0, 0.25 + i * 0.42, 0]}>
            <cylinderGeometry args={[BUMPER_RADIUS + 0.03, BUMPER_RADIUS + 0.03, 0.16, 24]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.2} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  )
}

export function BumperDeck() {
  return (
    <>
      <Beam from={BUMPER_STAIRS.from} to={BUMPER_STAIRS.to} width={6} top="#ffe066" side={COLORS.trim} />
      {BUMPERS.map((b, i) => (
        <Bumper key={i} bumper={b} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Roller bridge: spinning rollers that carry you forwards or backwards

const ROLLER_LENGTH = 8
const rollerLook = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.5 })
const rollerStripe = new THREE.MeshStandardMaterial({ color: '#e08a12' })

function Roller({ roller }: { roller: (typeof ROLLERS)[number] }) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const rot = useMemo(() => new THREE.Quaternion(), [])
  // Rotating about +x by +angle moves the top surface towards +z, so surface speed = spin * radius
  const spin = roller.surfaceSpeed / ROLLER_RADIUS
  const center = { x: 0, y: roller.top - ROLLER_RADIUS, z: roller.z }
  useKinematic(body, (t) => ({ position: center, rotation: rot.setFromAxisAngle(xAxis, spin * t) }))

  useEffect(() => {
    const handle = collider.current!.handle
    surfaces.set(handle, () => ({ x: 0, z: roller.surfaceSpeed }))
    return () => {
      surfaces.delete(handle)
    }
  }, [roller])

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[center.x, center.y, center.z]}>
      {/* Frictionless: the spin moves you only via the surface-velocity push while standing on top. With
          friction, pushing into a roller's side dragged you down into the gap and pinned you there. */}
      <CylinderCollider
        ref={collider}
        args={[ROLLER_LENGTH / 2, ROLLER_RADIUS]}
        rotation={[0, 0, Math.PI / 2]}
        friction={0}
        frictionCombineRule={CoefficientCombineRule.Min}
      />
      <group rotation={[0, 0, Math.PI / 2]}>
        <mesh material={rollerLook} castShadow receiveShadow>
          <cylinderGeometry args={[ROLLER_RADIUS, ROLLER_RADIUS, ROLLER_LENGTH, 28]} />
        </mesh>
        {/* Stripes along the roller so the spin is easy to read */}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} material={rollerStripe} rotation={[0, (i * Math.PI) / 3, 0]} position={[0, 0, 0]}>
            <boxGeometry args={[ROLLER_RADIUS * 2.02, ROLLER_LENGTH + 0.02, 0.18]} />
          </mesh>
        ))}
      </group>
      {/* End hubs */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={paint(COLORS.trim)} position={[(s * ROLLER_LENGTH) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
        </mesh>
      ))}
    </RigidBody>
  )
}

export function RollerBridge() {
  return (
    <>
      {ROLLERS.map((r, i) => (
        <Roller key={i} roller={r} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Propeller summit: drones sweep chest-high blades across the path

const BLADE_REACH = 1.7
const SUMMIT_Y = TIERS.summit.max[1]
const bladeWood = new THREE.MeshStandardMaterial({ color: '#b07a4f', roughness: 0.8 })

function Drone({ drone }: { drone: (typeof DRONES)[number] }) {
  const body = useRef<RapierRigidBody>(null)
  const rot = useMemo(() => new THREE.Quaternion(), [])
  const hub = (t: number) => ({ x: drone.slide * Math.sin(t * 0.7 + drone.offset), y: SUMMIT_Y + 1.1, z: drone.z })
  useKinematic(body, (t) => ({ position: hub(t), rotation: rot.setFromAxisAngle(yAxis, drone.spin * t) }), 'hazard')

  const blades = [0, 1, 2].map((i) => (i * Math.PI * 2) / 3)
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, SUMMIT_Y + 1.1, drone.z]}
      onCollisionEnter={knockOnHit((p) => {
        sfx.knock()
        // Along the blade's direction of travel at the player's position
        const c = hub(raceClock())
        const dx = p.x - c.x
        const dz = p.z - c.z
        const len = Math.hypot(dx, dz) || 1
        const s = Math.sign(drone.spin)
        return { x: ((s * dz) / len) * 12, y: 5, z: ((-s * dx) / len) * 12 }
      })}
    >
      {blades.map((a) => (
        <group key={a} rotation={[0, a, 0]}>
          <CuboidCollider args={[BLADE_REACH / 2 + 0.1, 0.1, 0.25]} position={[BLADE_REACH / 2 + 0.3, 0, 0]} />
          <mesh material={bladeWood} position={[BLADE_REACH / 2 + 0.3, 0, 0]} rotation={[0.25, 0, 0]} castShadow>
            <boxGeometry args={[BLADE_REACH + 0.2, 0.08, 0.5]} />
          </mesh>
        </group>
      ))}
      {/* Hub, mast and the drone body hovering above */}
      <mesh material={paint('#262633')}>
        <cylinderGeometry args={[0.35, 0.35, 0.3, 16]} />
      </mesh>
      <mesh material={paint('#262633')} position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.6, 8]} />
      </mesh>
      <mesh material={paint('#3b6fd9')} position={[0, 2, 0]} castShadow>
        <sphereGeometry args={[0.65, 20, 16]} />
      </mesh>
      <mesh position={[0, 2, 0.55]}>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshStandardMaterial color="#7df9ff" emissive="#7df9ff" emissiveIntensity={1.5} />
      </mesh>
    </RigidBody>
  )
}

export function PropellerSummit() {
  return (
    <>
      {DRONES.map((d) => (
        <Drone key={d.z} drone={d} />
      ))}
    </>
  )
}
