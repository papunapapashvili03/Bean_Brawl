import { useMemo, useRef } from 'react'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { sfx } from '../race/sound'
import { COLORS, DECK_BUMPERS, FAN, FAN_DECK, FANS, HALF, NET_HEIGHT, TOP_1 } from './course'
import { Bumper } from './Discs'

// 3. Fan Deck: three giant pink fans turning upright across the deck, four blades each sweeping down to just
// off the deck; a blade that catches you throws you back the way you came. Foam bumpers in front, and nets
// along both sides to keep you on.

type Fan = (typeof FANS)[number]
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const BLADES = [0, 1, 2, 3].map((k) => (k * Math.PI) / 2)

function GiantFan({ fan }: { fan: Fan }) {
  const body = useRef<RapierRigidBody>(null)
  const turn = useMemo(() => new THREE.Quaternion(), [])
  const hub = { x: fan.x, y: TOP_1 + FAN.hubHeight, z: fan.z }
  useKinematic(body, (t) => ({ position: hub, rotation: turn.setFromAxisAngle(Z_AXIS, fan.offset + fan.spin * t) }), 'hazard')
  const knock = knockOnHit((p) => {
    sfx.knock()
    // (Turning about +z at w, a point at (dx, dy) from the hub goes w * (-dy, dx)): sideways with the blade,
    // and back down the course
    const vx = -fan.spin * (p.y - hub.y)
    return { x: Math.max(-8, Math.min(8, vx * 1.2)), y: 5, z: 8 }
  })
  const half = FAN.radius / 2
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[hub.x, hub.y, hub.z]} onCollisionEnter={knock}>
      {BLADES.map((a) => (
        <group key={a} rotation={[0, 0, a]}>
          <CuboidCollider args={[half - 0.2, FAN.blade / 2, FAN.thick / 2]} position={[half + 0.2, 0, 0]} />
          <mesh material={paint(COLORS.pink)} position={[half + 0.2, 0, 0]} castShadow>
            <boxGeometry args={[FAN.radius - 0.4, FAN.blade, FAN.thick]} />
          </mesh>
          {[0.45, 0.75].map((f) => (
            <mesh key={f} material={paint(COLORS.pinkLight)} position={[FAN.radius * f, 0, 0]}>
              <boxGeometry args={[0.35, FAN.blade + 0.02, FAN.thick + 0.02]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh material={paint(COLORS.pink)} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 0.8, 24]} />
      </mesh>
      <mesh material={paint('#ffffff')} position={[0, 0, 0.45]}>
        <sphereGeometry args={[0.4, 16, 12]} />
      </mesh>
    </RigidBody>
  )
}

// The yellow gantry each row of fans hangs from: posts outside the deck's edges and a beam across behind
function Gantry({ z }: { z: number }) {
  const y = TOP_1 + FAN.hubHeight
  const yellow = paint(COLORS.trim)
  return (
    <group position={[0, 0, z - 0.7]}>
      {[-1, 1].map((s) => (
        <mesh key={s} material={yellow} position={[s * (HALF + 0.6), (TOP_1 + y) / 2, 0]} castShadow>
          <boxGeometry args={[0.6, y - TOP_1 + 1, 0.6]} />
        </mesh>
      ))}
      <mesh material={yellow} position={[0, y, 0]} castShadow>
        <boxGeometry args={[WIDTH_SPAN, 0.5, 0.5]} />
      </mesh>
    </group>
  )
}
const WIDTH_SPAN = HALF * 2 + 1.8

// A netted railing along one side of the deck: posts, a top rail, the net, and a wall behind it to stop you
function NetRail({ x }: { x: number }) {
  const z0 = FAN_DECK.max[2]
  const z1 = FAN_DECK.min[2]
  const length = z0 - z1
  const net = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const g = canvas.getContext('2d')!
    g.strokeStyle = '#1b1b2f'
    g.lineWidth = 4
    g.strokeRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(length / 0.5, NET_HEIGHT / 0.5)
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  }, [length])
  const yellow = paint(COLORS.trim)
  const posts = Math.round(length / 3)
  return (
    <group position={[x, TOP_1, (z0 + z1) / 2]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.1, NET_HEIGHT / 2 + 0.3, length / 2]} position={[0, NET_HEIGHT / 2 + 0.3, 0]} />
      </RigidBody>
      <mesh material={net} position={[0, NET_HEIGHT / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[length, NET_HEIGHT]} />
      </mesh>
      <mesh material={yellow} position={[0, NET_HEIGHT, 0]} castShadow>
        <boxGeometry args={[0.3, 0.3, length]} />
      </mesh>
      {Array.from({ length: posts + 1 }, (_, k) => (
        <mesh key={k} material={yellow} position={[0, NET_HEIGHT / 2, -length / 2 + (k * length) / posts]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, NET_HEIGHT, 10]} />
        </mesh>
      ))}
    </group>
  )
}

export function FanDeck() {
  const rows = [...new Set(FANS.map((f) => f.z))]
  return (
    <group>
      {FANS.map((f, i) => (
        <GiantFan key={i} fan={f} />
      ))}
      {rows.map((z) => (
        <Gantry key={z} z={z} />
      ))}
      {DECK_BUMPERS.map((b, i) => (
        <Bumper key={i} {...b} y={TOP_1} />
      ))}
      <NetRail x={-HALF} />
      <NetRail x={HALF} />
    </group>
  )
}
