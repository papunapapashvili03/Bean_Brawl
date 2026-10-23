import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { BallCollider, ConeCollider, CuboidCollider, CylinderCollider, RigidBody, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { CarBody } from '../cars/Car'
import { buildBus } from '../cars/bus'
import { buildCaravan } from '../cars/caravan'
import { buildCityBus } from '../cars/cityBus'
import { buildFiesta } from '../cars/fiesta'
import { buildJetta } from '../cars/jetta'
import { CAR_SCALE, type CarBuild } from '../cars/kit'
import { buildMustang } from '../cars/mustang'
import { buildYugo } from '../cars/yugo'
import { knockOnHit } from '../playerContact'
import { paint } from '../race/materials'
import { sfx } from '../race/sound'
import { FRICTION } from './course'

// Everything in town that isn't bolted down: little shops and houses, buses, cars, lamp posts, trees in
// planters, benches, bins, cones, barrels, crates. All of it is loose on a slippery platform, so it slides
// about as the town tips, and slams into anyone in the way.

type Point = [number, number, number]
const SLIPPY = FRICTION
const HIT_SPEED = 1.5 // sliding faster than this, it knocks you flying

// On a collision: knocks the player the way the thing hitting them is sliding (if it's going fast enough)
function slam(body: RefObject<RapierRigidBody | null>, payload: CollisionEnterPayload) {
  const b = body.current
  if (!b) return
  const v = b.linvel()
  if (Math.hypot(v.x, v.z) < HIT_SPEED) return
  knockOnHit(() => {
    sfx.knock()
    return { x: v.x * 1.4, y: 4, z: v.z * 1.4 }
  })(payload)
}

// A loose body: sits where it's put, slides when the ground tips
function Loose({ at, yaw = 0, children, colliders }: { at: Point; yaw?: number; children: ReactNode; colliders: ReactNode }) {
  const body = useRef<RapierRigidBody>(null)
  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={at}
      rotation={[0, yaw, 0]}
      linearDamping={0.25}
      angularDamping={1.2}
      onCollisionEnter={(p) => slam(body, p)}
    >
      {colliders}
      {children}
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Buildings: candy-coloured little shops and houses with windows, a door, a striped awning and a roof edge

type Building = { at: [number, number]; w: number; d: number; h: number; color: string; awning: string; yaw?: number }
const BUILDINGS: Building[] = [
  { at: [9.5, 9.5], w: 5, d: 5, h: 6, color: '#ff8fc8', awning: '#ffffff' },
  { at: [16.5, 8], w: 4, d: 4, h: 4.5, color: '#4dd4ac', awning: '#ffd23f' },
  { at: [-9, 10], w: 4.5, d: 5, h: 7, color: '#9b7bff', awning: '#ff8fc8' },
  { at: [-17, 7.5], w: 4, d: 4, h: 4, color: '#ffd23f', awning: '#3fa9f5' },
  { at: [-10, -9.5], w: 5, d: 4.5, h: 5, color: '#3fa9f5', awning: '#ffffff' },
  { at: [-7.5, -17], w: 4, d: 4, h: 5, color: '#ff6b6b', awning: '#ffd23f' },
  { at: [9, -10], w: 4, d: 5, h: 6, color: '#b7e04a', awning: '#e23b4e' },
  { at: [15.5, -13], w: 4, d: 4, h: 4, color: '#ffa94d', awning: '#ffffff' },
]

// A wall with rows of windows and a door in the middle of the ground floor
function facade(color: string, floors: number) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  g.fillStyle = color
  g.fillRect(0, 0, size, size)
  const rows = floors
  const rowH = size / rows
  for (let r = 0; r < rows; r++) {
    const ground = r === rows - 1
    for (let c = 0; c < 3; c++) {
      if (ground && c === 1) continue
      const x = 22 + c * 76
      const y = r * rowH + rowH * 0.2
      g.fillStyle = '#ffffff'
      g.fillRect(x - 5, y - 5, 64, rowH * 0.55 + 10)
      g.fillStyle = ground ? '#9fd8ff' : '#6fb5e8'
      g.fillRect(x, y, 54, rowH * 0.55)
      g.fillStyle = 'rgba(255, 255, 255, 0.5)'
      g.fillRect(x + 6, y + 5, 10, rowH * 0.4)
    }
  }
  // The door
  g.fillStyle = '#6b4a2f'
  g.fillRect(size / 2 - 22, size - rowH * 0.85, 44, rowH * 0.85)
  g.fillStyle = '#ffd23f'
  g.fillRect(size / 2 + 12, size - rowH * 0.45, 6, 6)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
const roofLook = paint('#e9e4da')
const trimLook = paint('#ffffff')

function Shop({ b }: { b: Building }) {
  const { w, d, h } = b
  const looks = useMemo(() => {
    const wall = new THREE.MeshStandardMaterial({ map: facade(b.color, Math.max(2, Math.round(h / 2.2))), roughness: 0.8 })
    return [wall, wall, roofLook, roofLook, wall, wall]
  }, [b.color, h])
  const stripes = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 8
    const g = canvas.getContext('2d')!
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? b.awning : b.color
      g.fillRect(i * 8, 0, 8, 8)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })
  }, [b.awning, b.color])
  // The awning hangs over the front: the side facing the nearest street
  const [x, z] = b.at
  const facesX = Math.abs(x) < Math.abs(z)
  const front: Point = facesX ? [-Math.sign(x) * (w / 2 + 0.45), 1.9, 0] : [0, 1.9, -Math.sign(z) * (d / 2 + 0.45)]
  return (
    <Loose
      at={[x, h / 2 + 0.02, z]}
      yaw={b.yaw}
      colliders={<CuboidCollider args={[w / 2, h / 2, d / 2]} friction={SLIPPY} density={0.4} />}
    >
      <mesh material={looks} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh material={trimLook} position={[0, h / 2 + 0.12, 0]} castShadow>
        <boxGeometry args={[w + 0.2, 0.24, d + 0.2]} />
      </mesh>
      <mesh material={roofLook} position={[w * 0.2, h / 2 + 0.55, -d * 0.2]} castShadow>
        <boxGeometry args={[1, 0.7, 1]} />
      </mesh>
      <group position={[front[0], front[1] - h / 2, front[2]]} rotation={[0, facesX ? Math.PI / 2 : 0, 0]}>
        <mesh material={stripes} rotation={[facesX ? (x > 0 ? 0.5 : -0.5) : z > 0 ? 0.5 : -0.5, 0, 0]} castShadow>
          <boxGeometry args={[(facesX ? d : w) * 0.7, 0.06, 1]} />
        </mesh>
      </group>
    </Loose>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Vehicles, parked in the streets (their front is their +x: yaw turns it to face along the street)

type Vehicle = { build: () => CarBuild; at: [number, number]; yaw: number }
const VEHICLES: Vehicle[] = [
  { build: buildCityBus, at: [11.5, 1.8], yaw: 0 },
  { build: buildCityBus, at: [1.8, -14], yaw: Math.PI / 2 },
  { build: buildBus, at: [-12.5, 1.8], yaw: Math.PI },
  { build: buildYugo, at: [-1.8, 9], yaw: -Math.PI / 2 },
  { build: buildFiesta, at: [1.8, 15], yaw: Math.PI / 2 },
  { build: buildMustang, at: [-19, -1.8], yaw: 0 },
  { build: buildJetta, at: [20.3, -1.8], yaw: Math.PI },
  { build: buildCaravan, at: [-1.8, -19.8], yaw: -Math.PI / 2 },
]

function LooseVehicle({ v }: { v: Vehicle }) {
  const body = useRef<RapierRigidBody>(null)
  return (
    <CarBody
      ref={body}
      build={v.build}
      scale={CAR_SCALE}
      position={[v.at[0], 0.05, v.at[1]]}
      yaw={v.yaw}
      dynamic
      friction={SLIPPY}
      onCollisionEnter={(p) => slam(body, p)}
    />
  )
}

// ---------------------------------------------------------------------------------------------------------
// Street furniture

const coneLook = paint('#ff7a1a')
const white = paint('#ffffff')
const poleLook = paint('#3b4a5c')
const lampGlow = new THREE.MeshStandardMaterial({ color: '#fff4c2', emissive: '#ffe08a', emissiveIntensity: 0.7 })
const wood = paint('#9c6b3f')
const planterLook = paint('#b9b3a6')
const trunkLook = paint('#7a5433')
const leafLook = paint('#5fbf4a')
const binLook = paint('#2f9e6e')
const hydrantLook = paint('#e23b4e')

function Cone({ at }: { at: Point }) {
  return (
    <Loose at={[at[0], 0.36, at[2]]} colliders={<ConeCollider args={[0.35, 0.26]} friction={SLIPPY} density={0.6} />}>
      <mesh material={coneLook} castShadow>
        <coneGeometry args={[0.26, 0.7, 20]} />
      </mesh>
      <mesh material={white} position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.14, 0.17, 0.12, 20]} />
      </mesh>
      <mesh material={coneLook} position={[0, -0.33, 0]}>
        <boxGeometry args={[0.55, 0.05, 0.55]} />
      </mesh>
    </Loose>
  )
}

