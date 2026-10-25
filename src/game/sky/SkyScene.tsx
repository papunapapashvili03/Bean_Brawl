import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { roundRandom } from '../roundSeed'
import { Sky } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { PHYSICS_PRIORITY, Player } from '../Player'
import { checkerTexture, paint } from '../race/materials'
import { Slab, Strip } from '../race/parts'
import { STEP, getRaceView, raceRules, startRace, subscribeRace } from '../race/race'
import { RaceBots } from '../race/bots/RaceBots'
import { MatchClock } from '../race/RaceKit'
import { CoinCascade } from './CoinCascade'
import { ConveyorVault } from './ConveyorVault'
import {
  CHECKPOINTS,
  FALL_Y,
  PLAYER_SLOT,
  PLAYER_SPAWN,
  SKY_COURSE,
  START,
  START_SLOTS,
  WIDTH,
  floorY,
  pickDoorLayout,
} from './course'
import { DoorMaze } from './DoorMaze'
import { FinalClimb } from './FinalClimb'
import { BOT_STARTS, SKY_ROUTE, botLane } from './route'
import { StartingRamp } from './StartingRamp'

const SKY_RULES = raceRules({ fallY: FALL_Y })
const BOT_RULES = { fallY: FALL_Y }
const BOTS = 15

function CountdownLamps() {
  const view = useSyncExternalStore(subscribeRace, getRaceView)
  const red = paint('#e23b4e')
  const green = paint('#7cf08a')
  const off = paint('#4a4458')
  const lit = view.count === null ? 4 : 4 - view.count
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[(i - 1.5) * 1.6, 7.9, 0.45]}
          material={view.count === null ? green : i < lit ? red : off}
        >
          <sphereGeometry args={[0.45, 16, 12]} />
        </mesh>
      ))}
    </>
  )
}

function StartArea() {
  const line = useMemo(() => checkerTexture(22, 1), [])
  const post = paint('#ffd23f')
  const half = WIDTH / 2 + 0.8
  return (
    <group>
      <Slab z0={START.zBack} y0={START.y} z1={START.zFront} y1={START.y} top="#ffb3e0" />
      {START_SLOTS.map(([x, z], i) => (
        <mesh key={i} position={[x, START.y + 0.03, z]} receiveShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 24]} />
          <meshStandardMaterial color={i === PLAYER_SLOT ? '#ffd23f' : i % 2 ? '#c7a6ff' : '#9fd8ff'} />
        </mesh>
      ))}
      <Strip y={START.y} z={START.zFront + 0.6} width={WIDTH} depth={1} map={line} />
      <group position={[0, START.y, START.zFront - 0.3]}>
        {[-half, half].map((x) => (
          <mesh key={x} material={post} position={[x, 4, 0]} castShadow>
            <boxGeometry args={[0.8, 8, 0.8]} />
          </mesh>
        ))}
        <mesh material={paint('#8a5cf6')} position={[0, 7.9, 0]} castShadow>
          <boxGeometry args={[half * 2 + 0.8, 1.4, 0.8]} />
        </mesh>
        <CountdownLamps />
      </group>
    </group>
  )
}

function CheckpointArch({ z }: { z: number }) {
  const y = floorY(z)
  const half = WIDTH / 2 + 0.7
  const mint = paint('#7cf08a')
  return (
    <group position={[0, y, z]}>
      {[-half, half].map((x) => (
        <mesh key={x} material={mint} position={[x, 3.5, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 7, 12]} />
        </mesh>
      ))}
      <mesh material={paint('#1f7a4a')} position={[0, 7, 0]}>
        <boxGeometry args={[half * 2, 0.8, 0.3]} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} material={i % 2 ? mint : paint('#ffffff')} position={[-half + 1.2 + i * 2.35, 6.3, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.55, 0.9, 3]} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WIDTH, 0.6]} />
        <meshStandardMaterial color="#7cf08a" emissive="#7cf08a" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// A sea of clouds far below the course, drifting slowly
function CloudSea() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const group = useRef<THREE.Group>(null)
  const count = 320
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D()
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < count; i++) {
      const cluster = Math.floor(i / 8)
      const cx = (rand() - 0.5) * 320 + (cluster % 2 ? 40 : -40)
      const cz = 60 - rand() * 360
      const cy = -32 - rand() * 30
      dummy.position.set(cx + (rand() - 0.5) * 14, cy + rand() * 4, cz + (rand() - 0.5) * 10)
      dummy.scale.setScalar(4 + rand() * 6)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    }
    mesh.current!.instanceMatrix.needsUpdate = true
  }, [])
  useFrame((_, delta) => {
    group.current!.position.x += delta * 0.6
  })
  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={1} emissive="#dfefff" emissiveIntensity={0.25} flatShading />
      </instancedMesh>
    </group>
  )
}

const SUN_OFFSET = new THREE.Vector3(18, 32, 14)

// The course is ~200 m long, so the shadow camera follows the player instead of covering everything
function Sun() {
  const light = useRef<THREE.DirectionalLight>(null)
  useFrame(({ camera }) => {
    const l = light.current!
    l.target.position.set(camera.position.x, camera.position.y - 5, camera.position.z - 10)
    l.target.updateMatrixWorld()
    l.position.copy(l.target.position).add(SUN_OFFSET)
  })
  return (
    <directionalLight
      ref={light}
      intensity={2.1}
      color="#fff4df"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-30}
      shadow-camera-right={30}
      shadow-camera-top={30}
      shadow-camera-bottom={-30}
      shadow-camera-far={120}
      shadow-bias={-0.0005}
    />
  )
}

export function SkyScene() {
  const [doorLayout] = useState(() => pickDoorLayout(roundRandom('sky-doors')))
  useLayoutEffect(() => {
    startRace(SKY_COURSE)
  }, [])

  return (
    <>
      <Sky sunPosition={[60, 80, 40]} turbidity={3} rayleigh={0.9} mieCoefficient={0.003} mieDirectionalG={0.8} />
      <fog attach="fog" args={['#cfe9ff', 120, 330]} />
      <hemisphereLight args={['#eaf6ff', '#b3a6d9', 0.9]} />
      <Sun />
      <CloudSea />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <StartArea />
        <StartingRamp />
        <CoinCascade />
        <ConveyorVault />
        <DoorMaze layout={doorLayout} />
        <FinalClimb />
        {CHECKPOINTS.map((c) => (
          // Just past the trigger line, so the 70 m arch clears the coin release arch
          <CheckpointArch key={c.z} z={c.z - 1.2} />
        ))}
        <Player spawn={PLAYER_SPAWN} rules={SKY_RULES} />
        <RaceBots route={SKY_ROUTE} starts={BOT_STARTS} count={BOTS} rules={BOT_RULES} lane={botLane} />
      </Physics>
    </>
  )
}
