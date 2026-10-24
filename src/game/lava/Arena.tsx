import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { COUNTDOWN_SECONDS, STEP, playerPosition, raceClock, setRaceCallout } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import { DEPTH, HEX, PILLARS, SINK_WARN, TIDE_WARN } from './course'
import { lavaAt, nextTide, round, sinkingAt, topAt } from './pillars'

// The pillars and the lava. Every pillar is a body of its own, moved before every physics step to where its
// timetable (./pillars) says (so whoever's on it rides up and down with it), and drawn as one of the
// instances of one mesh: blue stone, glowing red and shaking when it's about to sink. The lava is a sea
// that churns, rising with each tide (called out a moment before it comes in).

const GAP = 0.06 // off a pillar's corner radius, so neighbours don't touch
const HEARD_WITHIN = 14

// ---------------------------------------------------------------------------------------------------------
// The bodies

// A hex prism: top at 0, down DEPTH, corners towards ±z
function prismPoints(radius: number) {
  const points: number[] = []
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3
    for (const y of [0, -DEPTH]) points.push(radius * Math.sin(a), y, radius * Math.cos(a))
  }
  return new Float32Array(points)
}

function PillarBodies() {
  const { world, rapier } = useRapier()
  const bodies = useRef<RapierRigidBody[]>([])

  useEffect(() => {
    const hull = prismPoints(HEX - GAP / 2)
    bodies.current = PILLARS.map((p, i) => {
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, topAt(i, 0), p.z))
      world.createCollider(rapier.ColliderDesc.convexHull(hull)!.setFriction(1), body)
      return body
    })
    return () => {
      // (The physics world may have gone already, along with everything in it)
      for (const body of bodies.current) if (world.getRigidBody(body.handle)) world.removeRigidBody(body)
      bodies.current = []
    }
  }, [world, rapier])

  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    bodies.current.forEach((body, i) => body.setNextKinematicTranslation({ x: PILLARS[i].x, y: topAt(i, t), z: PILLARS[i].z }))
  })
  return null
}

// ---------------------------------------------------------------------------------------------------------
// How they look

// Blue stone: a pale top, darker sides that warm towards the lava they stand in
function prismGeometry() {
  const g = new THREE.CylinderGeometry(HEX - GAP, HEX - GAP, DEPTH, 6, 32).translate(0, -DEPTH / 2, 0)
  const top = new THREE.Color('#78aaf0')
  const side = new THREE.Color('#4a7bd0')
  const rim = new THREE.Color('#a4c8ff')
  const warm = new THREE.Color('#ffa36c')
  const deep = new THREE.Color('#5a2a38')
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const colours: number[] = []
  const c = new THREE.Color()
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k)
    if (n.getY(k) > 0.5) c.copy(top)
    else if (y > -0.12) c.copy(rim)
    else if (y > -3.2) c.copy(side).lerp(warm, THREE.MathUtils.smoothstep(-y, 0.8, 3.2))
    else c.copy(warm).lerp(deep, Math.min(1, (-y - 3.2) / 2))
    colours.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  return g
}
const PRISM = prismGeometry()
const STONE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })
const WHITE = new THREE.Color('#ffffff')
const GLOW = new THREE.Color('#ff5a2a')
// The glow itself: a cap of light on top of a pillar about to sink, brightening as it goes
const CAP = new THREE.CylinderGeometry(HEX - GAP - 0.02, HEX - GAP - 0.02, 0.05, 6).translate(0, 0.03, 0)
const CAP_LOOK = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
const BLAZE = new THREE.Color('#ff4a12')
const dummy = new THREE.Object3D()
const tint = new THREE.Color()
const blaze = new THREE.Color()

