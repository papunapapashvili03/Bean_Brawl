import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { allRunners, loudness } from '../playerContact'
import { COUNTDOWN_SECONDS, STEP, playerPosition, raceClock } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import {
  BACK,
  BLAST_BLOCKS,
  BLAST_RUNNERS,
  BREAK_SPEED,
  CELL,
  CELLS,
  FRONT,
  FUSE,
  HALF,
  LASER_X,
  SPAWN_Z,
  WALL_DEPTH,
  WALL_HEIGHT,
  cellOf,
  cellX,
} from './course'
import { active, round, speedAt, wallY, wallZ, walls, type Kind, type Wall } from './walls'

// The stage and its walls. Each wall that's about is a body of its own, its blocks colliders on it, moved
// before every physics step to where the timetable (./walls) says. Before every step too, whoever's touching a
// wall's front gets what its block does: a cracked one run into hard enough breaks, spikes throw you back, and
// TNT gets lit, going off a moment later. The walls are drawn as instances of a mesh per kind of block.

const SPIKE_KNOCK = 0.8 // seconds before the same runner's thrown by spikes again
const HEARD_WITHIN = 24

type Built = { body: RapierRigidBody; colliders: (RapierCollider | null)[] }

// ---------------------------------------------------------------------------------------------------------
// What's going on, shared with the drawing: bits flying off broken blocks, and explosions

type Bit = { x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; until: number; kind: Kind }
const bits: Bit[] = []
const blasts: { x: number; y: number; z: number; at: number }[] = []

function burst(x: number, y: number, z: number, kind: Kind, count: number, t: number, power = 1) {
  for (let i = 0; i < count; i++) {
    bits.push({
      x: x + (Math.random() - 0.5) * CELL * 0.8,
      y: y + Math.random() * WALL_HEIGHT,
      z,
      vx: (Math.random() - 0.5) * 6 * power,
      vy: (2 + Math.random() * 5) * power,
      vz: (Math.random() - 0.2) * 5 * power,
      spin: Math.random() * 10,
      until: t + 1.2 + Math.random() * 0.6,
      kind,
    })
  }
  if (bits.length > 160) bits.splice(0, bits.length - 160)
}

const heardFrom = (x: number, z: number) => Math.max(0, 1 - Math.hypot(x - playerPosition.x, z - playerPosition.z) / HEARD_WITHIN)

// ---------------------------------------------------------------------------------------------------------
// The walls' bodies, and what touching them does

