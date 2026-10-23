import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { allRunners, loudness, type Contactable } from '../playerContact'
import { MAZE, TOP_Y, WIDTH } from './course'
import { Slab } from '../race/parts'
import { playerPosition } from '../race/race'
import { sfx, withVolume } from '../race/sound'

const DOOR_HEIGHT = 4
const WALL_HEIGHT = 5.4
const WALL_THICKNESS = 0.8
const OPEN_ANGLE = 1.75
const FADED_OPACITY = 0.2

// Each wall gets its own materials so it can fade on its own when it blocks the camera
type WallLook = Record<'wall' | 'steel' | 'steelDark' | 'brass', THREE.MeshStandardMaterial>
const wallLooks: WallLook[] = MAZE.walls.map(() => {
  const m = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
  return { wall: m('#8a5cf6'), steel: m('#a9b6c6'), steelDark: m('#6f7d8f'), brass: m('#ffd23f') }
})

// Every door looks identical, so the only way to find the real ones is to try them
function VaultDoorPanel({ look }: { look: WallLook }) {
  const w = MAZE.doorWidth - 0.1
  return (
    <group position={[w / 2, DOOR_HEIGHT / 2, 0]}>
      <mesh material={look.steel} castShadow receiveShadow>
        <boxGeometry args={[w, DOOR_HEIGHT - 0.1, 0.35]} />
      </mesh>
      <group position={[0, 0.1, 0.2]}>
        <mesh material={look.steelDark}>
          <torusGeometry args={[0.62, 0.08, 10, 32]} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} material={look.steelDark} rotation={[0, 0, (i * Math.PI) / 3]}>
            <boxGeometry args={[1.24, 0.09, 0.09]} />
          </mesh>
        ))}
        <mesh material={look.brass} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.15, 16]} />
        </mesh>
      </group>
      {/* Bolts around the edge */}
      {[-1, 1].flatMap((sx) =>
        [-1, 0, 1].map((sy) => (
          <mesh key={`${sx}${sy}`} material={look.brass} position={[sx * (w / 2 - 0.25), sy * 1.6, 0.19]}>
            <sphereGeometry args={[0.09, 8, 8]} />
          </mesh>
        )),
      )}
      {/* Hinges on the left edge */}
      {[-1.2, 1.2].map((y) => (
        <mesh key={y} material={look.steelDark} position={[-w / 2 + 0.05, y, 0.2]}>
          <boxGeometry args={[0.3, 0.45, 0.12]} />
        </mesh>
      ))}
    </group>
  )
}

// A runner (the player or a bot) pressed against the door face: within the doorway's width, standing on the
// floor, and no more than a few centimetres from the panel (capsule radius 0.5 + panel half-depth 0.2)
function whoTouches(x: number, z: number): Contactable | null {
  for (const runner of allRunners()) {
    const p = runner.position()
    if (Math.abs(p.x - x) < MAZE.doorWidth / 2 && p.y < TOP_Y + 2 && p.z > z && p.z - z < 0.78) return runner
  }
  return null
}

function Door({ x, z, real, look }: { x: number; z: number; real: boolean; look: WallLook }) {
  const [open, setOpen] = useState(false)
  const hinge = useRef<THREE.Group>(null)
  const rattle = useRef(0)
  const touching = useRef(false)

  useFrame((state, delta) => {
    // Touch detection by position rather than contact events: deterministic, and exactly "pressed against it"
    const who = open ? null : whoTouches(x, z)
    if (who && !touching.current) {
      if (real) {
        withVolume(loudness(who), sfx.doorOpen)
        setOpen(true) // stays open for the rest of the match
      } else {
        withVolume(loudness(who), sfx.doorLocked)
        rattle.current = 1
      }
    }
    touching.current = !!who

    const h = hinge.current!
    h.rotation.y = THREE.MathUtils.lerp(h.rotation.y, open ? OPEN_ANGLE : 0, 1 - Math.exp(-6 * delta))
    rattle.current = Math.max(0, rattle.current - delta * 3)
    h.position.x = x - MAZE.doorWidth / 2 + Math.sin(state.clock.elapsedTime * 70) * 0.05 * rattle.current
  })

  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[x, TOP_Y, z]}>
        {!open && <CuboidCollider args={[MAZE.doorWidth / 2, DOOR_HEIGHT / 2, 0.2]} position={[0, DOOR_HEIGHT / 2, 0]} />}
      </RigidBody>
      {/* The panel swings on a hinge at its left edge, away from the runner */}
      <group ref={hinge} position={[x - MAZE.doorWidth / 2, TOP_Y, z]}>
        <VaultDoorPanel look={look} />
      </group>
    </>
  )
}

// The walls are 9 m apart and the camera trails the player by 9 m, so a wall you've just passed
// ends up between the camera and you. Fade it out while it's in the way.
function useFadeWhenBlocking(z: number, look: WallLook) {
  useFrame(({ camera }, delta) => {
    const blocking = camera.position.z > z - 0.5 && playerPosition.z < z - 0.5
    const materials = Object.values(look)
    const target = blocking ? FADED_OPACITY : 1
    for (const m of materials) {
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

function Wall({ z, openDoors, look }: { z: number; openDoors: number[]; look: WallLook }) {
  useFadeWhenBlocking(z, look)
  // Solid pillars between and outside the five doorways, plus a lintel above them
  const edges = [-WIDTH / 2, ...MAZE.doorXs.flatMap((x) => [x - MAZE.doorWidth / 2, x + MAZE.doorWidth / 2]), WIDTH / 2]
  const pillars: [number, number][] = []
  for (let i = 0; i < edges.length; i += 2) pillars.push([edges[i], edges[i + 1]])
  return (
    <group>
      {pillars.map(([a, b]) => (
        <RigidBody key={a} type="fixed" position={[(a + b) / 2, TOP_Y + WALL_HEIGHT / 2, z]}>
          <mesh material={look.wall} castShadow receiveShadow>
            <boxGeometry args={[b - a, WALL_HEIGHT, WALL_THICKNESS]} />
          </mesh>
        </RigidBody>
      ))}
      <RigidBody type="fixed" position={[0, TOP_Y + (DOOR_HEIGHT + WALL_HEIGHT) / 2, z]}>
        <mesh material={look.wall} castShadow>
          <boxGeometry args={[WIDTH, WALL_HEIGHT - DOOR_HEIGHT, WALL_THICKNESS]} />
        </mesh>
      </RigidBody>
      {/* Gold trim along the top */}
      <mesh material={look.brass} position={[0, TOP_Y + WALL_HEIGHT + 0.12, z]}>
        <boxGeometry args={[WIDTH + 0.2, 0.25, WALL_THICKNESS + 0.2]} />
      </mesh>
      {MAZE.doorXs.map((x, i) => (
        <Door key={x} x={x} z={z + WALL_THICKNESS / 2 + 0.2} real={openDoors.includes(i)} look={look} />
      ))}
    </group>
  )
}

export function DoorMaze({ layout }: { layout: number[][] }) {
  return (
    <group>
      <Slab z0={MAZE.z0} y0={TOP_Y} z1={MAZE.z1} y1={TOP_Y} top="#ffb3e0" />
      {MAZE.walls.map((z, i) => (
        <Wall key={z} z={z} openDoors={layout[i]} look={wallLooks[i]} />
      ))}
    </group>
  )
}
