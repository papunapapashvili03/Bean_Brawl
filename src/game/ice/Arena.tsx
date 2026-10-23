import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier, type RapierCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { allRunners, isActivePlayer, type Contactable } from '../playerContact'
import { COUNTDOWN_SECONDS, STEP, getRaceView, playerPosition, raceClock } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import { CELLS, ICE, LAYERS, LAYER_COLOURS, SHATTERING, THICK, TILE, TILES, layerOf, layerTop, tileAt } from './course'
import { breakTile, brokeAt, ice, round, solid, stage, standOn } from './tiles'

// The three floors of ice: every tile a collider (switched off when it breaks) and an instance in its
// floor's mesh, with its cracks drawn over it as it cracks. Before every physics step, everyone on a tile
// (or across the edge of one) cracks it (./tiles); a tile with nothing left breaks, and falls away, tipping
// and shrinking. Floors above the one you're on fade, so you can see what you're doing.

const HALF = TILE / 2
const DROP_TIME = 0.8 // seconds a broken tile takes to fall out of sight
const FADED = 0.16 // how see-through a floor above you is
const HEARD_WITHIN = 8 // metres: ice breaking further off than this is silent
const EDGE = 0.45 // how far past a tile's edge a body can be and still be held up by it

// Each floor's tiles, in the order of its meshes' instances
const FLOOR_TILES: number[][] = Array.from({ length: LAYERS }, () => [])
const SLOT = new Int32Array(TILES.length)
TILES.forEach((tile, i) => {
  const floor = FLOOR_TILES[tile.layer]
  SLOT[i] = floor.length
  floor.push(i)
})

// A tile: a slab with its top at y 0, the top a shade lighter than the sides and a frosted square set into it
function slabGeometry() {
  const tint = (g: THREE.BufferGeometry, top: number, side: number) => {
    const normals = g.getAttribute('normal')
    const shades: number[] = []
    for (let k = 0; k < normals.count; k++) {
      const s = normals.getY(k) > 0.5 ? top : side
      shades.push(s, s, s)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3))
    return g
  }
  const body = tint(new THREE.BoxGeometry(TILE - 0.08, THICK, TILE - 0.08).translate(0, -THICK / 2, 0), 0.86, 0.66)
  const inlay = tint(new THREE.BoxGeometry(TILE - 0.46, 0.02, TILE - 0.46).translate(0, 0.004, 0), 1, 1)
  const merged = mergeGeometries([body.toNonIndexed(), inlay.toNonIndexed()])!
  body.dispose()
  inlay.dispose()
  return merged
}
const SLAB = slabGeometry()

// Cracks: thin jagged lines lying on a tile's top, out from where it was first hit. The first set shows once
// a tile's cracked, the second (more, and branching) once it's badly cracked.
function crackGeometry(rays: number, turn: number, seed: number, branches: boolean) {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const lim = HALF - 0.12
  const quads: number[] = []
  const line = (ax: number, az: number, bx: number, bz: number, w: number) => {
    const len = Math.hypot(bx - ax, bz - az) || 1
    const nx = (-(bz - az) / len) * (w / 2)
    const nz = ((bx - ax) / len) * (w / 2)
    const y = 0.03
    quads.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz)
    quads.push(ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz)
  }
  const ray = (x: number, z: number, angle: number, steps: number, w: number) => {
    let a = angle
    for (let k = 0; k < steps; k++) {
      a += (rand() - 0.5) * 0.9
      const len = 0.22 + rand() * 0.16
      const nx = Math.max(-lim, Math.min(lim, x + Math.sin(a) * len))
      const nz = Math.max(-lim, Math.min(lim, z + Math.cos(a) * len))
      line(x, z, nx, nz, w * (1 - k * 0.12))
      if (branches && k === 1 && rand() < 0.7) ray(nx, nz, a + (rand() < 0.5 ? 0.9 : -0.9), 2, w * 0.7)
      x = nx
      z = nz
      if (Math.abs(x) >= lim || Math.abs(z) >= lim) break
    }
  }
  for (let k = 0; k < rays; k++) ray(0.12, -0.08, turn + (k / rays) * Math.PI * 2 + (rand() - 0.5) * 0.5, 4, 0.06)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(quads, 3))
  return g
}
const CRACKS = [crackGeometry(4, 0.3, 11, false), crackGeometry(5, 0.9, 97, true)]

const WHITE = new THREE.Color('#ffffff')
const BASE = TILES.map((t) => new THREE.Color(LAYER_COLOURS[t.layer]))