function WallBodies() {
  const { world, rapier } = useRapier()
  const built = useRef(new Map<number, Built>())
  const spiked = useRef(new Map<number, number>()) // runner handle: when it can be thrown by spikes again

  useEffect(() => {
    const all = built.current
    return () => {
      for (const b of all.values()) if (world.getRigidBody(b.body.handle)) world.removeRigidBody(b.body)
      all.clear()
    }
  }, [world])

  const build = (w: Wall, t: number) => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, wallY(w, t), wallZ(w, t)))
    const colliders = w.blocks.map((b, k) =>
      b.kind === null
        ? null
        : world.createCollider(
            rapier.ColliderDesc.cuboid(CELL / 2 - 0.01, WALL_HEIGHT / 2, WALL_DEPTH / 2).setTranslation(cellX(k), WALL_HEIGHT / 2, 0).setFriction(0.3),
            body,
          ),
    )
    return { body, colliders }
  }

  // A block's gone: smashed, or blasted
  const lose = (w: Wall, k: number, t: number, power = 1) => {
    const b = w.blocks[k]
    if (!b.alive || b.kind === null) return
    b.alive = false
    // (Taken out of the world altogether)
    const body = built.current.get(w.n)
    const collider = body?.colliders[k]
    if (body && collider) {
      if (world.getCollider(collider.handle)) world.removeCollider(collider, true)
      body.colliders[k] = null
    }
    burst(cellX(k), wallY(w, t), wallZ(w, t) + WALL_DEPTH / 2, b.kind, b.kind === 'tnt' ? 4 : 9, t, power)
  }

  // TNT going off: every block near it gone (other TNT lit, to go off a moment later), and everyone near it
  // thrown off their feet
  const blowUp = (w: Wall, k: number, t: number) => {
    const at = { x: cellX(k), y: wallY(w, t) + WALL_HEIGHT / 2, z: wallZ(w, t) }
    lose(w, k, t, 1.6)
    blasts.push({ ...at, at: t })
    withVolume(heardFrom(at.x, at.z), sfx.thunder)
    for (const other of walls) {
      if (!active(other, t)) continue
      const z = wallZ(other, t)
      other.blocks.forEach((b, j) => {
        if (!b.alive || Math.hypot(cellX(j) - at.x, z - at.z) > BLAST_BLOCKS) return
        if (b.kind === 'tnt') b.litAt = Math.min(b.litAt, t - FUSE + 0.15)
        else lose(other, j, t, 1.4)
      })
    }
    for (const r of allRunners()) {
      const p = r.position()
      const d = Math.hypot(p.x - at.x, p.z - at.z)
      if (d > BLAST_RUNNERS || Math.abs(p.y - at.y) > 4) continue
      const away = d > 0.01 ? 1 / d : 0
      const push = 5 + 9 * (1 - d / BLAST_RUNNERS)
      withVolume(loudness(r), () => r.knock({ x: (p.x - at.x) * away * push, y: 7, z: (p.z - at.z) * away * push }))
    }
  }

  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    const all = built.current
    // Bodies for the walls that are about (and none for the ones that aren't), each where it should be
    for (const w of walls) {
      const about = active(w, t)
      const b = all.get(w.n)
      if (about && !b) all.set(w.n, build(w, t))
      else if (!about && b) {
        if (world.getRigidBody(b.body.handle)) world.removeRigidBody(b.body)
        all.delete(w.n)
      }
    }
    for (const [n, b] of all) {
      const w = walls[n]
      // (Walls worked out afresh while their bodies were about: those bodies go)
      if (!w) {
        if (world.getRigidBody(b.body.handle)) world.removeRigidBody(b.body)
        all.delete(n)
        continue
      }
      b.body.setNextKinematicTranslation({ x: 0, y: wallY(w, t), z: wallZ(w, t) })
    }
    if (t < COUNTDOWN_SECONDS || round.over) return

    // Whoever's at a wall's front: what the block there does to them
    for (const r of allRunners()) {
      const p = r.position()
      const v = r.velocity()
      for (const n of all.keys()) {
        const w = walls[n]
        const front = wallZ(w, t) + WALL_DEPTH / 2
        const bottom = wallY(w, t)
        if (p.z - front < -0.2 || p.z - front > 0.8 || p.y - 1 > bottom + WALL_HEIGHT || p.y + 1 < bottom) continue
        const k = cellOf(p.x)
        const ks = Math.abs(p.x - cellX(k)) > CELL / 2 - 0.55 ? [k, cellOf(p.x + Math.sign(p.x - cellX(k)) * CELL)] : [k]
        for (const j of ks) {
          const b = w.blocks[j]
          if (!b.alive || b.kind === null || b.kind === 'solid') continue
          if (b.kind === 'cracked' && v.z < -BREAK_SPEED) {
            lose(w, j, t)
            withVolume(heardFrom(p.x, p.z), sfx.crumble)
          } else if (b.kind === 'spike' && (spiked.current.get(r.handle) ?? 0) <= t) {
            spiked.current.set(r.handle, t + SPIKE_KNOCK)
            withVolume(loudness(r), () => {
              sfx.knock()
              r.knock({ x: (p.x - cellX(j)) * 2, y: 5, z: speedAt(t) + 8 })
            })
          } else if (b.kind === 'tnt' && b.litAt === Infinity) {
            b.litAt = t
            withVolume(heardFrom(p.x, p.z), sfx.beltWarning)
          }
        }
      }
    }
    // Fuses burning down
    for (const n of all.keys()) {
      const w = walls[n]
      w.blocks.forEach((b, k) => {
        if (b.alive && b.kind === 'tnt' && t >= b.litAt + FUSE) blowUp(w, k, t)
      })
    }
  })
  return null
}

// ---------------------------------------------------------------------------------------------------------
// How the blocks look