function PillarMeshes() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const caps = useRef<THREE.InstancedMesh>(null)
  const heard = useRef(new Set<number>())

  useLayoutEffect(() => {
    const m = mesh.current!
    PILLARS.forEach((_, i) => m.setColorAt(i, WHITE))
    m.instanceColor!.needsUpdate = true
    heard.current.clear()
  }, [])

  useFrame(() => {
    const m = mesh.current
    const capped = caps.current
    if (!m || !capped) return
    const t = raceClock()
    PILLARS.forEach((p, i) => {
      let x = p.x
      let z = p.z
      tint.copy(WHITE)
      blaze.setRGB(0, 0, 0)
      const sink = round.over ? null : sinkingAt(i, t)
      if (sink) {
        // Glowing red as it's about to go, brighter and shaking at the last
        const k = Math.min(1, (t - sink.warnAt) / SINK_WARN)
        tint.lerp(GLOW, 0.35 + 0.45 * k + 0.15 * Math.sin(t * 18 + i))
        blaze.copy(BLAZE).multiplyScalar(0.45 + 0.4 * k + 0.25 * Math.sin(t * 14 + i))
        const soon = sink.at - t
        if (soon < 0.6 && soon > -0.3) {
          x += 0.05 * Math.sin(t * 61 + i)
          z += 0.05 * Math.sin(t * 53 + i * 2)
        }
        // ...and a rumble as it starts down, if it's near
        if (t >= sink.at && !heard.current.has(sink.at * 1000 + i)) {
          heard.current.add(sink.at * 1000 + i)
          const near = Math.hypot(p.x - playerPosition.x, p.z - playerPosition.z)
          if (near < HEARD_WITHIN) withVolume(1 - near / HEARD_WITHIN, sfx.tileDrop)
        }
      }
      dummy.position.set(x, topAt(i, t), z)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, tint)
      capped.setMatrixAt(i, dummy.matrix)
      capped.setColorAt(i, blaze)
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
    capped.instanceMatrix.needsUpdate = true
    if (capped.instanceColor) capped.instanceColor.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={mesh} args={[PRISM, STONE, PILLARS.length]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={caps} args={[CAP, CAP_LOOK, PILLARS.length]} frustumCulled={false} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The lava

// Molten rock: dark red crust in cells, with bright cracks between them (tiling, so it can repeat)
function lavaTexture(size = 256, cells = 22, seed = 7) {
  let s = seed
  const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const points = Array.from({ length: cells }, () => [random() * size, random() * size])
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const image = g.createImageData(size, size)
  const crust = new THREE.Color('#d8361a')
  const hot = new THREE.Color('#ff8a1f')
  const vein = new THREE.Color('#ffe066')
  const c = new THREE.Color()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = Infinity
      let d2 = Infinity
      for (const [px, py] of points) {
        // (Wrapping round, so the edges meet up)
        const dx = Math.min(Math.abs(x - px), size - Math.abs(x - px))
        const dy = Math.min(Math.abs(y - py), size - Math.abs(y - py))
        const d = dx * dx + dy * dy
        if (d < d1) {
          d2 = d1
          d1 = d
        } else if (d < d2) d2 = d
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1)
      c.copy(crust).lerp(hot, Math.min(1, Math.sqrt(d1) / 26))
      if (edge < 5) c.lerp(vein, 1 - edge / 5)
      const o = (y * size + x) * 4
      image.data[o] = c.r * 255
      image.data[o + 1] = c.g * 255
      image.data[o + 2] = c.b * 255
      image.data[o + 3] = 255
    }
  }
  g.putImageData(image, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

const SEA = 420
// (Made once, the first time the lava's drawn)
let lavaLooks: { base: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial } | null = null
function lavaLook() {
  if (!lavaLooks) {
    const map = lavaTexture()
    map.repeat.set(SEA / 9, SEA / 9)
    const glowMap = lavaTexture(256, 14, 99)
    glowMap.repeat.set(SEA / 14, SEA / 14)
    lavaLooks = {
      base: new THREE.MeshBasicMaterial({ map }),
      glow: new THREE.MeshBasicMaterial({ map: glowMap, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    }
  }
  return lavaLooks
}
// Churning: the two layers drifting different ways
function churn(delta: number) {
  const { base, glow } = lavaLook()
  base.map!.offset.x += delta * 0.012
  base.map!.offset.y += delta * 0.007
  glow.map!.offset.x -= delta * 0.02
  glow.map!.offset.y += delta * 0.013
  glow.opacity = 0.3 + 0.08 * Math.sin(raceClock() * 1.7)
}

function Lava() {
  const sea = useRef<THREE.Group>(null)
  const { base, glow } = lavaLook()
  useFrame((_, delta) => {
    const g = sea.current
    if (!g) return
    g.position.y = lavaAt(raceClock())
    churn(delta)
  })
  return (
    <group ref={sea}>
      <mesh material={base} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SEA, SEA]} />
      </mesh>
      <mesh material={glow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[SEA, SEA]} />
      </mesh>
    </group>
  )
}

// Sparks drifting up off the lava round the pillars
const EMBERS = 260
const EMBER_BOX = { r: 20, rise: 9 }
const EMBER_SEEDS = Array.from({ length: EMBERS }, () => ({ a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * EMBER_BOX.r, speed: 0.6 + Math.random() * 1.2, phase: Math.random() }))
function Embers() {
  const points = useRef<THREE.Points>(null)
  const seeds = EMBER_SEEDS
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3))
    return g
  }, [])
  const look = useMemo(() => new THREE.PointsMaterial({ color: '#ffb347', size: 0.16, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), [])
  useFrame(({ clock }) => {
    const p = points.current
    if (!p) return
    const at = geometry.getAttribute('position') as THREE.BufferAttribute
    const base = lavaAt(raceClock())
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      const u = (s.phase + (t * s.speed) / EMBER_BOX.rise) % 1
      at.setXYZ(i, Math.cos(s.a + u * 1.5) * s.r, base + u * EMBER_BOX.rise, Math.sin(s.a + u * 1.5) * s.r)
    })
    at.needsUpdate = true
  })
  return <points ref={points} geometry={geometry} material={look} frustumCulled={false} />
}

