import * as THREE from 'three'
import { CarBody } from './Car'
import { CAR_SCALE, type CarBuild, type P3 } from './kit'
import { buildBus } from './bus'
import { buildCaravan } from './caravan'
import { buildFiesta } from './fiesta'
import { buildJetta } from './jetta'
import { buildMustang } from './mustang'
import { buildYugo } from './yugo'

// A little car park at the far end of the playground


// Two rows of three bays, every car nose out towards the spawn (a car's front is its +x; turned a quarter
// turn it faces +z)
const FACING = -Math.PI / 2
const ROWS = [-48, -55.5]
const BAY_X = [-4, 0, 4]
type Bay = { build: () => CarBuild; at: P3 }
const BAYS: Bay[] = [
  { build: buildYugo, at: [BAY_X[0], 0, ROWS[0]] },
  { build: buildFiesta, at: [BAY_X[1], 0, ROWS[0]] },
  { build: buildJetta, at: [BAY_X[2], 0, ROWS[0]] },
  { build: buildMustang, at: [BAY_X[0], 0, ROWS[1]] },
  { build: buildBus, at: [BAY_X[1], 0, ROWS[1]] },
  { build: buildCaravan, at: [BAY_X[2], 0, ROWS[1]] },
]

const lineLook = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 })
const tarmac = new THREE.MeshStandardMaterial({ color: '#5b5f68', roughness: 0.95 })
const LOT = { x0: -7.5, x1: 7.5, z0: -59.3, z1: -44 }

// The lot's tarmac and white bay lines
function Markings() {
  const w = LOT.x1 - LOT.x0
  const d = LOT.z1 - LOT.z0
  return (
    <group>
      <mesh material={tarmac} position={[(LOT.x0 + LOT.x1) / 2, 0.005, (LOT.z0 + LOT.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
      </mesh>
      {ROWS.flatMap((z) =>
        [-6, -2, 2, 6].map((x) => (
          <mesh key={`${x},${z}`} material={lineLook} position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.15, 6]} />
          </mesh>
        )),
      )}
    </group>
  )
}

export function ParkingLot() {
  return (
    <group>
      <Markings />
      {BAYS.map((b, i) => (
        <CarBody key={i} build={b.build} scale={CAR_SCALE} position={b.at} yaw={FACING} />
      ))}
    </group>
  )
}