function Barrel({ at, color }: { at: Point; color: string }) {
  return (
    <Loose at={[at[0], 0.52, at[2]]} colliders={<CylinderCollider args={[0.5, 0.36]} friction={SLIPPY} density={0.8} />}>
      <mesh material={paint(color)} castShadow>
        <cylinderGeometry args={[0.36, 0.36, 1, 20]} />
      </mesh>
      {[-0.3, 0.3].map((y) => (
        <mesh key={y} material={poleLook} position={[0, y, 0]}>
          <torusGeometry args={[0.365, 0.02, 6, 24]} />
        </mesh>
      ))}
    </Loose>
  )
}

function Bench({ at, yaw }: { at: Point; yaw: number }) {
  return (
    <Loose at={[at[0], 0.3, at[2]]} yaw={yaw} colliders={<CuboidCollider args={[0.85, 0.28, 0.3]} friction={SLIPPY} density={0.6} />}>
      {[-0.12, 0.08].map((z) => (
        <mesh key={z} material={wood} position={[0, 0.12, z]} castShadow>
          <boxGeometry args={[1.7, 0.06, 0.16]} />
        </mesh>
      ))}
      <mesh material={wood} position={[0, 0.4, 0.24]} rotation={[-0.2, 0, 0]} castShadow>
        <boxGeometry args={[1.7, 0.3, 0.06]} />
      </mesh>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} material={poleLook} position={[x, -0.1, 0]}>
          <boxGeometry args={[0.08, 0.4, 0.5]} />
        </mesh>
      ))}
    </Loose>
  )
}