// Each floor's look (its own, so it can fade on its own), and its cracks'
const LOOKS = LAYER_COLOURS.map(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.05 }))
const CRACK_LOOKS = LAYER_COLOURS.map(
  () => new THREE.MeshBasicMaterial({ color: '#2f6fa8', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
)

// Tiles broken (from the physics step to the drawing)
const breaking: number[] = []

export function Arena() {
  return (
    <>
      <TileColliders />
      <Floors />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------

function TileColliders() {
  const { world, rapier } = useRapier()
  const colliders = useRef<RapierCollider[]>([])
  const heard = useRef(0)

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    colliders.current = TILES.map((t) =>
      world.createCollider(rapier.ColliderDesc.cuboid(HALF - 0.005, THICK / 2, HALF - 0.005).setTranslation(t.x, layerTop(t.layer) - THICK / 2, t.z), body),
    )
    return () => {
      // (The physics world may have gone already, along with everything in it)
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body)
      colliders.current = []
    }
  }, [world, rapier])

  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (t < COUNTDOWN_SECONDS || round.over) return
    for (const runner of allRunners()) {
      const tile = tileFor(runner)
      const was = tile >= 0 ? stage(tile) : 0
      const player = isActivePlayer(runner)
      if (standOn(runner.handle, tile, STEP)) {
        breakTile(tile, t)
        colliders.current[tile]?.setEnabled(false)
        breaking.push(tile)
        const tl = TILES[tile]
        const near = Math.hypot(tl.x - playerPosition.x, layerTop(tl.layer) - playerPosition.y, tl.z - playerPosition.z)
        if (near < HEARD_WITHIN && t - heard.current > 0.08) {
          heard.current = t
          withVolume(1 - near / HEARD_WITHIN, sfx.shatter)
        }
      } else if (player && tile >= 0 && stage(tile) > was) sfx.crack()
    }
  })
  return null
}

// The tile a runner's standing on: the one under its middle or, with that one gone (or not there), the
// nearest next to it whose edge it's still standing on. -1: none (in the air, or on the way up).
function tileFor(runner: Contactable) {
  const p = runner.position()
  if (runner.velocity().y > 1.5) return -1
  const feet = p.y - 1
  const layer = layerOf(feet)
  if (Math.abs(feet - layerTop(layer)) > 0.25) return -1
  const ci = Math.floor(p.x / TILE + CELLS / 2)
  const cj = Math.floor(p.z / TILE + CELLS / 2)
  const own = tileAt(layer, ci, cj)
  if (own >= 0 && solid(own)) return own
  let best = -1
  let nearest = Infinity
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const n = tileAt(layer, ci + di, cj + dj)
      if (n < 0 || n === own || !solid(n)) continue
      const ox = Math.max(0, Math.abs(p.x - TILES[n].x) - HALF)
      const oz = Math.max(0, Math.abs(p.z - TILES[n].z) - HALF)
      const off = Math.hypot(ox, oz)
      if (off <= EDGE && off < nearest) {
        nearest = off
        best = n
      }
    }
  }
  return best
}

// ---------------------------------------------------------------------------------------------------------

const dummy = new THREE.Object3D()
const colour = new THREE.Color()
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

function restMatrix(i: number, out: THREE.Matrix4) {
  const t = TILES[i]
  dummy.position.set(t.x, layerTop(t.layer), t.z)
  dummy.rotation.set(0, 0, 0)
  dummy.scale.setScalar(1)
  dummy.updateMatrix()
  return out.copy(dummy.matrix)
}
// A tile's cracks: turned (and flipped) its own way, so they don't all look alike
function crackMatrix(i: number, out: THREE.Matrix4) {
  const t = TILES[i]
  dummy.position.set(t.x, layerTop(t.layer), t.z)
  dummy.rotation.set(0, ((i * 7) % 4) * (Math.PI / 2), 0)
  dummy.scale.set(i % 3 === 0 ? -1 : 1, 1, 1)
  dummy.updateMatrix()
  return out.copy(dummy.matrix)
}

// A floor's cracks have moved on: to be drawn again
function redrawCracks(sets: (THREE.InstancedMesh | null)[][], layer: number) {
  for (const set of sets) set[layer]!.instanceMatrix.needsUpdate = true
}

