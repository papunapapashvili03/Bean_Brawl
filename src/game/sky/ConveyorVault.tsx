import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { TOP_Y, VAULT, WIDTH } from './course'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { Slab } from '../race/parts'
import { playerPosition, raceClock, surfaces } from '../race/race'
import { sfx } from '../race/sound'

const BELTS = 4
const BELT_DEPTH = 7
const ISLAND_DEPTH = 2.5
const ENTRY_DEPTH = 2.25
const BELT_SPEED = 3.5
const SWITCH_SECONDS = 3
const WARNING_SECONDS = 0.5
const PUSHER_REACH = 7

const beltZ = (i: number) => VAULT.z0 - ENTRY_DEPTH - i * (BELT_DEPTH + ISLAND_DEPTH) - BELT_DEPTH / 2
// Neighbouring belts run opposite ways, and every belt flips every 3 s
const beltDirection = (i: number, t: number) =>
  (i % 2 ? -1 : 1) * (Math.floor(t / SWITCH_SECONDS) % 2 ? -1 : 1)
const isWarning = (t: number) => t % SWITCH_SECONDS > SWITCH_SECONDS - WARNING_SECONDS

// Pusher cycle: slide in, hold, slide out, rest. Offset per belt so they don't all fire together.
function pusherExtension(t: number, i: number) {
  const p = ((t + i * 0.8) % 3) / 3
  const ease = (x: number) => x * x * (3 - 2 * x)
  if (p < 0.2) return ease(p / 0.2)
  if (p < 0.4) return 1
  if (p < 0.6) return 1 - ease((p - 0.4) / 0.2)
  return 0
}

function chevronTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const g = canvas.getContext('2d')!
  g.fillStyle = '#3d3a4f'
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = '#ffd23f'
  g.lineWidth = 16
  g.lineJoin = 'miter'
  g.beginPath()
  g.moveTo(34, 18)
  g.lineTo(84, 64)
  g.lineTo(34, 110)
  g.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

const TILE = 3.5 // metres per chevron along the belt

// One animated surface per belt (each scrolls on its own), created once for the level
const beltSurfaces = Array.from({ length: BELTS }, () => {
  const tex = chevronTexture()
  tex.repeat.set(WIDTH / TILE, BELT_DEPTH / TILE)
  return { tex, top: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }) }
})

function Belt({ index }: { index: number }) {
  const collider = useRef<RapierCollider>(null)
  const z = beltZ(index)
  const { top, tex } = beltSurfaces[index]
  const side = paint('#2b2140')

  // Riding the belt: the player adds this velocity while standing on it
  useEffect(() => {
    const handle = collider.current!.handle
    surfaces.set(handle, () => ({ x: beltDirection(index, raceClock()) * BELT_SPEED, z: 0 }))
    return () => {
      surfaces.delete(handle)
    }
  }, [index])

  useFrame((state, delta) => {
    const t = raceClock()
    const dir = beltDirection(index, t)
    // Mirroring the texture flips the chevrons; scrolling the offset moves them with the belt
    tex.repeat.x = (dir * WIDTH) / TILE
    tex.offset.x -= (delta * BELT_SPEED) / TILE
    const flash = isWarning(t) && Math.sin(state.clock.elapsedTime * 30) > 0
    top.color.set(flash ? '#ffcf7a' : '#ffffff')
  })

  const materials = [side, side, top, side, side, side]
  return (
    // A hair below the islands so their overlapping edges don't z-fight
    <RigidBody type="fixed" colliders={false} position={[0, TOP_Y - 0.51, z]} friction={1}>
      <CuboidCollider ref={collider} args={[WIDTH / 2, 0.5, BELT_DEPTH / 2]} />
      <mesh material={materials} receiveShadow>
        <boxGeometry args={[WIDTH, 1, BELT_DEPTH]} />
      </mesh>
    </RigidBody>
  )
}