function faceTexture(draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const s = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = s
  draw(canvas.getContext('2d')!, s)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
const framed = (fill: string, edge: string) => (g: CanvasRenderingContext2D, s: number) => {
  g.fillStyle = edge
  g.fillRect(0, 0, s, s)
  g.fillStyle = fill
  g.fillRect(8, 8, s - 16, s - 16)
}
const LOOKS: Record<Kind, THREE.MeshStandardMaterial> = {
  solid: new THREE.MeshStandardMaterial({
    roughness: 0.9,
    map: faceTexture((g, s) => {
      framed('#a3a7b5', '#7d8291')(g, s)
      g.fillStyle = 'rgba(0,0,0,0.08)'
      for (let i = 0; i < 40; i++) g.fillRect(10 + ((i * 37) % (s - 24)), 10 + ((i * 53) % (s - 24)), 4, 4)
    }),
  }),
  cracked: new THREE.MeshStandardMaterial({
    roughness: 0.8,
    map: faceTexture((g, s) => {
      framed('#ff5a4e', '#c4302a')(g, s)
      g.strokeStyle = '#7a1410'
      g.lineWidth = 5
      g.beginPath()
      g.moveTo(20, 18)
      g.lineTo(52, 50)
      g.lineTo(44, 78)
      g.lineTo(70, 108)
      g.moveTo(52, 50)
      g.lineTo(92, 40)
      g.lineTo(110, 70)
      g.moveTo(44, 78)
      g.lineTo(18, 96)
      g.stroke()
    }),
  }),
  spike: new THREE.MeshStandardMaterial({ roughness: 0.85, map: faceTexture(framed('#6c7080', '#4b4f5c')) }),
  tnt: new THREE.MeshStandardMaterial({
    roughness: 0.7,
    map: faceTexture((g, s) => {
      framed('#e5382f', '#8c1b16')(g, s)
      g.fillStyle = '#f5ead7'
      g.fillRect(8, s / 2 - 22, s - 16, 44)
      g.fillStyle = '#1d1d1d'
      g.font = '900 38px system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('TNT', s / 2, s / 2 + 2)
    }),
  }),
}
const BLOCK = new THREE.BoxGeometry(CELL - 0.06, WALL_HEIGHT, WALL_DEPTH).translate(0, WALL_HEIGHT / 2, 0)
const SPIKE = new THREE.ConeGeometry(0.16, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 0.25)
const SPIKE_LOOK = new THREE.MeshStandardMaterial({ color: '#d9dde6', metalness: 0.6, roughness: 0.35 })
const SPIKES_AT = [-0.55, 0, 0.55].flatMap((x) => [0.6, 1.2, 1.8].map((y) => [x, y] as const))
const MAX_BLOCKS = 12 * CELLS
const KINDS: Kind[] = ['solid', 'cracked', 'spike', 'tnt']
const dummy = new THREE.Object3D()
const flash = new THREE.Color()

function WallMeshes() {
  const meshes = useRef<Partial<Record<Kind, THREE.InstancedMesh | null>>>({})
  const spikes = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const tnt = meshes.current.tnt
    if (tnt) for (let i = 0; i < MAX_BLOCKS; i++) tnt.setColorAt(i, flash.set('#ffffff'))
  }, [])

  useFrame(() => {
    const t = raceClock()
    const counts: Record<Kind, number> = { solid: 0, cracked: 0, spike: 0, tnt: 0 }
    let spikeCount = 0
    for (const w of walls) {
      if (!active(w, t)) continue
      const y = wallY(w, t)
      const z = wallZ(w, t)
      w.blocks.forEach((b, k) => {
        if (!b.alive || b.kind === null) return
        const m = meshes.current[b.kind]
        if (!m) return
        const lit = b.kind === 'tnt' && b.litAt <= t
        // (Lit TNT swells and flashes, quicker as it's about to go)
        const swell = lit ? 1 + 0.06 * Math.sin((t - b.litAt) * (12 + 30 * (t - b.litAt))) : 1
        dummy.position.set(cellX(k), y, z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(swell, swell, swell)
        dummy.updateMatrix()
        const i = counts[b.kind]++
        m.setMatrixAt(i, dummy.matrix)
        if (b.kind === 'tnt') m.setColorAt(i, lit && Math.sin((t - b.litAt) * 40) > 0 ? flash.set('#ffffff').multiplyScalar(2) : flash.set('#ffffff'))
        if (b.kind === 'spike' && spikes.current) {
          for (const [sx, sy] of SPIKES_AT) {
            dummy.position.set(cellX(k) + sx, y + sy, z + WALL_DEPTH / 2)
            dummy.scale.setScalar(1)
            dummy.updateMatrix()
            spikes.current.setMatrixAt(spikeCount++, dummy.matrix)
          }
        }
      })
    }
    for (const kind of KINDS) {
      const m = meshes.current[kind]
      if (!m) continue
      m.count = counts[kind]
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    if (spikes.current) {
      spikes.current.count = spikeCount
      spikes.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {KINDS.map((kind) => (
        <instancedMesh
          key={kind}
          ref={(m) => {
            meshes.current[kind] = m
          }}
          args={[BLOCK, LOOKS[kind], MAX_BLOCKS]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
      <instancedMesh ref={spikes} args={[SPIKE, SPIKE_LOOK, MAX_BLOCKS * SPIKES_AT.length]} castShadow frustumCulled={false} />
    </>
  )
}

// Bits of broken block flying, and explosions
const BIT = new THREE.BoxGeometry(0.35, 0.35, 0.35)
const BIT_LOOKS: Record<Kind, THREE.Material> = {
  solid: LOOKS.solid,
  cracked: new THREE.MeshStandardMaterial({ color: '#ff5a4e', roughness: 0.8 }),
  spike: LOOKS.spike,
  tnt: new THREE.MeshStandardMaterial({ color: '#ffb02e', emissive: '#ff6a00', emissiveIntensity: 0.6 }),
}
const BLAST = new THREE.SphereGeometry(1, 20, 14)
const BLAST_LOOK = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, depthWrite: false })
function Debris() {
  const meshes = useRef<Partial<Record<Kind, THREE.InstancedMesh | null>>>({})
  const ball = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    const t = raceClock()
    const counts: Record<Kind, number> = { solid: 0, cracked: 0, spike: 0, tnt: 0 }
    const dt = Math.min(0.05, delta)
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]
      if (t > b.until || t < b.until - 3) {
        bits.splice(i, 1)
        continue
      }
      b.vy -= 20 * dt
      b.x += b.vx * dt
      b.y = Math.max(-3, b.y + b.vy * dt)
      b.z += b.vz * dt
      const m = meshes.current[b.kind]
      if (!m) continue
      dummy.position.set(b.x, b.y, b.z)
      dummy.rotation.set(b.spin * t, b.spin * t * 0.7, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      m.setMatrixAt(counts[b.kind]++, dummy.matrix)
    }
    for (const kind of KINDS) {
      const m = meshes.current[kind]
      if (!m) continue
      m.count = counts[kind]
      m.instanceMatrix.needsUpdate = true
    }
    // The latest explosion: a ball of fire swelling and fading
    const s = ball.current
    while (blasts.length && t - blasts[0].at > 0.6) blasts.shift()
    if (s) {
      const last = blasts[blasts.length - 1]
      s.visible = !!last
      if (last) {
        const u = (t - last.at) / 0.6
        s.position.set(last.x, last.y, last.z)
        s.scale.setScalar(1 + u * BLAST_BLOCKS)
        BLAST_LOOK.opacity = 0.85 * (1 - u)
      }
    }
  })
  return (
    <>
      {KINDS.map((kind) => (
        <instancedMesh
          key={kind}
          ref={(m) => {
            meshes.current[kind] = m
          }}
          args={[BIT, BIT_LOOKS[kind], 160]}
          frustumCulled={false}
        />
      ))}
      <mesh ref={ball} geometry={BLAST} material={BLAST_LOOK} visible={false} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The stage: a floor with lanes painted on it, hazard stripes at the slot in front and the drop at the back,
// lasers either side, and the slime all round

function floorTexture() {
  return faceTexture((g, s) => {
    g.fillStyle = '#6c7cf0'
    g.fillRect(0, 0, s, s)
    g.fillStyle = '#7f8ef7'
    g.fillRect(0, 0, s / 2, s)
    g.strokeStyle = 'rgba(255,255,255,0.35)'
    g.lineWidth = 3
    g.strokeRect(0, 0, s, s)
  })
}
function stripes() {
  const tex = faceTexture((g, s) => {
    g.fillStyle = '#ffd23f'
    g.fillRect(0, 0, s, s)
    g.fillStyle = '#2b2b2b'
    for (let i = -s; i < s * 2; i += 32) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i + 16, 0)
      g.lineTo(i + 16 - s, s)
      g.lineTo(i - s, s)
      g.fill()
    }
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

const LENGTH = BACK - FRONT
const LASER_HEIGHTS = [0.35, 0.95, 1.55, 2.15]
const laserLook = new THREE.MeshBasicMaterial({ color: '#ff2a3d' })
const laserGlow = new THREE.MeshBasicMaterial({ color: '#ff4a5a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
const postLook = new THREE.MeshStandardMaterial({ color: '#2c2f3a', metalness: 0.4, roughness: 0.5 })
const slimeLook = new THREE.MeshStandardMaterial({ color: '#7ee03c', emissive: '#3c9a12', emissiveIntensity: 0.35, roughness: 0.25 })

function Stage() {
  const { floor, edge } = useMemo(() => {
    const map = floorTexture()
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.repeat.set(CELLS / 2, LENGTH / CELL)
    const edgeMap = stripes()
    edgeMap.repeat.set(HALF, 1)
    return { floor: new THREE.MeshStandardMaterial({ map, roughness: 0.6 }), edge: new THREE.MeshStandardMaterial({ map: edgeMap, roughness: 0.6 }) }
  }, [])
  const lasers = useRef<THREE.Group>(null)
  const slime = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    laserGlow.opacity = 0.2 + 0.1 * Math.sin(t * 9)
    if (slime.current) slime.current.position.y = -2.2 + Math.sin(t * 0.8) * 0.06
  })
  return (
    <group>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[HALF, 0.5, LENGTH / 2]} position={[0, -0.5, (FRONT + BACK) / 2]} />
      </RigidBody>
      <mesh material={floor} position={[0, -0.5, (FRONT + BACK) / 2]} receiveShadow>
        <boxGeometry args={[HALF * 2, 1, LENGTH]} />
      </mesh>
      {/* Hazard stripes at the front (by the slot) and along the back edge */}
      {[FRONT + 0.4, BACK - 0.4].map((z) => (
        <mesh key={z} material={edge} position={[0, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[HALF * 2, 0.8]} />
        </mesh>
      ))}
      {/* The slot the walls come up out of */}
      <mesh material={postLook} position={[0, -1.6, SPAWN_Z]}>
        <boxGeometry args={[HALF * 2 + 1, 2.2, WALL_DEPTH + 0.8]} />
      </mesh>
      {/* Lasers either side, on posts */}
      <group ref={lasers}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * LASER_X, 0, (FRONT + BACK) / 2]}>
            {LASER_HEIGHTS.map((y) => (
              <group key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh material={laserLook}>
                  <cylinderGeometry args={[0.035, 0.035, LENGTH, 6]} />
                </mesh>
                <mesh material={laserGlow}>
                  <cylinderGeometry args={[0.14, 0.14, LENGTH, 8]} />
                </mesh>
              </group>
            ))}
            {Array.from({ length: Math.floor(LENGTH / 6) + 1 }, (_, i) => (
              <mesh key={i} material={postLook} position={[side * 0.15, 1.3, -LENGTH / 2 + i * 6]} castShadow>
                <boxGeometry args={[0.3, 2.6, 0.3]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {/* The slime, all round and below */}
      <mesh ref={slime} material={slimeLook} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]}>
        <planeGeometry args={[220, 220]} />
      </mesh>
    </group>
  )
}

export function Arena() {
  return (
    <>
      <Stage />
      <WallBodies />
      <WallMeshes />
      <Debris />
    </>
  )
}
