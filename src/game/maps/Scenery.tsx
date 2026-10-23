import { useMemo } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { material } from './textures'

// Scenery shared by the gunfight maps: palms and trees, flowering hedges, lamp posts, power lines slung
// between wooden poles, each team's painted start marks. Everything with a trunk or a post can be bumped into.
// Pass stable (module-level) lists.

type P3 = [number, number, number]
type XZ = [number, number]

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const bark = new THREE.MeshStandardMaterial({ color: '#6d5a45', roughness: 1 })
const palmBark = new THREE.MeshStandardMaterial({ color: '#8a7a64', roughness: 1 })
const frond = new THREE.MeshStandardMaterial({ color: '#4f6b2c', roughness: 0.9, side: THREE.DoubleSide })
const leaves = new THREE.MeshStandardMaterial({ color: '#3f5a2a', roughness: 1, flatShading: true })
const blossom = new THREE.MeshStandardMaterial({ color: '#c8367a', roughness: 0.9 })
const poleWood = new THREE.MeshStandardMaterial({ color: '#5b4a3a', roughness: 1 })

// ---------------------------------------------------------------------------------------------------------
// Palms and trees

function palmGeometry(seed: number) {
  const rand = seeded(seed)
  const height = 6 + rand() * 3
  const lean = new THREE.Vector3((rand() - 0.5) * 1.6, 0, (rand() - 0.5) * 1.6)
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean.x * 0.2, height * 0.5, lean.z * 0.2), new THREE.Vector3(lean.x, height, lean.z))
  const trunk = new THREE.TubeGeometry(curve, 12, 0.2, 8)
  const fronds: THREE.BufferGeometry[] = []
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.3
    const len = 2.6 + rand() * 0.8
    // A leaf: a strip drooping away from the crown
    const g = new THREE.PlaneGeometry(len, 0.7, 6, 1)
    const p = g.getAttribute('position')
    for (let k = 0; k < p.count; k++) {
      const u = (p.getX(k) + len / 2) / len
      p.setXYZ(k, u * len, -u * u * 1.4, p.getY(k) * (1 - u * 0.7))
    }
    g.computeVertexNormals()
    fronds.push(g.rotateY(-a).translate(lean.x, height, lean.z))
  }
  return { trunk, fronds: mergeGeometries(fronds)! }
}

export function Palms({ at }: { at: XZ[] }) {
  const variants = useMemo(() => [11, 23, 37].map(palmGeometry), [])
  return (
    <RigidBody type="fixed" colliders={false}>
      {at.map(([x, z], i) => {
        const v = variants[i % variants.length]
        return (
          <group key={i}>
            <CylinderCollider args={[1.6, 0.3]} position={[x, 1.6, z]} />
            <group position={[x, 0, z]} rotation={[0, i * 1.3, 0]}>
              <mesh geometry={v.trunk} material={palmBark} castShadow />
              <mesh geometry={v.fronds} material={frond} castShadow />
            </group>
          </group>
        )
      })}
    </RigidBody>
  )
}

