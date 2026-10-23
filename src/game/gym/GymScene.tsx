import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { PHYSICS_PRIORITY, Player } from '../Player'
import { checkerTexture, paint } from '../race/materials'
import { Block, Strip } from '../race/parts'
import { STEP, getRaceView, raceRules, startRace, subscribeRace } from '../race/race'
import { RaceBots } from '../race/bots/RaceBots'
import { Confetti, FollowSun, MatchClock } from '../race/RaceKit'
import { ClimbWall } from './ClimbWall'
import {
  BACK_DECK,
  BOUNCE_DECK,
  COLORS,
  FALL_Y,
  FINISH_Z,
  GYM_COURSE,
  HALF,
  MONKEY_LANDING,
  PLAYER_SLOT,
  SPAWN,
  START_DECK,
  START_SLOTS,
  STORM_EXIT,
  STORM_FIELD,
  TIER_1,
  TIER_2,
  WALL_APPROACH,
  WIDTH,
  type Box,
} from './course'
import { ElevatorColumns } from './Elevators'
import { MonkeyCanyon } from './MonkeyBars'
import { BOT_STARTS, GYM_ROUTE, botLane } from './route'
import { BounceGarden } from './BouncePads'
import { ShapeStorm } from './ShapeStorm'
import { SweeperSpin } from './Sweepers'

// Jungle Gym: a candy-coloured race over monkey bars, bobbing columns, a big climbing wall, a storm of falling
// shapes, sweepers and bounce pads (see ./course for the layout). Every section is wide enough for 30.

const GYM_RULES = raceRules({ fallY: FALL_Y })
const BOT_RULES = { fallY: FALL_Y }
const BOTS = 15
const SKY = '#9fd8ff'

function Deck({ box, side }: { box: Box; side: string }) {
  return <Block min={box.min} max={box.max} color={side} top={COLORS.floor} trim={COLORS.trim} />
}

function CountdownLamps() {
  const view = useSyncExternalStore(subscribeRace, getRaceView)
  const lit = view.count === null ? 4 : 4 - view.count
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[(i - 1.5) * 1.6, 7.9, 0.45]}
          material={paint(view.count === null ? '#7cf08a' : i < lit ? '#e23b4e' : '#4a4458')}
        >
          <sphereGeometry args={[0.45, 16, 12]} />
        </mesh>
      ))}
    </>
  )
}