function Floors() {
  const slabs = useRef<(THREE.InstancedMesh | null)[]>([])
  const cracks = useRef<(THREE.InstancedMesh | null)[][]>([[], []])
  // What each tile's drawn as now: how much ice it has (colour), and which cracks
  const drawnIce = useRef(new Float32Array(TILES.length).fill(-1))
  const drawnStage = useRef(new Uint8Array(TILES.length))

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    FLOOR_TILES.forEach((tiles, layer) => {
      const mesh = slabs.current[layer]!
      tiles.forEach((tile, slot) => {
        mesh.setMatrixAt(slot, restMatrix(tile, m))
        mesh.setColorAt(slot, BASE[tile])
        for (const set of cracks.current) set[layer]!.setMatrixAt(slot, HIDDEN)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.needsUpdate = true
      redrawCracks(cracks.current, layer)
    })
    drawnIce.current.fill(ICE)
    drawnStage.current.fill(0)
    breaking.length = 0
    for (const look of [...LOOKS, ...CRACK_LOOKS]) {
      look.userData.full ??= look.opacity
      look.opacity = look.userData.full
      look.transparent = look instanceof THREE.MeshBasicMaterial
      look.depthWrite = !look.transparent
      look.needsUpdate = true
    }
  }, [])

  useFrame((_, delta) => {
    const t = raceClock()
    const dirty = new Set<number>()
    const m = new THREE.Matrix4()

    // Cracking: paler the less ice is left, flickering once it's about to go; its cracks as they come
    for (let i = 0; i < TILES.length; i++) {
      if (!solid(i)) continue
      const left = ice[i]
      const layer = TILES[i].layer
      if (left !== drawnIce.current[i] || left < SHATTERING / 2) {
        drawnIce.current[i] = left
        colour.copy(BASE[i]).lerp(WHITE, 0.6 * (1 - left / ICE))
        if (left < SHATTERING / 2) colour.lerp(WHITE, 0.25 + 0.25 * Math.sin(t * 40 + i))
        slabs.current[layer]!.setColorAt(SLOT[i], colour)
        dirty.add(layer)
      }
      const s = stage(i)
      if (s !== drawnStage.current[i]) {
        drawnStage.current[i] = s
        cracks.current.forEach((set, k) => set[layer]!.setMatrixAt(SLOT[i], s > k ? crackMatrix(i, m) : HIDDEN))
        dirty.add(layer)
      }
    }

    // Broken: falling, tipping and shrinking out of sight
    for (let k = breaking.length - 1; k >= 0; k--) {
      const i = breaking[k]
      const tl = TILES[i]
      const mesh = slabs.current[tl.layer]!
      if (drawnStage.current[i] !== 3) {
        drawnStage.current[i] = 3
        for (const set of cracks.current) set[tl.layer]!.setMatrixAt(SLOT[i], HIDDEN)
      }
      const d = t - brokeAt[i]
      if (d >= DROP_TIME || !(d >= 0)) {
        mesh.setMatrixAt(SLOT[i], HIDDEN)
        breaking.splice(k, 1)
      } else {
        const u = d / DROP_TIME
        dummy.position.set(tl.x, layerTop(tl.layer) - 10 * d * d, tl.z)
        dummy.rotation.set(Math.sin(i * 1.7) * u * 0.8, 0, Math.cos(i * 2.3) * u * 0.8)
        dummy.scale.setScalar(1 - 0.75 * u)
        dummy.updateMatrix()
        mesh.setMatrixAt(SLOT[i], dummy.matrix)
        mesh.setColorAt(SLOT[i], WHITE)
      }
      dirty.add(tl.layer)
    }
    for (const layer of dirty) {
      const mesh = slabs.current[layer]!
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.needsUpdate = true
      redrawCracks(cracks.current, layer)
    }

    // Floors above yours fade (while you're on the floors at all)
    const view = getRaceView()
    const playing = view.phase === 'running' || view.phase === 'countdown' || view.phase === 'finished'
    const yours = layerOf(playerPosition.y - 1)
    const ease = 1 - Math.exp(-8 * delta)
    LOOKS.forEach((look, layer) => {
      const target = playing && layer > yours ? FADED : 1
      for (const set of cracks.current) set[layer]!.visible = target === 1 && look.opacity > 0.9
      if (look.opacity === target) return
      look.opacity = Math.abs(look.opacity - target) < 0.01 ? target : THREE.MathUtils.lerp(look.opacity, target, ease)
      const see = look.opacity < 0.99
      if (look.transparent !== see) {
        look.transparent = see
        look.depthWrite = !see
        look.needsUpdate = true
      }
    })
  })

  return (
    <>
      {FLOOR_TILES.map((tiles, layer) => (
        <group key={layer}>
          <instancedMesh
            ref={(m) => {
              slabs.current[layer] = m
            }}
            args={[SLAB, LOOKS[layer], tiles.length]}
            receiveShadow
            frustumCulled={false}
          />
          {CRACKS.map((geometry, k) => (
            <instancedMesh
              key={k}
              ref={(m) => {
                cracks.current[k][layer] = m
              }}
              args={[geometry, CRACK_LOOKS[layer], tiles.length]}
              frustumCulled={false}
            />
          ))}
        </group>
      ))}
    </>
  )
}