// ---------------------------------------------------------------------------------------------------------
// Round the arena: dark crags in the lava, and a volcano smoking on the horizon

const CRAGS = Array.from({ length: 26 }, (_, i) => {
  const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7.3) * 0.12
  const r = 56 + (i % 3) * 11 + Math.sin(i * 3.1) * 4
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, size: 2.2 + (i % 4) * 1.2, turn: i * 1.7 }
})
const cragLook = new THREE.MeshStandardMaterial({ color: '#3b2836', roughness: 0.95, flatShading: true })
const coneLook = new THREE.MeshStandardMaterial({ color: '#4a3040', roughness: 0.95, flatShading: true })
const fireLook = new THREE.MeshBasicMaterial({ color: '#ff7a2a' })

function Surroundings() {
  return (
    <group>
      {CRAGS.map((c, i) => (
        <mesh key={i} material={cragLook} position={[c.x, c.size * 0.3, c.z]} rotation={[c.turn, c.turn * 2, 0]} scale={[1, 1.6, 1]}>
          <dodecahedronGeometry args={[c.size, 0]} />
        </mesh>
      ))}
      <group position={[-60, 0, -140]}>
        <mesh material={coneLook} position={[0, 28, 0]}>
          <coneGeometry args={[60, 56, 9, 1, true]} />
        </mesh>
        <mesh material={fireLook} position={[0, 52, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[9, 9]} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The tide: called out before it comes in, rumbling as it does

function Tides() {
  const called = useRef(-1)
  const upcoming = useRef(-1)
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (t < COUNTDOWN_SECONDS || round.over) return
    const next = nextTide(t)
    if (next - t <= TIDE_WARN && called.current !== next) {
      called.current = next
      setRaceCallout({ id: Math.round(next), label: 'The lava is rising!', colour: '#ff5a1f', ink: '#ffffff', seconds: next - t })
      sfx.call()
    }
    // (The tide that was next has started coming in)
    if (upcoming.current > 0 && next !== upcoming.current) {
      setRaceCallout(null)
      sfx.rumble()
    }
    upcoming.current = next
  })
  return null
}

export function Arena() {
  return (
    <>
      <PillarBodies />
      <PillarMeshes />
      <Lava />
      <Embers />
      <Surroundings />
      <Tides />
    </>
  )
}
