import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { CloudSea } from '../crumble/Scenery'
import { PHYSICS_PRIORITY, Player } from '../Player'
import { checkerTexture, paint } from '../race/materials'
import { Block, Strip } from '../race/parts'
import { STEP, getRaceView, raceRules, startRace, subscribeRace } from '../race/race'
import { RaceBots } from '../race/bots/RaceBots'
import { Confetti, FollowSun, MatchClock } from '../race/RaceKit'
import { BlowerBridge } from './Blower'
import { Climb } from './Climb'
import {
  BRIDGE,
  COLORS,
  FALL_Y,
  FAN_DECK,
  FINISH_DECK,
  FINISH_Z,
  HALF,
  PLAYER_SLOT,
  ROTOR,
  ROTOR_ENTRY,
  SPAWN,
  STAIRS_TOP,
  START_DECK,
  START_SLOTS,
  TOP_1,
  TOP_2,
  TOP_3,
  TOP_4,
  WALL_FOOT,
  WALL_TOP,
  WHIRLY_COURSE,
  WIDTH,
  WINDMILL_FOOT,
  type Box,
} from './course'
import { SpinningDiscs } from './Discs'
import { FanDeck } from './Fans'
import { RotorRide } from './Rotor'
import { RotorHop } from './RotorHop'
import { BOT_STARTS, WHIRLY_ROUTE, botLane } from './route'
import { WhirlygigStairs } from './Whirlygigs'
import { WindmillWall } from './WindmillWall'

// Spin Cycle: a race high in a pastel sky, over spinning discs, up a climbing wall, through two rows of
// giant fans, over a windswept bridge, round a giant rotor, up a wall of windmills, up a stairway under three
// whirlygigs and across a string of little spinning discs to the line (see ./course for the layout). Wide
// enough for 30 at the start.

const RULES = raceRules({ fallY: FALL_Y })
const BOT_RULES = { fallY: FALL_Y }
const BOTS = 15
const HORIZON = '#f7d3ec'

function Deck({ box, top = COLORS.floor }: { box: Box; top?: string }) {
  return <Block min={box.min} max={box.max} color={COLORS.side} top={top} trim={COLORS.trim} />
}

function CountdownLamps() {
  const view = useSyncExternalStore(subscribeRace, getRaceView)
  const lit = view.count === null ? 4 : 4 - view.count
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[(i - 1.5) * 1.6, 7.9, 0.45]} material={paint(view.count === null ? '#7cf08a' : i < lit ? '#e23b4e' : '#4a4458')}>
          <sphereGeometry args={[0.45, 16, 12]} />
        </mesh>
      ))}
    </>
  )
}

// The start grid: 30 slots (yours in yellow), the chequered line, and an arch with the countdown lamps
function StartArea() {
  const line = useMemo(() => checkerTexture(24, 1), [])
  const half = HALF + 0.8
  return (
    <group>
      {START_SLOTS.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.03, z]} receiveShadow material={paint(i === PLAYER_SLOT ? '#ffd23f' : '#ffffff')}>
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
        <mesh material={paint(COLORS.pink)} position={[0, 7.9, 0]} castShadow>
          <boxGeometry args={[half * 2 + 0.8, 1.4, 0.8]} />
        </mesh>
        <CountdownLamps />
      </group>
    </group>
  )
}

// A mint arch across the course where a checkpoint starts (as wide as the course there)
function CheckpointArch({ z, y = 0, half = HALF + 0.7 }: { z: number; y?: number; half?: number }) {
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
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[(half - 0.7) * 2, 0.6]} />
        <meshStandardMaterial color="#7cf08a" emissive="#7cf08a" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// The finish: a pink and yellow arch over a chequered line
function FinishArch() {
  const line = useMemo(() => checkerTexture(24, 2), [])
  const half = HALF + 0.8
  return (
    <group>
      {[-half, half].map((x) => (
        <mesh key={x} material={paint(COLORS.pink)} position={[x, TOP_4 + 3.5, FINISH_Z]} castShadow>
          <boxGeometry args={[0.9, 7, 0.9]} />
        </mesh>
      ))}
      <mesh material={paint(COLORS.trim)} position={[0, TOP_4 + 7.3, FINISH_Z]} castShadow>
        <boxGeometry args={[half * 2 + 0.9, 1.3, 1]} />
      </mesh>
      <Strip y={TOP_4} z={FINISH_Z} width={WIDTH} depth={1.4} map={line} />
    </group>
  )
}

// White lines painted along the decks
function LaneLines() {
  return (
    <group>
      {[-6, 6].map((x) => (
        <group key={x}>
          <Strip x={x} y={0} z={7} width={0.25} depth={14} color={COLORS.lane} />
          <Strip x={x} y={TOP_1} z={(FAN_DECK.min[2] + FAN_DECK.max[2]) / 2} width={0.25} depth={FAN_DECK.max[2] - FAN_DECK.min[2] - 1} color={COLORS.lane} />
          <Strip x={x} y={TOP_4} z={(FINISH_DECK.min[2] + FINISH_DECK.max[2]) / 2} width={0.25} depth={FINISH_DECK.max[2] - FINISH_DECK.min[2] - 1} color={COLORS.lane} />
        </group>
      ))}
    </group>
  )
}

