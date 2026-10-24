import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { CloudSea } from '../crumble/Scenery'
import { PHYSICS_PRIORITY, Player } from '../Player'
import { checkerTexture, paint } from '../race/materials'
import { Block, Strip } from '../race/parts'
import { STEP, getRaceView, raceRules, startRace, subscribeRace } from '../race/race'
import { RaceBots } from '../race/bots/RaceBots'
import { Confetti, FollowSun, MatchClock } from '../race/RaceKit'
import { Gates, Hurdles, Rails } from './Bars'
import {
  COLORS,
  FALL_Y,
  FINISH_DECK,
  FINISH_Z,
  GATE_DECK,
  HALF,
  HURDLE_DECK,
  OVER_COURSE,
  PLAYER_SLOT,
  SPAWN,
  START_DECK,
  START_SLOTS,
  WALL,
  WALL_DECK,
  WAVE_DECK,
  WIDTH,
  type Box,
} from './course'
import { BOT_STARTS, OVER_ROUTE, botLane } from './route'
import { Seesaws } from './Seesaws'
import { TidalWave } from './TidalWave'
import { resetWave } from './wave'
import { GreenWall } from './Wall'

// Over & Under: a straight race down a red track in the sky (see ./course): hurdles to jump, gates to slide
// under, seesaws over the void, the tidal wave's beams, and the wall that only opens for five seconds in
// fifteen. Wide enough for 30 at the start.

const RULES = raceRules({ fallY: FALL_Y })
const BOT_RULES = { fallY: FALL_Y }
const BOTS = 15
const SKY = '#8fd3ff'
const SHOULDER = 1.25 // the decks reach this far out past the rails (where the bars' posts run)

// A stretch of track: red on top with a darker stripe down each side, purple below, a shoulder outside the rails
function Deck({ box, rails = true }: { box: Box; rails?: boolean }) {
  const wide: Box = { min: [box.min[0] - SHOULDER, box.min[1], box.min[2]], max: [box.max[0] + SHOULDER, box.max[1], box.max[2]] }
  const length = box.max[2] - box.min[2]
  const z = (box.max[2] + box.min[2]) / 2
  return (
    <group>
      <Block min={wide.min} max={wide.max} color={COLORS.side} top={COLORS.track} />
      {[-1, 1].map((s) => (
        <Strip key={s} x={s * (HALF - 0.9)} y={0} z={z} width={0.5} depth={length - 0.4} color={COLORS.trackDark} />
      ))}
      {rails && <Rails box={box} />}
    </group>
  )
}

function CountdownLamps() {
  const view = useSyncExternalStore(subscribeRace, getRaceView)
  const lit = view.count === null ? 4 : 4 - view.count
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[(i - 1.5) * 1.6, 7.1, 0.45]} material={paint(view.count === null ? '#7cf08a' : i < lit ? '#e23b4e' : '#4a4458')}>
          <sphereGeometry args={[0.42, 16, 12]} />
        </mesh>
      ))}
    </>
  )
}

// The start grid: 30 slots (yours in yellow), the chequered line, and an arch with the countdown lamps
function StartArea() {
  const line = useMemo(() => checkerTexture(18, 1), [])
  const half = HALF + 0.9
  return (
    <group>
      {START_SLOTS.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.03, z]} receiveShadow material={paint(i === PLAYER_SLOT ? '#ffd23f' : '#ffffff')}>
          <cylinderGeometry args={[0.5, 0.5, 0.05, 24]} />
        </mesh>
      ))}
      <Strip y={0} z={0.6} width={WIDTH} depth={1} map={line} />
      <group position={[0, 0, -0.3]}>
        {[-half, half].map((x) => (
          <mesh key={x} material={paint(COLORS.post)} position={[x, 3.6, 0]} castShadow>
            <boxGeometry args={[0.7, 7.2, 0.7]} />
          </mesh>
        ))}
        <mesh material={paint(COLORS.bar)} position={[0, 7.1, 0]} castShadow>
          <boxGeometry args={[half * 2 + 0.7, 1.3, 0.7]} />
        </mesh>
        <CountdownLamps />
      </group>
    </group>
  )
}