// The start grid: 30 slots (yours in yellow), the chequered line and an arch with the countdown lamps
function StartArea() {
  const line = useMemo(() => checkerTexture(24, 1), [])
  const half = HALF + 0.8
  return (
    <group>
      {START_SLOTS.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.03, z]} receiveShadow material={paint(i === PLAYER_SLOT ? '#ffd23f' : COLORS.candy[i % 8])}>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 24]} />
        </mesh>
      ))}
      <Strip y={0} z={0.6} width={WIDTH} depth={1} map={line} />
      <group position={[0, 0, -0.3]}>
        {[-half, half].map((x) => (
          <mesh key={x} material={paint(COLORS.trim)} position={[x, 4, 0]} castShadow>
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

// A mint arch across the course where a checkpoint starts
function CheckpointArch({ z, y = 0 }: { z: number; y?: number }) {
  const half = HALF + 0.7
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
      {Array.from({ length: 11 }, (_, i) => (
        <mesh key={i} material={paint(i % 2 ? '#7cf08a' : '#ffffff')} position={[-half + 1.2 + i * 2.3, 6.3, 0]} rotation={[0, 0, Math.PI]}>
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

function FinishArch() {
  const y = TIER_2.max[1]
  const line = useMemo(() => checkerTexture(24, 2), [])
  const half = HALF + 0.8
  return (
    <group>
      {[-half, half].map((x) => (
        <mesh key={x} material={paint('#e040fb')} position={[x, y + 3.5, FINISH_Z]} castShadow>
          <boxGeometry args={[0.9, 7, 0.9]} />
        </mesh>
      ))}
      <mesh material={paint(COLORS.trim)} position={[0, y + 7.3, FINISH_Z]} castShadow>
        <boxGeometry args={[half * 2 + 0.9, 1.3, 1]} />
      </mesh>
      <Strip y={y} z={FINISH_Z} width={WIDTH} depth={1.4} map={line} />
    </group>
  )
}

// Giant toys floating off to either side of the course: balls, cones and rings
function giantToys() {
  let seed = 41
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  return Array.from({ length: 16 }, (_, i) => ({
    kind: i % 3,
    x: (i % 2 ? 1 : -1) * (26 + rand() * 22),
    y: 2 + rand() * 18,
    z: 20 - i * 11 - rand() * 6,
    size: 2 + rand() * 3,
    color: COLORS.candy[i % COLORS.candy.length],
    spin: rand() * Math.PI,
  }))
}
const TOYS = giantToys()

// Far below and all around: candy-coloured blocks floating in the sky, and a few giant toys to either side
function Scenery() {
  const blocks = useRef<THREE.InstancedMesh>(null)
  const count = 220
  useLayoutEffect(() => {
    let seed = 23
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const size = 2 + rand() * 7
      dummy.position.set((rand() - 0.5) * 170, -16 - rand() * 40, 40 - rand() * 280)
      dummy.rotation.set(rand() * 0.6, rand() * Math.PI, rand() * 0.6)
      dummy.scale.setScalar(size)
      dummy.updateMatrix()
      blocks.current!.setMatrixAt(i, dummy.matrix)
      blocks.current!.setColorAt(i, color.set(COLORS.candy[i % COLORS.candy.length]))
    }
    blocks.current!.instanceMatrix.needsUpdate = true
    if (blocks.current!.instanceColor) blocks.current!.instanceColor.needsUpdate = true
  }, [])
  return (
    <group>
      <instancedMesh ref={blocks} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      {TOYS.map((t, i) => (
        <mesh key={i} position={[t.x, t.y, t.z]} rotation={[t.spin, t.spin * 2, 0]} material={paint(t.color)} castShadow>
          {t.kind === 0 ? (
            <sphereGeometry args={[t.size, 24, 18]} />
          ) : t.kind === 1 ? (
            <coneGeometry args={[t.size, t.size * 2, 24]} />
          ) : (
            <torusGeometry args={[t.size, t.size * 0.35, 12, 28]} />
          )}
        </mesh>
      ))}
    </group>
  )
}

export function GymScene() {
  useLayoutEffect(() => {
    startRace(GYM_COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 90, 260]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffffff', '#ffb3e6', 0.55]} />
      <FollowSun offset={[16, 30, 14]} intensity={1.7} color="#ffffff" />
      <Scenery />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <Deck box={START_DECK} side={COLORS.floorSide} />
        <StartArea />
        <MonkeyCanyon />
        <Deck box={MONKEY_LANDING} side="#3fa9f5" />
        <ElevatorColumns />
        <Deck box={WALL_APPROACH} side="#4dd4ac" />
        <ClimbWall />
        <Deck box={BACK_DECK} side="#ffa94d" />
        <Deck box={STORM_FIELD} side="#7b61ff" />
        <ShapeStorm />
        <Deck box={STORM_EXIT} side="#ff5a5f" />
        <SweeperSpin />
        <Deck box={BOUNCE_DECK} side="#b7e04a" />
        <Deck box={TIER_1} side="#3fa9f5" />
        <Deck box={TIER_2} side="#ff9ec4" />
        <BounceGarden />
        <Player spawn={SPAWN} rules={GYM_RULES} />
        <RaceBots route={GYM_ROUTE} starts={BOT_STARTS} count={BOTS} rules={BOT_RULES} lane={botLane} />
      </Physics>

      <CheckpointArch z={MONKEY_LANDING.max[2] - 0.4} />
      <CheckpointArch z={WALL_APPROACH.max[2] - 0.4} />
      <CheckpointArch z={BACK_DECK.max[2] - 1.5} />
      <CheckpointArch z={STORM_EXIT.max[2] - 0.4} />
      <CheckpointArch z={BOUNCE_DECK.max[2] - 0.4} />
      <FinishArch />
      <Confetti origin={[0, TIER_2.max[1] + 7, FINISH_Z]} spread={WIDTH} />
    </>
  )
}
