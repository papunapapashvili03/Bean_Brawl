import { useRef, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Character, type CharacterMotion } from '../game/Character'

// Your bean on a little stand, in a spotlight, wearing what's chosen in the wardrobe: swaying gently,
// turning round to show its back for something worn on the back, and hopping when it puts something on.
// Drag to turn it. With the wardrobe's tray open (`lifted`) the view draws back, so the bean stands clear
// above it. Anything passed as children sits over the stage (the name plate, the wardrobe).

export type Facing = 'front' | 'back'

const stand = new THREE.MeshStandardMaterial({ color: '#262c5e', roughness: 0.6 })
const rim = new THREE.MeshStandardMaterial({ color: '#4f56f5', emissive: '#4f56f5', emissiveIntensity: 0.6 })
const shadow = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false })

const HOP = 0.42 // seconds
const damp = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt))

// Where the camera stands: the bean filling the stage above the dock, or (lifted) the top of it, above the tray
const VIEW = { z: 6.9, y: 0.02 }
const LIFTED = { z: 8.6, y: -0.85 }

type Turn = { drag: number; dragging: boolean; x: number }

function Bean({ facing, hops, turnRef }: { facing: Facing; hops: number; turnRef: RefObject<Turn> }) {
  const group = useRef<THREE.Group>(null)
  const motion = useRef<CharacterMotion>({ vx: 0, vz: 0, grounded: true, hang: null, grabs: 0, jolt: 0, crouch: 0 })
  const state = useRef({ yaw: 0, hops, hopAt: -1 })

  useFrame(({ clock }, delta) => {
    const s = state.current
    const g = group.current!
    const t = clock.elapsedTime
    const dt = Math.min(delta, 0.1)
    if (s.hops !== hops) {
      s.hops = hops
      s.hopAt = t
    }
    // Turned to show what it's wearing, swaying a little, and wherever it's been dragged (which wears off)
    const base = facing === 'back' ? Math.PI : 0
    const sway = 0.32 * Math.sin(t * 0.7)
    s.yaw = damp(s.yaw, base + sway, 4, dt)
    const turn = turnRef.current
    if (!turn.dragging) turn.drag = damp(turn.drag, 0, 0.8, dt)
    g.rotation.y = s.yaw + turn.drag
    const u = s.hopAt >= 0 ? (t - s.hopAt) / HOP : 1
    g.position.y = u < 1 ? 0.75 * u * (1 - u) : 0
  })

  return (
    <group ref={group}>
      <Character motion={motion} />
    </group>
  )
}

function Camera({ lifted }: { lifted: boolean }) {
  useFrame(({ camera }, delta) => {
    const to = lifted ? LIFTED : VIEW
    const dt = Math.min(delta, 0.1)
    camera.position.z = damp(camera.position.z, to.z, 7, dt)
    camera.position.y = damp(camera.position.y, to.y, 7, dt)
    camera.lookAt(0, camera.position.y, 0)
  })
  return null
}

export function CharacterStage({ facing, hops, lifted, children }: { facing: Facing; hops: number; lifted: boolean; children?: ReactNode }) {
  const turn = useRef<Turn>({ drag: 0, dragging: false, x: 0 })
  const down = (e: PointerEvent<HTMLDivElement>) => {
    turn.current.dragging = true
    turn.current.x = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!turn.current.dragging) return
    turn.current.drag += (e.clientX - turn.current.x) * 0.012
    turn.current.x = e.clientX
  }
  const up = () => {
    turn.current.dragging = false
  }
  return (
    <div className="stage">
      <div className="stage-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <Canvas camera={{ position: [0, VIEW.y, VIEW.z], fov: 32 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
          <Camera lifted={lifted} />
          <ambientLight intensity={1.1} />
          <directionalLight position={[3, 5, 6]} intensity={1.8} />
          <directionalLight position={[-4, 3, -5]} intensity={1.1} color="#8b90ff" />
          <Bean facing={facing} hops={hops} turnRef={turn} />
          <mesh position={[0, -1.1, 0]} material={stand}>
            <cylinderGeometry args={[1.15, 1.25, 0.2, 48]} />
          </mesh>
          <mesh position={[0, -1.205, 0]} material={rim}>
            <cylinderGeometry args={[1.27, 1.27, 0.03, 48]} />
          </mesh>
          <mesh position={[0, -0.995, 0]} rotation={[-Math.PI / 2, 0, 0]} material={shadow}>
            <circleGeometry args={[0.62, 32]} />
          </mesh>
        </Canvas>
      </div>
      {children}
    </div>
  )
}
