import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAfterPhysicsStep } from '@react-three/rapier'
import * as THREE from 'three'
import { STEP, advanceClock, getRaceView, subscribeRace } from './race'
import { sfx } from './sound'

// Advances the match clock one fixed step at a time, after every physics step. Place inside <Physics>.
export function MatchClock() {
  useAfterPhysicsStep(() => advanceClock(STEP))
  return null
}

// Directional light whose shadow camera follows the view, for courses too long to cover with one shadow map
export function FollowSun({
  offset = [18, 32, 14],
  intensity = 2.1,
  color = '#fff4df',
  extent = 32,
}: {
  offset?: [number, number, number]
  intensity?: number
  color?: string
  extent?: number
}) {
  const light = useRef<THREE.DirectionalLight>(null)
  const [ox, oy, oz] = offset
  useFrame(({ camera }) => {
    const l = light.current!
    l.target.position.set(camera.position.x, camera.position.y - 5, camera.position.z - 10)
    l.target.updateMatrixWorld()
    l.position.set(l.target.position.x + ox, l.target.position.y + oy, l.target.position.z + oz)
  })
  return (
    <directionalLight
      ref={light}
      intensity={intensity}
      color={color}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-extent}
      shadow-camera-right={extent}
      shadow-camera-top={extent}
      shadow-camera-bottom={-extent}
      shadow-camera-far={140}
      shadow-bias={-0.0005}
    />
  )
}

// A pole with a mint pennant marking a checkpoint
export function CheckpointFlag({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 4, 8]} />
        <meshStandardMaterial color="#f4f4f4" />
      </mesh>
      <mesh position={[0.55, 3.55, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <coneGeometry args={[0.45, 1.1, 3]} />
        <meshStandardMaterial color="#7cf08a" emissive="#7cf08a" emissiveIntensity={0.35} />
      </mesh>
    </group>
  )
}

const CONFETTI = 360
const CONFETTI_COLORS = ['#ffd23f', '#7cf08a', '#3b6fd9', '#e23b4e', '#8a3fd9', '#ff8fc8']
const dummy = new THREE.Object3D()

// A burst of spinning paper from `origin` the moment the player finishes (a function: worked out then, for
// somewhere that depends where the player is)
type Point = [number, number, number]
export function Confetti({ origin, spread = 8 }: { origin: Point | (() => Point); spread?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const finished = useSyncExternalStore(subscribeRace, () => getRaceView().phase === 'finished')
  const pieces = useRef<{ p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; spin: THREE.Vector3 }[]>([])
  const at = typeof origin === 'function' ? origin : null
  const [fx, fy, fz] = typeof origin === 'function' ? [0, 0, 0] : origin

  useEffect(() => {
    if (!finished) return
    const [ox, oy, oz] = at ? at() : [fx, fy, fz]
    sfx.finish()
    pieces.current = Array.from({ length: CONFETTI }, () => ({
      p: new THREE.Vector3(ox + (Math.random() - 0.5) * spread, oy, oz),
      v: new THREE.Vector3((Math.random() - 0.5) * 9, 5 + Math.random() * 7, (Math.random() - 0.5) * 9),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    }))
    const m = mesh.current!
    const color = new THREE.Color()
    for (let i = 0; i < CONFETTI; i++) m.setColorAt(i, color.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]))
    m.instanceColor!.needsUpdate = true
  }, [finished, at, fx, fy, fz, spread])

  useFrame((_, delta) => {
    const m = mesh.current!
    m.count = pieces.current.length
    for (let i = 0; i < pieces.current.length; i++) {
      const c = pieces.current[i]
      c.v.y -= 9 * delta
      c.v.multiplyScalar(Math.exp(-0.9 * delta)) // air drag makes it flutter down
      c.p.addScaledVector(c.v, delta)
      c.r.set(c.r.x + c.spin.x * delta, c.r.y + c.spin.y * delta, c.r.z + c.spin.z * delta)
      dummy.position.copy(c.p)
      dummy.rotation.copy(c.r)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CONFETTI]} count={0} frustumCulled={false}>
      <planeGeometry args={[0.28, 0.18]} />
      <meshStandardMaterial side={THREE.DoubleSide} roughness={0.6} />
    </instancedMesh>
  )
}
