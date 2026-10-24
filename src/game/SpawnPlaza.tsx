import * as THREE from 'three'
import { PLAZA } from './spawn'

// The playground's spawn plaza, painted on the floor (where it is, and where on it each bean starts: ./spawn)

const padLook = new THREE.MeshStandardMaterial({ color: '#ffb3e6', roughness: 0.9 })
const lineLook = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 })
const LINE = 0.25
const flat = (turn = 0) => [-Math.PI / 2, 0, turn] as const

// Chevrons by the pad's front edge, pointing the way to the playground (-z)
const ARROW = 1.2
const ARROWS_X = [-6, 0, 6]

export function SpawnPlaza() {
  const w = PLAZA.x1 - PLAZA.x0
  const d = PLAZA.z1 - PLAZA.z0
  const cx = (PLAZA.x0 + PLAZA.x1) / 2
  const cz = (PLAZA.z0 + PLAZA.z1) / 2
  const front = PLAZA.z0 + 1.6
  return (
    <group>
      <mesh material={padLook} position={[cx, 0.005, cz]} rotation={flat()} receiveShadow>
        <planeGeometry args={[w, d]} />
      </mesh>
      {/* Its border */}
      {[PLAZA.z0, PLAZA.z1].map((z) => (
        <mesh key={`z${z}`} material={lineLook} position={[cx, 0.012, z]} rotation={flat()} receiveShadow>
          <planeGeometry args={[w + LINE, LINE]} />
        </mesh>
      ))}
      {[PLAZA.x0, PLAZA.x1].map((x) => (
        <mesh key={`x${x}`} material={lineLook} position={[x, 0.012, cz]} rotation={flat()} receiveShadow>
          <planeGeometry args={[LINE, d + LINE]} />
        </mesh>
      ))}
      {ARROWS_X.map((x) =>
        [-1, 1].map((side) => (
          <mesh key={`${x},${side}`} material={lineLook} position={[x + (side * ARROW) / 2, 0.012, front - ARROW / 2]} rotation={flat((-side * Math.PI) / 4)} receiveShadow>
            <planeGeometry args={[ARROW * Math.SQRT2 + 0.3, 0.35]} />
          </mesh>
        )),
      )}
    </group>
  )
}
