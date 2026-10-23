import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { PHYSICS_PRIORITY, Player } from '../Player'
import { checkerTexture, paint } from '../race/materials'
import { Block, Strip } from '../race/parts'
import { STEP, raceClock, raceRules, startRace } from '../race/race'
import { RaceBots } from '../race/bots/RaceBots'
import { CheckpointFlag, Confetti, FollowSun, MatchClock } from '../race/RaceKit'
import {
  COLORS,
  FINISH_Z,
  SLIME_START,
  SPAWN,
  START_ISLAND,
  TIERS,
  TOWER_COURSE,
  slimeLevel,
} from './course'
import { TowerLedges } from './ledges'
import { BOT_STARTS, TOWER_ROUTE, botLane } from './route'
import { BumperDeck, CannonGallery, Pillars, PropellerSummit, RollerBridge, Switchbacks } from './obstacles'

// Falling in the slime (feet under the surface) sends you back to your checkpoint
const fallY = () => slimeLevel(raceClock()) + 0.8
const TOWER_RULES = raceRules({ fallY })
const BOT_RULES = { fallY }
const BOTS = 9

const SLIME_CENTER: [number, number] = [0, -20]
const SLIME_RADIUS = 62

const slimeMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    void main() {
      vec2 p = vUv * 46.0;
      float n = noise(p + vec2(uTime * 0.25, uTime * 0.1)) * 0.6 + noise(p * 2.3 - uTime * 0.4) * 0.4;
      vec3 color = mix(vec3(0.82, 0.22, 0.72), vec3(1.0, 0.58, 0.95), smoothstep(0.35, 0.8, n));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
})

// Pink slime lake around the tower, rising with the match clock
function Slime() {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    slimeMaterial.uniforms.uTime.value = state.clock.elapsedTime
    mesh.current!.position.y = slimeLevel(raceClock())
  })
  return (
    <mesh
      ref={mesh}
      material={slimeMaterial}
      position={[SLIME_CENTER[0], SLIME_START, SLIME_CENTER[1]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <circleGeometry args={[SLIME_RADIUS, 64]} />
    </mesh>
  )
}

// Chunky lime islands around the slime lake, kept clear of the course
function LimeIslands() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const count = 140
  useLayoutEffect(() => {
    let seed = 11
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const limes = ['#9be15d', '#b6f07a', '#86d44a', '#c5f58a']
    let placed = 0
    for (let tries = 0; placed < count && tries < 2000; tries++) {
      const a = rand() * Math.PI * 2
      const r = 34 + rand() * 60
      const x = SLIME_CENTER[0] + Math.cos(a) * r
      const z = SLIME_CENTER[1] + Math.sin(a) * r
      if (Math.abs(x) < 17 && z > -95 && z < 52) continue
      const w = 4 + rand() * 7
      const h = 1 + rand() * 7
      dummy.position.set(x, h / 2 - 1.5, z)
      dummy.rotation.set(0, rand() * Math.PI, 0)
      dummy.scale.set(w, h, 4 + rand() * 7)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(placed, dummy.matrix)
      mesh.current!.setColorAt(placed, color.set(limes[placed % limes.length]))
      placed++
    }
    mesh.current!.count = placed
    mesh.current!.instanceMatrix.needsUpdate = true
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} castShadow receiveShadow frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  )
}

function Tier({ tier }: { tier: { min: [number, number, number]; max: [number, number, number] } }) {
  return <Block min={tier.min} max={tier.max} color={COLORS.wall} top={COLORS.top} trim={COLORS.trim} />
}

// Round portholes in yellow frames, like speaker grilles on the tower walls
function Porthole({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh material={paint('#ffd23f')}>
        <torusGeometry args={[0.7, 0.14, 10, 28]} />
      </mesh>
      <mesh material={paint('#15152a')} position={[0, 0, -0.02]}>
        <circleGeometry args={[0.7, 28]} />
      </mesh>
    </group>
  )
}

function FinishArch() {
  const y = TIERS.summit.max[1]
  const line = useMemo(() => checkerTexture(12, 2), [])
  return (
    <group>
      {[-4.7, 4.7].map((x) => (
        <mesh key={x} material={paint(COLORS.trim)} position={[x, y + 2.8, FINISH_Z]} castShadow>
          <boxGeometry args={[0.8, 5.6, 0.8]} />
        </mesh>
      ))}
      <mesh material={paint('#ffd23f')} position={[0, y + 5.8, FINISH_Z]} castShadow>
        <boxGeometry args={[10.2, 1, 0.9]} />
      </mesh>
      <Strip y={y} z={FINISH_Z} width={9} depth={1.2} map={line} />
    </group>
  )
}

export function TowerScene() {
  useLayoutEffect(() => {
    startRace(TOWER_COURSE)
  }, [])

  return (
    <>
      <Sky sunPosition={[50, 70, 60]} turbidity={3} rayleigh={0.8} mieCoefficient={0.003} mieDirectionalG={0.8} />
      <fog attach="fog" args={['#bfe3ff', 110, 320]} />
      <hemisphereLight args={['#e8f6ff', '#9be15d', 0.9]} />
      <FollowSun offset={[20, 34, 18]} />

      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial color="#3fa9f5" roughness={0.3} metalness={0.1} />
      </mesh>
      <Slime />
      <LimeIslands />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <Block min={START_ISLAND.min} max={START_ISLAND.max} color={COLORS.lime} top={COLORS.limeTop} />
        <Pillars />
        {Object.values(TIERS).map((tier, i) => (
          <Tier key={i} tier={tier} />
        ))}
        <Switchbacks />
        <TowerLedges />
        <CannonGallery />
        <BumperDeck />
        <RollerBridge />
        <PropellerSummit />
        <Player spawn={SPAWN} rules={TOWER_RULES} />
        <RaceBots route={TOWER_ROUTE} starts={BOT_STARTS} count={BOTS} rules={BOT_RULES} lane={botLane} />
      </Physics>

      {[-5.5, 5.5].map((x) => (
        <Porthole key={x} position={[x, 20.5, TIERS.bumpers.max[2] + 0.05]} />
      ))}
      {TOWER_COURSE.checkpoints.map((c, i) => (
        <CheckpointFlag key={i} position={[c.respawn[0] + 2.2, c.respawn[1] - 1.3, c.respawn[2]]} />
      ))}
      <FinishArch />
      <Confetti origin={[0, TIERS.summit.max[1] + 6, FINISH_Z]} />
    </>
  )
}
