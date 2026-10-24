import { Canvas } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { Suspense, useCallback, useState, type ComponentType, type MouseEvent } from 'react'
import { keyMap } from './game/controls'
import { Scene } from './game/Scene'
import { IslandScene } from './game/island/IslandScene'
import { RaceHud } from './game/race/RaceHud'
import { SkyScene } from './game/sky/SkyScene'
import { TowerScene } from './game/tower/TowerScene'
import { NeonScene } from './game/neon/NeonScene'
import { GymScene } from './game/gym/GymScene'
import { CrumbleScene } from './game/crumble/CrumbleScene'
import { TiltScene } from './game/tilt/TiltScene'
import { HexScene } from './game/hex/HexScene'
import { IceScene } from './game/ice/IceScene'
import { ColorScene } from './game/color/ColorScene'
import { JumpScene } from './game/jump/JumpScene'
import { PanicScene } from './game/panic/PanicScene'
import { WhirlyScene } from './game/whirly/WhirlyScene'
import { LavaScene } from './game/lava/LavaScene'
import { RushScene } from './game/rush/RushScene'
import { OverScene } from './game/over/OverScene'
import { ArenaScene } from './game/arena/ArenaScene'
import { VillaScene } from './game/villa/VillaScene'
import { ShowdownScene } from './game/showdown/ShowdownScene'
import { SuburbScene } from './game/suburb/SuburbScene'
import { ValleyScene } from './game/valley/ValleyScene'
import { ValleyHud } from './game/valley/ValleyHud'
import { Wardrobe } from './game/Wardrobe'
import { DevZoomButton, DevZoomView } from './game/DevZoomControls'
import { GameMenu } from './game/GameMenu'
import { MatchHud } from './game/bots/MatchHud'
import { NetHud } from './game/net/NetHud'
import { ShowDirector } from './game/ShowDirector'
import { TouchControls } from './game/touch/TouchControls'
import { inShow, loadShow, startShow, type Show } from './game/show'

type Level = 'playground' | 'island' | 'sky' | 'tower' | 'neon' | 'gym' | 'crumble' | 'tilt' | 'hex' | 'ice' | 'color' | 'jump' | 'panic' | 'lava' | 'rush' | 'over' | 'whirly' | 'arena' | 'villa' | 'suburb' | 'showdown' | 'valley'
type LevelDef = {
  label: string
  Component: ComponentType
  // HTML drawn over the canvas, e.g. a race HUD
  Overlay?: ComponentType<{ onRestart: () => void }>
}

const LEVELS: Record<Level, LevelDef> = {
  playground: { label: 'Playground', Component: Scene, Overlay: NetHud },
  island: { label: 'Island', Component: IslandScene },
  sky: { label: 'Sky Race', Component: SkyScene, Overlay: RaceHud },
  tower: { label: 'Tower', Component: TowerScene, Overlay: RaceHud },
  neon: { label: 'Neon', Component: NeonScene, Overlay: RaceHud },
  gym: { label: 'Jungle Gym', Component: GymScene, Overlay: RaceHud },
  whirly: { label: 'Spin Cycle', Component: WhirlyScene, Overlay: RaceHud },
  over: { label: 'Over & Under', Component: OverScene, Overlay: RaceHud },
  crumble: { label: 'Crumbling Tower', Component: CrumbleScene, Overlay: RaceHud },
  tilt: { label: 'Tilt Town', Component: TiltScene, Overlay: RaceHud },
  hex: { label: 'Honeycomb', Component: HexScene, Overlay: RaceHud },
  ice: { label: 'Crack Up', Component: IceScene, Overlay: RaceHud },
  color: { label: 'Color Call', Component: ColorScene, Overlay: RaceHud },
  jump: { label: 'Beam Sweep', Component: JumpScene, Overlay: RaceHud },
  panic: { label: 'Pattern Panic', Component: PanicScene, Overlay: RaceHud },
  lava: { label: 'Floor is Lava', Component: LavaScene, Overlay: RaceHud },
  rush: { label: 'Wall Rush', Component: RushScene, Overlay: RaceHud },
  arena: { label: 'Brick Fort', Component: ArenaScene, Overlay: MatchHud },
  villa: { label: 'Hillside', Component: VillaScene, Overlay: MatchHud },
  suburb: { label: 'Suburb', Component: SuburbScene, Overlay: MatchHud },
  showdown: { label: 'Neon Showdown', Component: ShowdownScene, Overlay: MatchHud },
  valley: { label: 'Dust Bowl Valley', Component: ValleyScene, Overlay: ValleyHud },
}

