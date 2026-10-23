import { useMemo } from 'react'
import { CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Crumble } from './Crumble'
import { stoneBlock } from './stone'

// A straight flight of stone steps running along z, from `from` (its foot, on the centre line) up to `to` (the
// level it climbs to), optionally broken: a few steps missing at each of `breaks` (fractions of the way up),
// leaving gaps about `gap` long to jump. Each unbroken run of steps is a piece that falls on its own, the
// lowest first, from `fallAt` on (`stagger` seconds apart).

type Point = [number, number, number]
export type Flight = { from: Point; to: Point; width: number; breaks?: number[]; gap?: number }

const RISE = 0.25 // each step
const DEPTH = 1 // how far each step's block reaches below its tread
const THICK = 0.5 // the collider under the treads

function flightPieces({ from, to, width, breaks = [], gap = 0 }: Flight) {
  const rise = to[1] - from[1]
  const n = Math.max(1, Math.round(rise / RISE))
  const step = rise / n
  const dz = to[2] - from[2]
  const run = Math.abs(dz) / n
  const s = Math.sign(dz)
  const missing = Math.max(1, Math.round(gap / run))
  const runs: [number, number][] = []
  let first = 0
  for (const b of breaks) {
    const cut = Math.round(b * n) - Math.floor(missing / 2)
    runs.push([first, cut - 1])
    first = cut + missing
  }
  runs.push([first, n - 1])

  const x = from[0]
  const tread = (k: number) => from[1] + (k + 1) * step // height of step k's top
  const front = (k: number) => from[2] + s * k * run // where step k starts (its lower edge)
  // A smooth slope for the collider, through the middle of every tread: easy to walk up, and the feet sit on
  // the steps (a capsule would catch on every nose)
  const angle = -s * Math.atan2(step, run)
  const normal = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle))
  return runs
    .filter(([k0, k1]) => k1 >= k0)
    .map(([k0, k1]) => {
      const centre = new THREE.Vector3(x, (tread(k0) + tread(k1)) / 2 - DEPTH / 2, (front(k0) + front(k1 + 1)) / 2)
      const blocks: THREE.BufferGeometry[] = []
      for (let k = k0; k <= k1; k++) {
        const block = new THREE.BoxGeometry(width, DEPTH, run + 0.02)
        block.translate(0, tread(k) - DEPTH / 2 - centre.y, front(k) + (s * run) / 2 - centre.z)
        blocks.push(block)
      }
      const geometry = mergeGeometries(blocks)!
      blocks.forEach((b) => b.dispose())
      const mid0 = front(k0) + (s * run) / 2
      const mid1 = front(k1) + (s * run) / 2
      const length = Math.hypot(mid1 - mid0, tread(k1) - tread(k0)) + run / Math.cos(angle)
      const middle = new THREE.Vector3(x, (tread(k0) + tread(k1)) / 2, (mid0 + mid1) / 2).addScaledVector(normal, -THICK / 2)
      return {
        position: centre.toArray() as Point,
        geometry,
        collider: {
          position: middle.sub(centre).toArray() as Point,
          rotation: [angle, 0, 0] as Point,
          half: [width / 2, THICK / 2, length / 2] as Point,
        },
      }
    })
}

export function Stairs({
  flight,
  fallAt,
  stagger = 0.6,
  material = stoneBlock,
}: {
  flight: Flight
  fallAt: number | ((piece: number) => number | (() => number))
  stagger?: number
  material?: THREE.MeshStandardMaterial
}) {
  const pieces = useMemo(() => flightPieces(flight), [flight])
  return (
    <>
      {pieces.map((p, i) => (
        <Crumble
          key={i}
          fallAt={typeof fallAt === 'number' ? fallAt + i * stagger : fallAt(i)}
          position={p.position}
          geometry={p.geometry}
          material={material}
          colliders={<CuboidCollider args={p.collider.half} position={p.collider.position} rotation={p.collider.rotation} />}
        />
      ))}
    </>
  )
}