function Bin({ at }: { at: Point }) {
  return (
    <Loose at={[at[0], 0.46, at[2]]} colliders={<CylinderCollider args={[0.45, 0.3]} friction={SLIPPY} density={0.6} />}>
      <mesh material={binLook} castShadow>
        <cylinderGeometry args={[0.3, 0.26, 0.9, 16]} />
      </mesh>
      <mesh material={poleLook} position={[0, 0.47, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.06, 16]} />
      </mesh>
    </Loose>
  )
}

// A lamp post on a heavy round foot, so it slides rather than toppling
function Lamp({ at }: { at: Point }) {
  return (
    <Loose
      at={[at[0], 0.15, at[2]]}
      colliders={
        <>
          <CylinderCollider args={[0.14, 0.4]} friction={SLIPPY} density={12} />
          <CylinderCollider args={[1.8, 0.08]} position={[0, 1.95, 0]} friction={SLIPPY} density={0.2} />
        </>
      }
    >
      <mesh material={poleLook} castShadow>
        <cylinderGeometry args={[0.36, 0.4, 0.28, 20]} />
      </mesh>
      <mesh material={poleLook} position={[0, 1.95, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 3.6, 10]} />
      </mesh>
      <mesh material={poleLook} position={[0.3, 3.7, 0]}>
        <boxGeometry args={[0.7, 0.07, 0.07]} />
      </mesh>
      <mesh material={lampGlow} position={[0.6, 3.6, 0]}>
        <sphereGeometry args={[0.2, 16, 12]} />
      </mesh>
    </Loose>
  )
}

