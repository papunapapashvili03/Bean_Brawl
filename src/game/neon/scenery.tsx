import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { NEON } from './course'
import { HotAirBalloon } from './obstacles'
import { neon } from './neonMaterial'
import { SKY_COLOR, billboardTexture, circuitTexture, circuitTime, seeded, windowTexture } from './sceneryKit'

// The neon city's scenery, shared by Neon Circuit and Neon Showdown: the circuit-board floor with rings of
// light pulsing across it, towers with lit windows, giant neon arches, billboards and drifting balloons.

// Advances the floor's light rings (see circuitTime)
export function CircuitClock() {
  useFrame((state) => {
    circuitTime.value = state.clock.elapsedTime
  })
  return null
}

// Circuit floor with rings of light pulsing outward from `center`, fading into the night with distance (unlit:
// for a floor far below the course)
export function CircuitFloor({ center, y }: { center: [number, number]; y: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: circuitTexture() },
          uTime: circuitTime,
          uFog: { value: new THREE.Color(SKY_COLOR) },
          uCenter: { value: new THREE.Vector2(...center) },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec2 vWorld;
          varying float vDist;
          void main() {
            vUv = uv;
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xz;
            vec4 view = viewMatrix * world;
            vDist = -view.z;
            gl_Position = projectionMatrix * view;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform float uTime;
          uniform vec3 uFog;
          uniform vec2 uCenter;
          varying vec2 vUv;
          varying vec2 vWorld;
          varying float vDist;
          void main() {
            vec3 board = texture2D(uMap, vUv * 6.0).rgb;
            float ring = 0.5 + 0.5 * sin(length(vWorld - uCenter) * 0.08 - uTime * 2.0);
            vec3 color = board * (0.55 + 1.6 * ring * ring);
            gl_FragColor = vec4(mix(color, uFog, smoothstep(120.0, 420.0, vDist)), 1.0);
          }
        `,
      }),
    [center],
  )
  return (
    <>
      <CircuitClock />
      <mesh material={material} position={[center[0], y, center[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[900, 900]} />
      </mesh>
    </>
  )
}

export type SkylineProps = {
  floorY: number // where the towers stand
  area: [number, number, number, number] // x0, x1, z0, z1 to scatter them over
  blocked: (x: number, z: number, width: number) => boolean // keep clear (the course, the arena)
  count?: number
  height?: [number, number]
  trims?: number // share of towers with glowing neon strips up their corners and round the roof
}

const TRIM_COLORS = [NEON.cyan, NEON.pink, NEON.yellow, NEON.purple]
const TOWER_HEIGHT: [number, number] = [15, 67]

// City towers with lit windows, kept clear of where the game is played
export function Skyline({ floorY, area, blocked, count = 170, height = TOWER_HEIGHT, trims = 0 }: SkylineProps) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const strips = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: windowTexture(), toneMapped: false }), [])
  // A unit box's four vertical corner edges and the band round its top, glowing (tinted per tower)
  const trim = useMemo(() => {
    const t = 0.03
    const parts: THREE.BufferGeometry[] = []
    for (const [x, z] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ])
      parts.push(new THREE.BoxGeometry(t, 1, t).translate(x, 0, z))
    parts.push(new THREE.BoxGeometry(1 + t, 0.012, t).translate(0, 0.5, -0.5), new THREE.BoxGeometry(1 + t, 0.012, t).translate(0, 0.5, 0.5))
    parts.push(new THREE.BoxGeometry(t, 0.012, 1 + t).translate(-0.5, 0.5, 0), new THREE.BoxGeometry(t, 0.012, 1 + t).translate(0.5, 0.5, 0))
    return {
      geometry: mergeGeometries(parts)!,
      material: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4), toneMapped: false }),
    }
  }, [])
  useLayoutEffect(() => {
    const [x0, x1, z0, z1] = area
    const rand = seeded(5)
    const dummy = new THREE.Object3D()
    const tint = new THREE.Color()
    const tints = ['#ffffff', '#b8a8ff', '#9fe8ff', '#ffc2f0']
    let placed = 0
    let trimmed = 0
    for (let tries = 0; placed < count && tries < 3000; tries++) {
      const x = x0 + rand() * (x1 - x0)
      const z = z1 - rand() * (z1 - z0)
      const w = 8 + rand() * 14
      if (blocked(x, z, w)) continue
      const h = height[0] + rand() * (height[1] - height[0])
      dummy.position.set(x, floorY + h / 2, z)
      dummy.scale.set(w, h, 8 + rand() * 14)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(placed, dummy.matrix)
      mesh.current!.setColorAt(placed, tint.set(tints[placed % tints.length]).multiplyScalar(1.4))
      // Every so often, outline the tower in neon (just outside its walls)
      if (strips.current && (placed * 0.618) % 1 < trims) {
        dummy.scale.x += 0.3
        dummy.scale.z += 0.3
        dummy.updateMatrix()
        strips.current.setMatrixAt(trimmed, dummy.matrix)
        strips.current.setColorAt(trimmed, tint.set(TRIM_COLORS[trimmed % TRIM_COLORS.length]))
        trimmed++
      }
      placed++
    }
    mesh.current!.count = placed
    mesh.current!.instanceMatrix.needsUpdate = true
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true
    if (strips.current) {
      strips.current.count = trimmed
      strips.current.instanceMatrix.needsUpdate = true
      if (strips.current.instanceColor) strips.current.instanceColor.needsUpdate = true
    }
  }, [area, blocked, count, floorY, height, trims])
  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, material, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {trims > 0 && <instancedMesh ref={strips} args={[trim.geometry, trim.material, count]} frustumCulled={false} />}
    </>
  )
}

// Big neon half-rings standing out in the city
export function NeonArch({
  position,
  radii,
  colors,
  tube = 0.9,
  rotationY = 0,
}: {
  position: [number, number, number]
  radii: number[]
  colors: string[]
  tube?: number
  rotationY?: number
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {radii.map((r, i) => (
        <mesh key={r} material={neon(colors[i % colors.length], 2.6)}>
          <torusGeometry args={[r, tube, 12, 80, Math.PI]} />
        </mesh>
      ))}
    </group>
  )
}

// A billboard up on two glowing poles
export function Billboard({ position, rotationY = 0, lines }: { position: [number, number, number]; rotationY?: number; lines?: string[] }) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: billboardTexture(lines), toneMapped: false }), [lines])
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh material={material}>
        <planeGeometry args={[12, 6]} />
      </mesh>
      {[-4, 4].map((x) => (
        <mesh key={x} position={[x, -9, -0.2]} material={neon(NEON.purple, 1.2)}>
          <boxGeometry args={[0.4, 12, 0.4]} />
        </mesh>
      ))}
    </group>
  )
}

const skyBalloonLooks = ['#ff3d5a', '#ffb547', '#ff4fd8', '#3de8ff'].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.6 }),
)

// Hot-air balloons drifting in the distance (pass stable spots)
export function SkyBalloons({ spots }: { spots: [number, number, number][] }) {
  const group = useRef<THREE.Group>(null)
  useFrame((state) => {
    group.current!.children.forEach((child, i) => {
      child.position.y = spots[i][1] + Math.sin(state.clock.elapsedTime * 0.5 + i) * 1.2
    })
  })
  return (
    <group ref={group}>
      {spots.map((p, i) => (
        <group key={i} position={p}>
          <HotAirBalloon material={skyBalloonLooks[i % skyBalloonLooks.length]} />
          <mesh position={[0, 0, 0]} material={skyBalloonLooks[(i + 1) % skyBalloonLooks.length]}>
            <boxGeometry args={[1.4, 1, 1.4]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
