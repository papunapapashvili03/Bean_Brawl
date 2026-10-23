import { useMemo } from 'react'
import { BallCollider, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { raceClock } from '../race/race'
import { sfx } from '../race/sound'
import { Crumble } from './Crumble'
import { box } from './shapes'
import { stoneDark } from './stone'

// A weight swinging on an arm from a pivot, about a horizontal axis: a stone hammer or a spiked iron ball.
// Getting hit throws you the way it's swinging. It falls with whatever holds it up (`fallAt`).

type Point = [number, number, number]

const iron = new THREE.MeshStandardMaterial({ color: '#4a4d57', metalness: 0.6, roughness: 0.4 })
const spikeGeometry = new THREE.ConeGeometry(0.16, 0.5, 8)
const SPIKES: Point[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0.7, 0.7, 0],
  [-0.7, -0.7, 0],
  [0, 0.7, 0.7],
  [0, -0.7, -0.7],
]
const Y = new THREE.Vector3(0, 1, 0)

export function Pendulum({
  pivot,
  axis,
  length,
  swing,
  period,
  phase,
  head,
  fallAt,
}: {
  pivot: Point
  axis: Point // unit vector the arm turns about
  length: number
  swing: number // radians either side
  period: number
  phase: number
  head: 'hammer' | 'ball'
  fallAt: number
}) {
  const w = (Math.PI * 2) / period
  const angle = (t: number) => swing * Math.sin(w * t + phase)
  const spin = useMemo(() => new THREE.Vector3(...axis), [axis])
  const size = head === 'hammer' ? 1.3 : 0.6
  // The head hangs straight down from the pivot; the arm's local frame is turned so the swing axis is its x
  const frame = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), spin), [spin])
  const rotation = useMemo(() => {
    const e = new THREE.Euler().setFromQuaternion(frame)
    return [e.x, e.y, e.z] as Point
  }, [frame])
  const turn = (t: number, out: THREE.Quaternion) => out.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle(t))
  // The arm hangs down from the pivot
  const arm = useMemo(() => new THREE.BoxGeometry(0.18, length, 0.18).translate(0, -length / 2, 0), [length])

  const knock = knockOnHit(() => {
    // Which way the head is going: the swing's speed times the axis crossed with the arm
    const t = raceClock()
    const rate = swing * w * Math.cos(w * t + phase)
    const reach = new THREE.Vector3(0, -length, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), angle(t)).applyQuaternion(frame)
    const v = new THREE.Vector3().crossVectors(spin, reach).multiplyScalar(rate)
    v.y = 0
    const speed = v.length() || 1
    const push = Math.max(8, speed * 1.3)
    sfx.knock()
    return { x: (v.x / speed) * push, y: 5, z: (v.z / speed) * push }
  })

  return (
    <Crumble
      fallAt={fallAt}
      position={pivot}
      rotation={rotation}
      geometry={arm}
      material={stoneDark}
      turn={turn}
      onCollisionEnter={knock}
      colliders={
        head === 'hammer' ? (
          <CuboidCollider args={[size / 2, size / 2, size * 0.7]} position={[0, -length, 0]} />
        ) : (
          <BallCollider args={[size]} position={[0, -length, 0]} />
        )
      }
    >
      {head === 'hammer' ? (
        <mesh geometry={box(size, size, size * 1.4)} material={stoneDark} position={[0, -length, 0]} castShadow />
      ) : (
        <group position={[0, -length, 0]}>
          <mesh material={iron} castShadow>
            <sphereGeometry args={[size, 20, 14]} />
          </mesh>
          {SPIKES.map((d, i) => {
            const dir = new THREE.Vector3(...d).normalize()
            return (
              <mesh
                key={i}
                geometry={spikeGeometry}
                material={iron}
                position={dir.clone().multiplyScalar(size + 0.18).toArray()}
                quaternion={new THREE.Quaternion().setFromUnitVectors(Y, dir)}
              />
            )
          })}
        </group>
      )}
    </Crumble>
  )
}