function Pusher({ index }: { index: number }) {
  const body = useRef<RapierRigidBody>(null)
  const side = index % 2 ? 1 : -1
  const z = beltZ(index)
  const x = (t: number) => side * (WIDTH / 2 + 1.6 - PUSHER_REACH * pusherExtension(t, index))
  useKinematic(body, (t) => ({ position: { x: x(t), y: TOP_Y + 0.75, z } }), 'hazard')
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[x(0), TOP_Y + 0.75, z]}
      onCollisionEnter={knockOnHit(() => {
        sfx.knock()
        return { x: -side * 10, y: 3.5, z: 0 }
      })}
    >
      <CuboidCollider args={[1.4, 0.75, 1.3]} />
      <mesh material={paint('#e23b4e')} castShadow>
        <boxGeometry args={[2.8, 1.5, 2.6]} />
      </mesh>
      {/* Bumper face */}
      <mesh material={paint('#ffd23f')} position={[-side * 1.45, 0, 0]}>
        <boxGeometry args={[0.12, 1.1, 2.2]} />
      </mesh>
    </RigidBody>
  )
}

// Lamps at both ends of each belt: dim mint normally, flashing amber 0.5 s before the belts switch
const lamp = new THREE.MeshStandardMaterial({ color: '#7cf08a', emissive: '#7cf08a', emissiveIntensity: 0.4 })

function WarningLamps() {
  const lastWarning = useRef(-1)
  useFrame((state) => {
    const t = raceClock()
    const warning = isWarning(t)
    const on = warning && Math.sin(state.clock.elapsedTime * 30) > 0
    lamp.color.set(warning ? '#ffb000' : '#7cf08a')
    lamp.emissive.set(warning ? '#ffb000' : '#7cf08a')
    lamp.emissiveIntensity = warning ? (on ? 2.2 : 0.6) : 0.4
    // Beep once per switch, only when the player is near the vault
    const switchIndex = Math.floor((t + WARNING_SECONDS) / SWITCH_SECONDS)
    const z = playerPosition.z
    if (warning && switchIndex !== lastWarning.current) {
      lastWarning.current = switchIndex
      if (z < VAULT.z0 + 12 && z > VAULT.z1 - 5) sfx.beltWarning()
    }
  })
  const posts = []
  for (let i = 0; i < BELTS; i++) {
    for (const x of [-(WIDTH / 2 + 0.5), WIDTH / 2 + 0.5]) {
      posts.push(
        <group key={`${i}${x}`} position={[x, TOP_Y, beltZ(i) + (x > 0 ? 2.5 : -2.5)]}>
          <mesh material={paint('#2b2140')} position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.12, 0.16, 2.2, 8]} />
          </mesh>
          <mesh material={lamp} position={[0, 2.35, 0]}>
            <sphereGeometry args={[0.32, 16, 12]} />
          </mesh>
        </group>,
      )
    }
  }
  return <group>{posts}</group>
}

export function ConveyorVault() {
  const segments = []
  // Entry pad, then belt / island / belt ... / belt, then exit pad
  const entryEnd = VAULT.z0 - ENTRY_DEPTH
  segments.push(<Slab key="entry" z0={VAULT.z0} y0={TOP_Y} z1={entryEnd} y1={TOP_Y} top="#ffb3e0" />)
  for (let i = 0; i < BELTS - 1; i++) {
    const z0 = beltZ(i) - BELT_DEPTH / 2
    segments.push(
      <Slab key={`island${i}`} z0={z0} y0={TOP_Y} z1={z0 - ISLAND_DEPTH} y1={TOP_Y} top="#7cf08a" side="#1f7a4a" />,
    )
  }
  const exitStart = beltZ(BELTS - 1) - BELT_DEPTH / 2
  segments.push(<Slab key="exit" z0={exitStart} y0={TOP_Y} z1={VAULT.z1} y1={TOP_Y} top="#ffb3e0" />)

  return (
    <group>
      {segments}
      {Array.from({ length: BELTS }, (_, i) => (
        <group key={i}>
          <Belt index={i} />
          <Pusher index={i} />
        </group>
      ))}
      <WarningLamps />
    </group>
  )
}
