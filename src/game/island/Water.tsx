import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import {
  CLIFF_TOP_Z,
  POOL,
  RIVER_LEVEL,
  RIVER_START_Z,
  RIVER_WIDTH,
  SEA_LEVEL,
  terrainHeight,
} from './terrain'

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
`

// Shared clock for every water shader, advanced once per frame by <Waterfall>
const waterTime = { value: 0 }

// Streaky flowing water. uv.x runs across the stream (0..1), uv.y is distance along it in world units.
function createFlowMaterial(opts: { color: string; speed: number; foam: number; width: number; length: number }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: waterTime,
      uColor: { value: new THREE.Color(opts.color) },
      uSpeed: { value: opts.speed },
      uFoam: { value: opts.foam },
      uWidth: { value: opts.width },
      uLength: { value: opts.length },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpeed, uFoam, uWidth, uLength;
      uniform vec3 uColor;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        vec2 p = vec2(vUv.x * uWidth, vUv.y - uTime * uSpeed);
        float streaks = noise(p * vec2(2.2, 0.35)) * 0.6 + noise(p * vec2(6.0, 0.9) + 7.3) * 0.5;
        float foam = smoothstep(0.55, 0.95, streaks) * uFoam;
        foam += smoothstep(uLength - 3.0, uLength, vUv.y) * 0.7;
        vec3 color = mix(uColor, vec3(1.0), clamp(foam, 0.0, 1.0));
        gl_FragColor = vec4(color, edge * (0.7 + 0.3 * clamp(foam, 0.0, 1.0)));
      }
    `,
  })
}

// Ribbon along the path water takes when it leaves the lip: forward at constant speed, falling under gravity.
// Points are pushed out from the cliff wherever the arc would clip into it.
function buildFallGeometry(width: number) {
  const points: THREE.Vector3[] = []
  const speed = 3.2
  const g = 9.8
  for (let t = 0; ; t += 0.04) {
    const z = CLIFF_TOP_Z + speed * t
    let y = RIVER_LEVEL - 0.5 * g * t * t
    const ground = Math.max(terrainHeight(-width / 3, z), terrainHeight(0, z), terrainHeight(width / 3, z))
    y = Math.max(y, ground + 0.25)
    if (y <= POOL.level) {
      points.push(new THREE.Vector3(0, POOL.level, z))
      break
    }
    points.push(new THREE.Vector3(0, y, z))
  }

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let dist = 0
  points.forEach((p, i) => {
    if (i > 0) dist += p.distanceTo(points[i - 1])
    positions.push(-width / 2, p.y, p.z, width / 2, p.y, p.z)
    uvs.push(0, dist, 1, dist)
    if (i > 0) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return { geometry: geo, length: dist, impactZ: points[points.length - 1].z }
}

function buildRiverGeometry(width: number, length: number) {
  const geo = new THREE.PlaneGeometry(width, length, 1, 1)
  geo.rotateX(-Math.PI / 2)
  // Remap uv.y to world distance, increasing downstream (towards the lip at +z)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, (1 - uv.getY(i)) * length)
  return geo
}

const foamMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: waterTime },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    ${NOISE_GLSL}
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c) * 2.0;
      float a = atan(c.y, c.x);
      float n = noise(vec2(a * 3.0, r * 5.0 - uTime * 2.2)) * 0.6 + noise(vec2(a * 7.0, r * 9.0 - uTime * 3.0)) * 0.4;
      float alpha = smoothstep(1.0, 0.25, r) * smoothstep(0.35, 0.65, n);
      gl_FragColor = vec4(vec3(1.0), alpha * 0.9);
    }
  `,
})

const RIVER_LENGTH = CLIFF_TOP_Z - RIVER_START_Z

export function Waterfall() {
  const fall = useMemo(() => buildFallGeometry(RIVER_WIDTH), [])
  const riverGeometry = useMemo(() => buildRiverGeometry(RIVER_WIDTH, RIVER_LENGTH), [])

  const fallMaterial = useMemo(
    () => createFlowMaterial({ color: '#8fdcff', speed: 7, foam: 1, width: RIVER_WIDTH, length: fall.length }),
    [fall.length],
  )
  const riverMaterial = useMemo(
    () => createFlowMaterial({ color: '#3fb8d8', speed: 2.2, foam: 0.35, width: RIVER_WIDTH, length: 1e6 }),
    [],
  )

  useFrame((state) => {
    waterTime.value = state.clock.elapsedTime
  })

  return (
    <group>
      <mesh
        geometry={riverGeometry}
        material={riverMaterial}
        position={[0, RIVER_LEVEL, (CLIFF_TOP_Z + RIVER_START_Z) / 2]}
      />
      <mesh geometry={fall.geometry} material={fallMaterial} />

      {/* Plunge pool */}
      <mesh position={[POOL.x, POOL.level, POOL.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[POOL.radius + 1, 48]} />
        <meshStandardMaterial color="#35c2dd" transparent opacity={0.82} roughness={0.1} metalness={0.1} />
      </mesh>
      <mesh
        position={[0, POOL.level + 0.03, fall.impactZ + 0.8]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={foamMaterial}
      >
        <planeGeometry args={[RIVER_WIDTH + 5, 7]} />
      </mesh>
      <Sparkles
        count={160}
        scale={[RIVER_WIDTH + 3, 5, 5]}
        position={[0, POOL.level + 2.2, fall.impactZ]}
        size={9}
        speed={0.8}
        opacity={0.8}
        color="#ffffff"
      />
    </group>
  )
}

export function Ocean() {
  return (
    <mesh position={[0, SEA_LEVEL, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1200, 1200]} />
      <meshStandardMaterial color="#1fb5c9" transparent opacity={0.85} roughness={0.15} metalness={0.1} />
    </mesh>
  )
}
