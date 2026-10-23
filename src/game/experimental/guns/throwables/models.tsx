import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { toon } from '../../../toon'
import { addPuff } from '../fx'
import { Part } from '../Part'
import { shapeGeometry, thinOutline, type Shape } from '../parts'
import type { Live } from './catalog'

// The throwables, each standing upright in its own space (top towards +y), centred on its middle, at a
// chunky toy-like size like the guns so the character's mitten can hold them. Given `live`, a model shows
// what's happening to it (the pin pulled, the spoon gone, alight); without, it's as it comes (on display).

type V3 = [number, number, number]
const HALF_PI = Math.PI / 2
const STEEL = '#c3c7cf'
const glow = (color: string) => new THREE.MeshBasicMaterial({ color, toneMapped: false })
const SPARK_CORE = glow('#fff6c8')
const SPARK_RAYS = glow('#ffb03a')
const FLAME_OUTER = glow('#ff8a2a')
const FLAME_INNER = glow('#ffe066')
const spot = new THREE.Vector3()

// A ring on its pin and the spoon (lever) down the side: the ring goes once the pin's pulled, the spoon
// flies off as the grenade leaves the hand
function useFuseParts(live?: Live) {
  const ring = useRef<THREE.Group>(null)
  const spoon = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!live) return
    ring.current!.visible = !live.armed
    spoon.current!.visible = !live.spent
  })
  return { ring, spoon }
}

// ---------------------------------------------------------------------------------------------------------
// Frag grenade, pineapple-style: an olive egg with grooves round and over it, the fuse on top, the spoon
// down one side and the pull ring on the other

const OLIVE = '#56652f'
const OLIVE_DARK = '#3b4620'
const EGG = { r: 0.085, stretch: 1.1 }
const eggRadiusAt = (y: number) => EGG.r * Math.sqrt(1 - (y / (EGG.r * EGG.stretch)) ** 2)