export function Trees({ at }: { at: XZ[] }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {at.map(([x, z], i) => (
        <group key={i}>
          <CylinderCollider args={[1.5, 0.35]} position={[x, 1.5, z]} />
          <group position={[x, 0, z]}>
            <mesh material={bark} position={[0, 1.6, 0]} castShadow>
              <cylinderGeometry args={[0.22, 0.32, 3.2, 8]} />
            </mesh>
            {[
              [0, 4.2, 0, 2.2],
              [1, 3.6, 0.4, 1.5],
              [-0.8, 3.8, -0.6, 1.6],
              [0.2, 5.2, -0.2, 1.4],
            ].map(([dx, y, dz, r], k) => (
              <mesh key={k} material={leaves} position={[dx, y, dz]} castShadow>
                <icosahedronGeometry args={[r, 1]} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </RigidBody>
  )
}

// Hedges, spotted with pink flowers (or plain)
export function Hedges({ hedges, flowers = true }: { hedges: { min: XZ; max: XZ }[]; flowers?: boolean }) {
  const blooms = useMemo(() => {
    if (!flowers) return null
    const rand = seeded(5)
    const parts: THREE.BufferGeometry[] = []
    for (const h of hedges) {
      const area = (h.max[0] - h.min[0]) * (h.max[1] - h.min[1])
      for (let i = 0; i < area * 10; i++) {
        const x = h.min[0] + rand() * (h.max[0] - h.min[0])
        const z = h.min[1] + rand() * (h.max[1] - h.min[1])
        parts.push(new THREE.IcosahedronGeometry(0.09 + rand() * 0.06, 0).translate(x, 0.6 + rand() * 0.75, z))
      }
      for (let i = 0; i < 12; i++) {
        const onX = rand() < 0.5
        const x = onX ? h.min[0] + rand() * (h.max[0] - h.min[0]) : rand() < 0.5 ? h.min[0] - 0.02 : h.max[0] + 0.02
        const z = onX ? (rand() < 0.5 ? h.min[1] - 0.02 : h.max[1] + 0.02) : h.min[1] + rand() * (h.max[1] - h.min[1])
        parts.push(new THREE.IcosahedronGeometry(0.1, 0).translate(x, 0.3 + rand() * 1.1, z))
      }
    }
    return parts.length ? mergeGeometries(parts.map((g) => g.toNonIndexed()))! : null
  }, [hedges, flowers])
  return (
    <RigidBody type="fixed" colliders={false}>
      {hedges.map((h, i) => {
        const size: P3 = [h.max[0] - h.min[0], 1.4, h.max[1] - h.min[1]]
        const at: P3 = [(h.min[0] + h.max[0]) / 2, 0.7, (h.min[1] + h.max[1]) / 2]
        return (
          <group key={i}>
            <CuboidCollider args={[size[0] / 2, 0.7, size[2] / 2]} position={at} />
            <mesh material={material('hedge')} position={at} castShadow receiveShadow>
              <boxGeometry args={size} />
            </mesh>
          </group>
        )
      })}
      {blooms && <mesh geometry={blooms} material={blossom} />}
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Street furniture: lamp posts, power poles with the lines slung between them

export function Lamps({ at }: { at: XZ[] }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {at.map(([x, z], i) => (
        <group key={i}>
          <CylinderCollider args={[2.5, 0.12]} position={[x, 2.5, z]} />
          <group position={[x, 0, z]} rotation={[0, i * 1.7, 0]}>
            <mesh material={material('darkFrame')} position={[0, 2.5, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.12, 5, 8]} />
            </mesh>
            <mesh material={material('darkFrame')} position={[0.45, 4.95, 0]}>
              <boxGeometry args={[0.9, 0.08, 0.08]} />
            </mesh>
            <mesh material={material('darkFrame')} position={[0.85, 4.85, 0]}>
              <boxGeometry args={[0.45, 0.14, 0.28]} />
            </mesh>
            <mesh material={material('lamp')} position={[0.85, 4.76, 0]}>
              <boxGeometry args={[0.38, 0.04, 0.22]} />
            </mesh>
          </group>
        </group>
      ))}
    </RigidBody>
  )
}

// Poles in a row with three lines slung between each pair; `ends` are extra poles beyond the walls (visual only)
export function PowerLines({ poles, ends = [], height = 8.5 }: { poles: XZ[]; ends?: XZ[]; height?: number }) {
  const wires = useMemo(() => {
    const all: XZ[] = ends.length
      ? [ends[0], ...poles, ...ends.slice(1)]
      : [[poles[0][0] - 10, poles[0][1] + 1], ...poles, [poles[poles.length - 1][0] + 10, poles[poles.length - 1][1] + 1]]
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < all.length - 1; i++) {
      // The crossbar runs across the line, so the wires fan out to either side of it
      const dx = all[i + 1][0] - all[i][0]
      const dz = all[i + 1][1] - all[i][1]
      const len = Math.hypot(dx, dz) || 1
      const side: XZ = [-dz / len, dx / len]
      for (const k of [-0.7, 0, 0.7]) {
        const a = new THREE.Vector3(all[i][0] + side[0] * k, height - 0.35, all[i][1] + side[1] * k)
        const b = new THREE.Vector3(all[i + 1][0] + side[0] * k, height - 0.35, all[i + 1][1] + side[1] * k)
        const mid = a.clone().add(b).multiplyScalar(0.5)
        mid.y -= 0.9
        parts.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.025, 4))
      }
    }
    // Each pole turned so its crossbar lies across the line
    const turns = all.map((_, i) => {
      const [q, r] = [all[Math.max(0, i - 1)], all[Math.min(all.length - 1, i + 1)]]
      return -Math.atan2(r[1] - q[1], r[0] - q[0])
    })
    return { geometry: mergeGeometries(parts)!, all, turns }
  }, [poles, ends, height])
  return (
    <RigidBody type="fixed" colliders={false}>
      {poles.map(([x, z], i) => (
        <CylinderCollider key={`c${i}`} args={[height / 2, 0.16]} position={[x, height / 2, z]} />
      ))}
      {wires.all.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, wires.turns[i], 0]}>
          <mesh material={poleWood} position={[0, height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.17, height, 8]} />
          </mesh>
          <mesh material={poleWood} position={[0, height - 0.3, 0]}>
            <boxGeometry args={[0.12, 0.12, 1.8]} />
          </mesh>
          {[-0.7, 0, 0.7].map((dz) => (
            <mesh key={dz} material={material('frame')} position={[0, height - 0.18, dz]}>
              <cylinderGeometry args={[0.04, 0.05, 0.14, 6]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh geometry={wires.geometry} material={material('wire')} />
    </RigidBody>
  )
}

// Each team's starting spots, painted on the ground as rings in its colour
export function StartMarks({ teams }: { teams: { at: P3[]; colour: string }[] }) {
  return (
    <>
      {teams.flatMap((team, t) =>
        team.at.map(([x, , z], i) => (
          <mesh key={`${t}-${i}`} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.42, 0.55, 28]} />
            <meshStandardMaterial color={team.colour} roughness={0.8} />
          </mesh>
        )),
      )}
    </>
  )
}
