import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { CASCADE, COINS, WIDTH, laneX } from './course'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { Slab } from '../race/parts'
import { raceClock } from '../race/race'
import { sfx } from '../race/sound'

const { lanes: LANES, laneWidth: LANE_WIDTH, wave: WAVE_SECONDS, speed: ROLL_SPEED, radius: RADIUS, thickness: THICKNESS, gaps: GAP_PATTERN } = COINS

const SLOPE_LENGTH = Math.hypot(CASCADE.z0 - CASCADE.z1, CASCADE.y1 - CASCADE.y0)
const TRAVEL_SECONDS = SLOPE_LENGTH / ROLL_SPEED
// Enough pooled coins per lane to cover every wave on the slope at once
const SLOTS = Math.ceil(TRAVEL_SECONDS / WAVE_SECONDS) + 1

const DOWNHILL = new THREE.Vector3(0, -Math.sin(CASCADE.angle), Math.cos(CASCADE.angle))
const NORMAL = new THREE.Vector3(0, Math.cos(CASCADE.angle), Math.sin(CASCADE.angle))
const HIDDEN_Y = -500

// Which wave a pooled coin slot is currently showing, and how long ago that wave was released
function slotWave(t: number, slot: number) {
  const wave = slot + SLOTS * Math.floor((t - slot * WAVE_SECONDS) / (SLOTS * WAVE_SECONDS))
  return { wave, age: t - wave * WAVE_SECONDS }
}
function isRolling(t: number, slot: number, lane: number) {
  const { wave, age } = slotWave(t, slot)
  return wave >= 0 && age <= TRAVEL_SECONDS && GAP_PATTERN[wave % GAP_PATTERN.length] !== lane
}

const xAxis = new THREE.Vector3(1, 0, 0)
const coinGold = new THREE.MeshStandardMaterial({ color: '#ffc83d', metalness: 0.55, roughness: 0.35 })
const coinDeep = new THREE.MeshStandardMaterial({ color: '#f0a412', metalness: 0.55, roughness: 0.4 })

export function CoinMesh({ radius, thickness }: { radius: number; thickness: number }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh material={coinGold} castShadow>
        <cylinderGeometry args={[radius, radius, thickness, 40]} />
      </mesh>
      {[1, -1].map((s) => (
        <group key={s} position={[0, (s * thickness) / 2, 0]}>
          <mesh material={coinDeep} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius * 0.82, radius * 0.06, 8, 36]} />
          </mesh>
          <mesh material={coinDeep} position={[0, s * 0.02, 0]}>
            <cylinderGeometry args={[radius * 0.45, radius * 0.45, 0.06, 5]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Coin({ slot, lane }: { slot: number; lane: number }) {
  const body = useRef<RapierRigidBody>(null)
  const look = useRef<THREE.Group>(null)
  const pos = useMemo(() => new THREE.Vector3(), [])
  const rot = useMemo(() => new THREE.Quaternion(), [])

  useKinematic(body, (t) => {
    if (!isRolling(t, slot, lane)) return { position: { x: laneX(lane), y: HIDDEN_Y, z: CASCADE.z1 } }
    const distance = slotWave(t, slot).age * ROLL_SPEED
    pos
      .set(laneX(lane), CASCADE.y1, CASCADE.z1)
      .addScaledVector(DOWNHILL, distance)
      .addScaledVector(NORMAL, RADIUS)
    return { position: pos, rotation: rot.setFromAxisAngle(xAxis, distance / RADIUS) }
  }, 'hazard')

  // Pop in at the top. Also hides the one interpolated frame when a coin jumps between the pool and the slope.
  useFrame(() => {
    const t = raceClock()
    const rolling = isRolling(t, slot, lane)
    const grow = rolling ? Math.min(1, slotWave(t, slot).age / 0.25) : 0
    look.current!.scale.setScalar(Math.max(grow, 0.0001))
  })

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[laneX(lane), HIDDEN_Y, CASCADE.z1]}
      onCollisionEnter={knockOnHit(() => {
        sfx.knock()
        return { x: 0, y: 4.5, z: 11 } // back down the slope
      })}
    >
      <CylinderCollider args={[THICKNESS / 2, RADIUS]} rotation={[0, 0, Math.PI / 2]} />
      <group ref={look}>
        <CoinMesh radius={RADIUS} thickness={THICKNESS} />
      </group>
    </RigidBody>
  )
}

function laneTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 64
  const g = canvas.getContext('2d')!
  for (let i = 0; i < LANES; i++) {
    g.fillStyle = i % 2 ? '#ffe27a' : '#fff1b8'
    g.fillRect(i * 64, 0, 64, 64)
    g.fillStyle = '#ffffff'
    g.fillRect(i * 64, 0, 3, 64)
  }
  // Uphill chevron in each lane
  g.strokeStyle = 'rgba(240, 164, 18, 0.55)'
  g.lineWidth = 6
  for (let i = 0; i < LANES; i++) {
    g.beginPath()
    g.moveTo(i * 64 + 18, 40)
    g.lineTo(i * 64 + 32, 24)
    g.lineTo(i * 64 + 46, 40)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

export function CoinCascade() {
  const slopeMaterial = useMemo(() => {
    const map = laneTexture()
    map.repeat.set(1, SLOPE_LENGTH / 4)
    return new THREE.MeshStandardMaterial({ map, roughness: 0.8 })
  }, [])

  const coins = []
  for (let slot = 0; slot < SLOTS; slot++) {
    for (let lane = 0; lane < LANES; lane++) coins.push(<Coin key={`${slot}-${lane}`} slot={slot} lane={lane} />)
  }

  const post = paint('#ffd23f')
  const half = WIDTH / 2 + 0.8
  return (
    <group>
      <Slab
        z0={CASCADE.z0}
        y0={CASCADE.y0}
        z1={CASCADE.z1}
        y1={CASCADE.y1}
        width={LANES * LANE_WIDTH + 2}
        side="#f0a412"
        topMaterial={slopeMaterial}
      />
      {coins}
      {/* Coin slot at the bottom that the coins drop into */}
      <mesh material={paint('#2b2140')} position={[0, CASCADE.y0 + 0.03, CASCADE.z0 - 0.6]}>
        <boxGeometry args={[LANES * LANE_WIDTH, 0.06, 0.9]} />
      </mesh>
      {/* Release arch at the top, high enough to run under */}
      <group position={[0, CASCADE.y1, CASCADE.z1 - 0.6]}>
        {[-half, half].map((x) => (
          <mesh key={x} material={post} position={[x, 3.5, 0]} castShadow>
            <boxGeometry args={[0.8, 7, 0.8]} />
          </mesh>
        ))}
        <mesh material={post} position={[0, 7.2, 0]} castShadow>
          <boxGeometry args={[half * 2 + 0.8, 0.9, 0.9]} />
        </mesh>
        <group position={[0, 8.9, 0]} rotation={[0, Math.PI / 2, 0]}>
          <CoinMesh radius={1.3} thickness={0.5} />
        </group>
      </group>
    </group>
  )
}