// The sky: blue overhead, fading to pink at the horizon
const SKY_DOME = (() => {
  const g = new THREE.SphereGeometry(500, 32, 16)
  const top = new THREE.Color('#8fcfff')
  const low = new THREE.Color(HORIZON)
  const colours: number[] = []
  const p = g.getAttribute('position')
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const k = THREE.MathUtils.clamp(p.getY(i) / 260, 0, 1)
    c.copy(low).lerp(top, Math.sqrt(k))
    colours.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  return g
})()
const SKY_LOOK = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })

// Hot air balloons drifting either side of the course, bobbing gently
const BALLOONS = [
  { x: -42, y: 10, z: -10, colour: '#9fb4ff', band: '#ffd23f' },
  { x: 46, y: 16, z: -30, colour: '#ff9fc9', band: '#ffffff' },
  { x: -50, y: 22, z: -70, colour: '#ffd27a', band: '#ff6fb1' },
  { x: 40, y: 6, z: -95, colour: '#b5f0d0', band: '#8a5cf6' },
  { x: -36, y: 14, z: -125, colour: '#ffb3a1', band: '#4fc3ff' },
  { x: 55, y: 26, z: -140, colour: '#c9b5ff', band: '#ffd23f' },
  { x: -48, y: 24, z: -175, colour: '#9fb4ff', band: '#ff6fb1' },
  { x: 44, y: 18, z: -205, colour: '#ffd27a', band: '#8a5cf6' },
  { x: -40, y: 30, z: -240, colour: '#b5f0d0', band: '#ffd23f' },
  { x: 52, y: 34, z: -270, colour: '#ff9fc9', band: '#ffffff' },
]
function Balloons() {
  const groups = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    groups.current.forEach((g, i) => {
      if (g) g.position.y = BALLOONS[i].y + Math.sin(t * 0.4 + i * 1.7) * 1.2
    })
  })
  return (
    <group>
      {BALLOONS.map((b, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g
          }}
          position={[b.x, b.y, b.z]}
        >
          <mesh material={paint(b.colour)} scale={[1, 1.15, 1]}>
            <sphereGeometry args={[4, 24, 18]} />
          </mesh>
          <mesh material={paint(b.band)} scale={[1.01, 0.25, 1.01]} position={[0, -0.4, 0]}>
            <sphereGeometry args={[4, 24, 8]} />
          </mesh>
          <mesh material={paint(b.colour)} position={[0, -4.6, 0]}>
            <coneGeometry args={[2.2, 2.4, 16, 1, true]} />
          </mesh>
          <mesh material={paint('#8a5a35')} position={[0, -6.6, 0]}>
            <boxGeometry args={[1.4, 1, 1.4]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function WhirlyScene() {
  useLayoutEffect(() => {
    startRace(WHIRLY_COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[HORIZON]} />
      <fog attach="fog" args={[HORIZON, 110, 320]} />
      <mesh geometry={SKY_DOME} material={SKY_LOOK} renderOrder={-1} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#ffffff', '#f3b5dc', 0.6]} />
      <FollowSun offset={[16, 30, 14]} intensity={1.7} color="#ffffff" />
      <CloudSea />
      <Balloons />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <Deck box={START_DECK} />
        <StartArea />
        <Deck box={BRIDGE} />
        <SpinningDiscs />
        <Deck box={WALL_FOOT} />
        <Climb />
        <Deck box={FAN_DECK} />
        <FanDeck />
        <BlowerBridge />
        <RotorRide />
        <Deck box={WINDMILL_FOOT} />
        <Deck box={WALL_TOP} />
        <WindmillWall />
        <WhirlygigStairs />
        <Deck box={STAIRS_TOP} />
        <RotorHop />
        <Deck box={FINISH_DECK} />
        <Player spawn={SPAWN} rules={RULES} />
        <RaceBots route={WHIRLY_ROUTE} starts={BOT_STARTS} count={BOTS} rules={BOT_RULES} lane={botLane} />
      </Physics>

      <LaneLines />
      <CheckpointArch z={WALL_FOOT.max[2] - 0.4} />
      <CheckpointArch z={FAN_DECK.max[2] - 0.8} y={TOP_1} />
      <CheckpointArch z={FAN_DECK.min[2] + 3.6} y={TOP_1} />
      <CheckpointArch z={ROTOR_ENTRY.back - 0.4} y={TOP_1} half={ROTOR.edge * Math.sin(ROTOR.span) + 0.3} />
      <CheckpointArch z={WINDMILL_FOOT.max[2] - 0.4} y={TOP_1} />
      <CheckpointArch z={WALL_TOP.max[2] - 1.2} y={TOP_2} />
      <CheckpointArch z={STAIRS_TOP.max[2] - 0.4} y={TOP_3} />
      <FinishArch />
      <Confetti origin={[0, TOP_4 + 7, FINISH_Z]} spread={WIDTH} />
    </>
  )
}