export function Grenade({ live }: { live?: Live }) {
  const { ring, spoon } = useFuseParts(live)
  return (
    <group>
      <Part shape={{ sphere: EGG.r }} color={OLIVE} scale={[1, EGG.stretch, 1]} />
      {[-0.05, 0, 0.05].map((y) => (
        <Part key={y} shape={{ ring: [eggRadiusAt(y) + 0.001, 0.0055] }} color={OLIVE_DARK} at={[0, y, 0]} rot={[HALF_PI, 0, 0]} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Part key={i} shape={{ ring: [EGG.r + 0.001, 0.0055] }} color={OLIVE_DARK} rot={[0, (i * Math.PI) / 4, 0]} scale={[1, EGG.stretch, 1]} />
      ))}
      {/* Neck and fuse head */}
      <Part shape={{ post: [0.032, 0.03] }} color={OLIVE_DARK} at={[0, 0.098, 0]} />
      <Part shape={{ post: [0.026, 0.045] }} color="#8d939c" at={[0, 0.13, 0]} />
      <group ref={spoon}>
        <Part shape={{ box: [0.07, 0.01, 0.026] }} color={STEEL} at={[0.04, 0.155, 0]} />
        <Part shape={{ box: [0.01, 0.12, 0.022] }} color={STEEL} at={[0.078, 0.09, 0]} rot={[0, 0, 0.12]} />
      </group>
      <group ref={ring}>
        <Part shape={{ rod: [0.004, 0.04] }} color={STEEL} at={[-0.025, 0.14, 0]} />
        <Part shape={{ ring: [0.022, 0.004] }} color={STEEL} at={[-0.066, 0.135, 0]} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Dynamite: three red paper sticks taped together, a fuse curling out of the top. Lit, it burns down
// towards the sticks, spitting sparks at its tip.

const PAPER = '#c9362f'
const PAPER_END = '#e3d2ad'
const TAPE = '#26272b'
const CORD = '#4a3b2c'
const STICK = { r: 0.034, length: 0.3 }
const STICKS: [number, number][] = [
  [-0.035, -0.02],
  [0.035, -0.02],
  [0, 0.041],
]
const FUSE_PATH = [
  new THREE.Vector3(0, 0.148, 0.041),
  new THREE.Vector3(0.004, 0.19, 0.05),
  new THREE.Vector3(0.03, 0.228, 0.04),
  new THREE.Vector3(0.066, 0.244, 0.014),
]
const FUSE_SEGMENTS = 24
const FUSE_SIDES = 6
const fuseMaterial = toon(CORD)

export function Dynamite({ live }: { live?: Live }) {
  // Each dynamite has its own fuse, drawn shorter as it burns
  const { curve, fuse } = useMemo(() => {
    const path = new THREE.CatmullRomCurve3(FUSE_PATH)
    return { curve: path, fuse: new THREE.TubeGeometry(path, FUSE_SEGMENTS, 0.0065, FUSE_SIDES, false) }
  }, [])
  useEffect(() => () => fuse.dispose(), [fuse])
  const spark = useRef<THREE.Group>(null)
  const nextSpark = useRef(0)
  useFrame((_, dt) => {
    const burn = live ? live.burn : 1
    fuse.setDrawRange(0, Math.max(1, Math.round(burn * FUSE_SEGMENTS)) * FUSE_SIDES * 6)
    const lit = !!live?.lit && burn > 0
    const s = spark.current!
    s.visible = lit
    if (!lit) return
    curve.getPoint(burn, s.position)
    s.scale.setScalar(0.7 + Math.random() * 0.6)
    s.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0)
    nextSpark.current -= dt
    if (nextSpark.current <= 0) {
      nextSpark.current = 0.035
      s.getWorldPosition(spot)
      const drift = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(1.6)
      addPuff(spot, 'spark', 0.025 + Math.random() * 0.02, drift)
    }
  })
  return (
    <group>
      {STICKS.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Part shape={{ post: [STICK.r, STICK.length] }} color={PAPER} />
          <Part shape={{ post: [STICK.r - 0.004, 0.006] }} color={PAPER_END} at={[0, STICK.length / 2 + 0.002, 0]} />
          <Part shape={{ post: [STICK.r - 0.004, 0.006] }} color={PAPER_END} at={[0, -STICK.length / 2 - 0.002, 0]} />
        </group>
      ))}
      {[-0.08, 0.08].map((y) => (
        <Part key={y} shape={{ post: [0.077, 0.035] }} color={TAPE} at={[0, y, 0.001]} />
      ))}
      <mesh geometry={fuse} material={fuseMaterial} />
      <group ref={spark} visible={false}>
        <mesh material={SPARK_CORE}>
          <sphereGeometry args={[0.016, 8, 6]} />
        </mesh>
        {[0, HALF_PI].map((a) => (
          <mesh key={a} material={SPARK_RAYS} rotation={[0, 0, a]}>
            <boxGeometry args={[0.075, 0.008, 0.008]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Molotov cocktail: a green glass bottle with fuel inside and a rag stuffed in the neck, which is lit while
// you aim and as it flies

const glass = new THREE.MeshStandardMaterial({
  color: '#5a8f4e',
  transparent: true,
  opacity: 0.45,
  roughness: 0.1,
  depthWrite: false,
})
const RAG = '#e6dcc3'

function Glass({ shape, at, rot }: { shape: Shape; at?: V3; rot?: V3 }) {
  const geometry = shapeGeometry(shape)
  return (
    <group position={at} rotation={rot}>
      <mesh geometry={geometry} material={glass} />
      <mesh geometry={geometry} material={thinOutline} />
    </group>
  )
}

export function Molotov({ live }: { live?: Live }) {
  const flame = useRef<THREE.Group>(null)
  useFrame((state) => {
    const f = flame.current!
    f.visible = !!live?.lit
    if (!f.visible) return
    const t = state.clock.elapsedTime
    f.scale.set(1 + 0.15 * Math.sin(t * 23), 0.85 + 0.3 * Math.abs(Math.sin(t * 17 + 1)), 1 + 0.15 * Math.cos(t * 19))
    f.rotation.z = Math.sin(t * 9) * 0.2
  })
  return (
    <group>
      {/* Fuel, seen through the glass */}
      <Part shape={{ post: [0.054, 0.13] }} color="#d98a2b" at={[0, -0.03, 0]} />
      <Glass shape={{ post: [0.062, 0.2] }} />
      <Glass shape={{ cone: [0.062, 0.024, 0.06] }} at={[0, 0.13, 0]} rot={[0, 0, HALF_PI]} />
      <Glass shape={{ post: [0.024, 0.08] }} at={[0, 0.2, 0]} />
      <Glass shape={{ ring: [0.025, 0.006] }} at={[0, 0.24, 0]} rot={[HALF_PI, 0, 0]} />
      {/* The rag: stuffed in the neck, knotted on top, a tail hanging down the side */}
      <Part shape={{ post: [0.02, 0.05] }} color={RAG} at={[0, 0.255, 0]} />
      <Part shape={{ sphere: 0.028 }} color={RAG} at={[0, 0.285, 0]} scale={[1, 0.8, 1]} />
      <Part shape={{ box: [0.03, 0.09, 0.01] }} color={RAG} at={[0.036, 0.24, 0]} rot={[0, 0, -0.5]} />
      <group ref={flame} position={[0, 0.3, 0]} visible={false}>
        <mesh material={FLAME_OUTER} position={[0, 0.065, 0]}>
          <coneGeometry args={[0.035, 0.13, 8]} />
        </mesh>
        <mesh material={FLAME_INNER} position={[0, 0.04, 0]}>
          <coneGeometry args={[0.02, 0.08, 8]} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Smoke grenade (M18 style): an olive can with a white band, holes round the top for the smoke, the fuse
// on top, the spoon down its side and the pull ring in front

const CAN = '#4b5b2e'
const CAN_DARK = '#3a4623'

export function SmokeGrenade({ live }: { live?: Live }) {
  const { ring, spoon } = useFuseParts(live)
  return (
    <group>
      <Part shape={{ post: [0.06, 0.2] }} color={CAN} />
      <Part shape={{ post: [0.0605, 0.024] }} color="#e9ebe4" at={[0, -0.055, 0]} />
      <Part shape={{ post: [0.057, 0.012] }} color={CAN_DARK} at={[0, 0.106, 0]} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + 0.3
        return <Part key={i} shape={{ post: [0.007, 0.004] }} color="#1d2214" at={[Math.cos(a) * 0.042, 0.113, Math.sin(a) * 0.042]} />
      })}
      <Part shape={{ post: [0.024, 0.04] }} color={CAN} at={[0, 0.13, 0]} />
      <Part shape={{ box: [0.05, 0.032, 0.036] }} color={CAN} at={[0, 0.165, 0]} />
      <group ref={spoon}>
        <Part shape={{ box: [0.075, 0.01, 0.028] }} color={STEEL} at={[0.035, 0.186, 0]} />
        <Part shape={{ box: [0.01, 0.15, 0.024] }} color={STEEL} at={[0.072, 0.11, 0]} />
      </group>
      <group ref={ring}>
        <Part shape={{ ring: [0.026, 0.0045] }} color={STEEL} at={[0.01, 0.14, 0.045]} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The bomb launcher's capsule: a small metal pill with a brass nose and a red band, and a red light that
// blinks faster and faster as its fuse runs down

const CAPSULE_BODY = '#6d737c'
const CAPSULE_NOSE = '#c9a24a'
const BLINK = glow('#ff3030')

export function Capsule({ live }: { live?: Live }) {
  const light = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!live) return
    const period = 0.08 + 0.42 * live.burn
    light.current!.visible = live.lit && state.clock.elapsedTime % period < period / 2
  })
  return (
    <group>
      <Part shape={{ post: [0.035, 0.07] }} color={CAPSULE_BODY} />
      <Part shape={{ sphere: 0.035 }} color={CAPSULE_NOSE} at={[0, 0.035, 0]} />
      <Part shape={{ sphere: 0.035 }} color={CAPSULE_BODY} at={[0, -0.035, 0]} />
      <Part shape={{ post: [0.0365, 0.014] }} color="#b3262a" at={[0, 0.012, 0]} />
      <mesh ref={light} material={BLINK} position={[0.034, -0.02, 0]} visible={false}>
        <sphereGeometry args={[0.011, 8, 6]} />
      </mesh>
    </group>
  )
}