function Tree({ at }: { at: Point }) {
  return (
    <Loose
      at={[at[0], 0.32, at[2]]}
      colliders={
        <>
          <CuboidCollider args={[0.6, 0.3, 0.6]} friction={SLIPPY} density={4} />
          <BallCollider args={[0.9]} position={[0, 2.1, 0]} friction={SLIPPY} density={0.05} />
        </>
      }
    >
      <mesh material={planterLook} castShadow>
        <boxGeometry args={[1.2, 0.6, 1.2]} />
      </mesh>
      <mesh material={trunkLook} position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 1.4, 8]} />
      </mesh>
      <mesh material={leafLook} position={[0, 2.1, 0]} castShadow>
        <icosahedronGeometry args={[0.95, 1]} />
      </mesh>
    </Loose>
  )
}

function Crate({ at }: { at: Point }) {
  return (
    <Loose at={[at[0], 0.46, at[2]]} yaw={at[0] * 0.7} colliders={<CuboidCollider args={[0.45, 0.45, 0.45]} friction={SLIPPY} density={0.5} />}>
      <mesh material={wood} castShadow>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={trunkLook} position={[0, 0, s * 0.455]} rotation={[0, 0, s * 0.78]}>
          <boxGeometry args={[1.2, 0.1, 0.02]} />
        </mesh>
      ))}
    </Loose>
  )
}

function Hydrant({ at }: { at: Point }) {
  return (
    <Loose at={[at[0], 0.36, at[2]]} colliders={<CylinderCollider args={[0.35, 0.16]} friction={SLIPPY} density={3} />}>
      <mesh material={hydrantLook} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.7, 12]} />
      </mesh>
      <mesh material={hydrantLook} position={[0, 0.38, 0]}>
        <sphereGeometry args={[0.15, 12, 8]} />
      </mesh>
      <mesh material={hydrantLook} position={[0, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.45, 8]} />
      </mesh>
    </Loose>
  )
}

const P = (x: number, z: number): Point => [x, 0, z]
const CONES = [P(6.9, 1.2), P(6.9, 2.5), P(-1.2, -6.9), P(-2.5, -6.9), P(1.2, 21.5), P(-1.2, 21.5), P(21.5, 1.2), P(-21.5, -1.2)]
const BARRELS: [Point, string][] = [
  [P(18, 12.5), '#e23b4e'],
  [P(-12, 17), '#3fa9f5'],
  [P(-18, -12), '#e23b4e'],
  [P(12, -18), '#3fa9f5'],
  [P(-13.5, 13), '#ffd23f'],
  [P(13, 15), '#e23b4e'],
]
const LAMPS = [P(6, 6), P(-6, 6), P(-6, -6), P(6, -6), P(13, 4.6), P(-13, -4.6)]
const TREES = [P(20.2, 5.8), P(-20.2, -5.8), P(-5.8, 20.2), P(5.8, -20.2)]
const BENCHES: [Point, number][] = [
  [P(10.5, 4.4), 0],
  [P(-10.5, -4.4), Math.PI],
  [P(4.4, -10.5), Math.PI / 2],
  [P(-4.4, 10.5), -Math.PI / 2],
]
const BINS = [P(8, 4.5), P(-8, -4.5), P(4.5, 8.5), P(-4.5, -8.5)]
const CRATES = [P(11, 15.5), P(-14.5, 12.8), P(-14, -14.5), P(7, -17)]
const HYDRANTS = [P(5.3, 13), P(-5.3, -13)]

export function Props() {
  return (
    <group>
      {BUILDINGS.map((b, i) => (
        <Shop key={i} b={b} />
      ))}
      {VEHICLES.map((v, i) => (
        <LooseVehicle key={i} v={v} />
      ))}
      {CONES.map((p, i) => (
        <Cone key={i} at={p} />
      ))}
      {BARRELS.map(([p, c], i) => (
        <Barrel key={i} at={p} color={c} />
      ))}
      {LAMPS.map((p, i) => (
        <Lamp key={i} at={p} />
      ))}
      {TREES.map((p, i) => (
        <Tree key={i} at={p} />
      ))}
      {BENCHES.map(([p, yaw], i) => (
        <Bench key={i} at={p} yaw={yaw} />
      ))}
      {BINS.map((p, i) => (
        <Bin key={i} at={p} />
      ))}
      {CRATES.map((p, i) => (
        <Crate key={i} at={p} />
      ))}
      {HYDRANTS.map((p, i) => (
        <Hydrant key={i} at={p} />
      ))}
    </group>
  )
}