// A mint arch across the track where a checkpoint starts
function CheckpointArch({ z }: { z: number }) {
  const mint = paint('#7cf08a')
  const half = HALF + 0.9
  return (
    <group position={[0, 0, z]}>
      {[-half, half].map((x) => (
        <mesh key={x} material={mint} position={[x, 3.2, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.28, 6.4, 12]} />
        </mesh>
      ))}
      <mesh material={paint('#1f7a4a')} position={[0, 6.4, 0]}>
        <boxGeometry args={[half * 2, 0.7, 0.3]} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WIDTH, 0.6]} />
        <meshStandardMaterial color="#7cf08a" emissive="#7cf08a" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// The finish: a green and yellow arch over a chequered line
function FinishArch() {
  const line = useMemo(() => checkerTexture(18, 2), [])
  const half = HALF + 0.9
  return (
    <group>
      {[-half, half].map((x) => (
        <mesh key={x} material={paint(COLORS.bar)} position={[x, 3.5, FINISH_Z]} castShadow>
          <boxGeometry args={[0.9, 7, 0.9]} />
        </mesh>
      ))}
      <mesh material={paint(COLORS.rail)} position={[0, 7.3, FINISH_Z]} castShadow>
        <boxGeometry args={[half * 2 + 0.9, 1.3, 1]} />
      </mesh>
      <Strip y={0} z={FINISH_Z} width={WIDTH} depth={1.4} map={line} />
    </group>
  )
}

// Floating islands off to either side, under the clouds' edge
const ISLANDS = [
  { x: -38, y: -6, z: -30, r: 7 },
  { x: 42, y: -2, z: -70, r: 9 },
  { x: -46, y: 2, z: -120, r: 8 },
  { x: 40, y: -4, z: -160, r: 6 },
  { x: -36, y: -1, z: -195, r: 7 },
]
const grass = new THREE.MeshStandardMaterial({ color: '#7bd65a', roughness: 0.9 })
const rock = new THREE.MeshStandardMaterial({ color: '#9b7b5c', roughness: 0.95, flatShading: true })
function Islands() {
  return (
    <group>
      {ISLANDS.map((i, k) => (
        <group key={k} position={[i.x, i.y, i.z]}>
          <mesh material={grass}>
            <cylinderGeometry args={[i.r, i.r * 0.96, 1, 24]} />
          </mesh>
          <mesh material={rock} position={[0, -i.r * 0.75, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[i.r * 0.95, i.r * 1.5, 9]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function OverScene() {
  useLayoutEffect(() => {
    resetWave()
    startRace(OVER_COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 110, 320]} />
      <ambientLight intensity={0.65} />
      <hemisphereLight args={['#ffffff', '#b8e3ff', 0.55]} />
      <FollowSun offset={[16, 30, 14]} intensity={1.7} color="#ffffff" />
      <CloudSea />
      <Islands />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <Deck box={START_DECK} rails={false} />
        <StartArea />
        <Deck box={HURDLE_DECK} />
        <Hurdles />
        <Deck box={GATE_DECK} />
        <Gates />
        <Seesaws />
        <Deck box={WAVE_DECK} />
        <TidalWave />
        <Deck box={WALL_DECK} />
        <GreenWall />
        <Deck box={FINISH_DECK} />
        <Player spawn={SPAWN} rules={RULES} />
        <RaceBots route={OVER_ROUTE} starts={BOT_STARTS} count={BOTS} rules={BOT_RULES} lane={botLane} />
      </Physics>

      <CheckpointArch z={GATE_DECK.max[2] - 0.5} />
      <CheckpointArch z={GATE_DECK.min[2] + 1.5} />
      <CheckpointArch z={WAVE_DECK.max[2] - 0.5} />
      <CheckpointArch z={WALL.z + 4} />
      <FinishArch />
      <Confetti origin={[0, 7, FINISH_Z]} spread={WIDTH} />
    </>
  )
}