// Played from one of the site's modes (/games/?mode=party-games#sky): a match, from that mode's page
const PLAY_MODES = ['party-games', 'shoot-out']
const playMode = (() => {
  const mode = new URLSearchParams(window.location.search).get('mode')
  return mode && PLAY_MODES.includes(mode) ? mode : null
})()
// The developer's tools (the level switcher, dev zoom, the wardrobe over the game): when developing, or on
// the live site with ?dev=1 on the address. Players never see them.
const devTools = import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev')
// Leaving goes back to the mode's page (or, from anywhere else, the site's home)
const leaveTo = playMode ? `/#${playMode}` : '/'

// Party Games plays a show (/games/?mode=party-games&show=1#sky): three rounds, one after another (see
// ./game/show), each level loaded in turn as the show moves on
const showMode = playMode === 'party-games' && inShow()
const mapOf = (show: Show) => show.rounds[show.round].map as Level
// (Its round's map in the address too: the bots go by it)
const atRound = (show: Show) => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${mapOf(show)}`)
function firstShow(): Show | null {
  if (!showMode) return null
  const show = loadShow() ?? startShow()
  atRound(show)
  return show
}

const initialLevel = (show: Show | null): Level => {
  if (show) return mapOf(show)
  const hash = window.location.hash.slice(1)
  return hash in LEVELS ? (hash as Level) : 'playground'
}

export default function App() {
  const [show, setShow] = useState<Show | null>(firstShow)
  const [level, setLevel] = useState<Level>(() => initialLevel(show))
  // Bumped to remount the current level from scratch (a fresh match)
  const [run, setRun] = useState(0)
  const { Component, Overlay } = LEVELS[level]

  // On to a show's next round (or a new show's first): its map, with the hash to match (the bots read it)
  const playRound = useCallback((next: Show) => {
    atRound(next)
    setShow(next)
    setLevel(mapOf(next))
    setRun((r) => r + 1)
  }, [])
  const toLobby = useCallback(() => window.location.assign(`/#${playMode}`), [])
  const title = useCallback((map: string) => LEVELS[map as Level]?.label ?? map, [])

  const choose = (next: Level) => (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur()
    window.location.hash = next
    setLevel(next)
    setRun((r) => r + 1)
  }

  return (
    <KeyboardControls map={keyMap}>
      <Canvas shadows camera={{ position: [0, 6, 10], fov: 50 }}>
        <Suspense fallback={null}>
          <Component key={`${level}-${run}`} />
        </Suspense>
        <DevZoomView />
      </Canvas>
      {show ? (
        <ShowDirector key={`${level}-${run}`} show={show} title={title} onRound={playRound} onLobby={toLobby} />
      ) : (
        Overlay && <Overlay key={`${level}-${run}`} onRestart={() => setRun((r) => r + 1)} />
      )}
      {devTools && !playMode && (
        <div className="level-switcher">
          {(Object.keys(LEVELS) as Level[]).map((key) => (
            <button key={key} className={key === level ? 'active' : ''} onClick={choose(key)}>
              {LEVELS[key].label}
            </button>
          ))}
        </div>
      )}
      {devTools && <DevZoomButton />}
      {devTools && <Wardrobe />}
      {/* Settings: volume, the prize pool, and the way out (./game/GameMenu) */}
      <GameMenu leaveTo={leaveTo} final={!!show && show.rounds[show.round].quota === null} />
      {/* Phones and tablets: a stick and buttons on the screen (./game/touch) */}
      <TouchControls />
    </KeyboardControls>
  )
}
