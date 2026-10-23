import { Fragment, useMemo } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGrabEdges } from '../grab'
import { TapedRods } from '../GripTape'
import { paint } from '../race/materials'
import { floorMap, floorUV } from './floor'
import { BARS, BAR_RODS, BOXES, EDGES, HOLDS, HOLD_HALF, LIPS, OUTLINE, SPAWNS, TEAM_COLOURS, THICKNESS, type P3 } from './layout'

// The island and everything built on it (see ./layout). All of it is fixed: one body with a collider per
// block, drawn as one mesh per colour.

// ---------------------------------------------------------------------------------------------------------
// The island: a slab in the outline's shape, the painted floor on top

const sideLook = new THREE.MeshStandardMaterial({ color: '#8e7cc3', roughness: 0.8 })
const undersideLook = new THREE.MeshStandardMaterial({ color: '#6c5ca3', roughness: 0.9 })

function Island() {
  const { slab, top } = useMemo(() => {
    // Shape points are (x, -z): laid flat by a quarter turn back about x, they come out at (x, 0, z)
    const shape = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z)))
    const slab = new THREE.ExtrudeGeometry(shape, { depth: THICKNESS, bevelEnabled: false, curveSegments: 1 })
      .rotateX(-Math.PI / 2)
      .translate(0, -THICKNESS, 0)
    const top = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, 0.004, 0)
    const p = top.getAttribute('position')
    const uv = new Float32Array(p.count * 2)
    for (let i = 0; i < p.count; i++) {
      const [u, v] = floorUV(p.getX(i), p.getZ(i))
      uv[i * 2] = u
      uv[i * 2 + 1] = v
    }
    top.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    return { slab, top }
  }, [])
  const floor = useMemo(() => new THREE.MeshStandardMaterial({ map: floorMap(), roughness: 0.85 }), [])
  return (
    <>
      <RigidBody type="fixed" colliders="trimesh" friction={1}>
        <mesh geometry={slab} material={[undersideLook, sideLook]} receiveShadow />
      </RigidBody>
      <mesh geometry={top} material={floor} receiveShadow />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Blocks, handholds, bars

const holdGeometry = new THREE.SphereGeometry(1, 16, 10)
const metal = new THREE.MeshStandardMaterial({ color: '#c9ccd6', metalness: 0.6, roughness: 0.35 })

function Blocks() {
  // One mesh per colour
  const meshes = useMemo(() => {
    const byColour = new Map<string, THREE.BufferGeometry[]>()
    for (const { min, max, color } of BOXES) {
      const size: P3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
      const g = new THREE.BoxGeometry(...size).translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
      byColour.set(color, [...(byColour.get(color) ?? []), g])
    }
    return [...byColour].map(([color, parts]) => ({ color, geometry: mergeGeometries(parts)! }))
  }, [])
  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1}>
        {BOXES.map(({ min, max }, i) => (
          <CuboidCollider
            key={i}
            args={[(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2]}
            position={[(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]}
          />
        ))}
      </RigidBody>
      {meshes.map(({ color, geometry }) => (
        <mesh key={color} geometry={geometry} material={paint(color)} castShadow receiveShadow />
      ))}
    </>
  )
}

function Holds() {
  return (
    <>
      {HOLDS.map((h, i) => {
        const along = h.out[0] === 0 // the grip runs along x on a face that looks along z
        return (
          <mesh
            key={i}
            geometry={holdGeometry}
            material={paint(h.color)}
            position={[h.at[0] - h.out[0] * 0.08, h.at[1] - 0.05, h.at[2] - h.out[1] * 0.08]}
            scale={along ? [HOLD_HALF + 0.05, 0.1, 0.16] : [0.16, 0.1, HOLD_HALF + 0.05]}
            castShadow
          />
        )
      })}
    </>
  )
}

// Posts for the free-standing bars (bars are visual only: rising or flinging past one never bonks your head)
function BarPosts() {
  return (
    <RigidBody type="fixed" colliders={false}>
      {BARS.filter((b) => b.posts).flatMap((b, i) =>
        [b.a, b.b].map((end, k) => {
          const at: P3 = [end[0], end[1] / 2 + 0.05, end[2]]
          return (
            <Fragment key={`${i}-${k}`}>
              <CylinderCollider args={[end[1] / 2 + 0.05, 0.09]} position={at} />
              <mesh material={metal} position={at} castShadow>
                <cylinderGeometry args={[0.09, 0.09, end[1] + 0.1, 12]} />
              </mesh>
            </Fragment>
          )
        }),
      )}
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The spawn pads, in each team's colour

function Pads() {
  return (
    <>
      {(['north', 'south'] as const).flatMap((team) =>
        SPAWNS[team].map(([x, , z], i) => (
          <group key={`${team}${i}`} position={[x, 0.02, z]}>
            <mesh material={paint(TEAM_COLOURS[team])} receiveShadow>
              <cylinderGeometry args={[0.6, 0.6, 0.04, 24]} />
            </mesh>
            <mesh material={paint('#ffffff')} position={[0, 0.021, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.42, 0.52, 24]} />
            </mesh>
          </group>
        )),
      )}
    </>
  )
}

export function Structures() {
  useGrabEdges(EDGES)
  return (
    <group>
      <Island />
      <Blocks />
      <Holds />
      <BarPosts />
      <TapedRods rods={LIPS} radius={0.07} tape="lip" />
      <TapedRods rods={BAR_RODS} radius={0.05} tape="bar" />
      <Pads />
    </group>
  )
}
