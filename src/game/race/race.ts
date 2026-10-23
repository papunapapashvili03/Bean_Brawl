import type { PlayerRules } from '../Player'
import type { Vec3 } from '../playerContact'

// Shared race state for every race level: match clock, countdown, checkpoints, finish, and the field: the
// other runners (bots, see ./bots) racing the player, each reporting where it's got to, which gives the
// player's position in the race. One course is active at a time; a level calls startRace(course) when it mounts.

export const STEP = 1 / 60 // fixed physics step; every obstacle is timed off whole steps of the match clock
export const COUNTDOWN_SECONDS = 4 // shows 3, 2, 1, 0, then RUN

type Point = [number, number, number]

// Axis-aligned box. Use ±Infinity for unbounded sides (e.g. "anywhere past z = -25").
export type Zone = { min: Point; max: Point }

export type RaceCourse = {
  spawn: Point
  // Section names shown in the HUD: one for the start plus one per checkpoint
  sections: string[]
  // In course order. Standing (grounded) in a zone activates that checkpoint and every one before it.
  checkpoints: { zone: Zone; respawn: Point }[]
  finish: Zone
  // Optional: the finish card's title (e.g. 'Survived', for a level that ends some other way than a finish
  // line, by calling finishRace(); worked out as the card comes up, if it depends how), and the hint shown
  // during the countdown
  finishTitle?: string | (() => string)
  hint?: string
  // A level you stay in rather than race through (falling is the end, lasting is the win): the HUD counts
  // who's still in instead of placing you
  survival?: boolean
}

// A call the level makes, shown big in the middle of the screen (Color Call's colour), with a bar that runs
// out over `seconds` (`id` tells one call from the next)
export type Callout = { id: number; label: string; colour: string; ink: string; seconds: number }

// 'eliminated': out of the race (a level that doesn't respawn you calls eliminate())
export type Phase = 'countdown' | 'running' | 'finished' | 'eliminated'

// What the HUD shows. Replaced (never mutated) whenever a visible value changes.
export type RaceView = {
  phase: Phase
  count: number | null // 3, 2, 1, 0 during the countdown
  showRun: boolean
  elapsed: number // race seconds at 0.1 s resolution; frozen once finished
  checkpoint: number // 0 = start line, 1..n = checkpoints reached
  toast: string | null
  place: number | null // where you came, once you've finished (or gone out)
  position: number // where you are in the race now (1 = leading)
  field: number // how many are racing, you included
  left: number // how many are still in (not gone out), you included
  status: string | null // a line the level keeps up to date, e.g. "Arena shrinks in 7s"
  callout: Callout | null
}

// Another runner in the race
export type Racer = {
  name: string
  colour: string
  start: Point // where it set off from
  checkpoint: number // 0 = start line, 1..n = checkpoints reached
  finishClock: number | null
  outClock: number | null // gone out (a level where falling is the end)
  at: Vec3 // where it was last
}

let course: RaceCourse = { spawn: [0, 3, 0], sections: [''], checkpoints: [], finish: { min: [0, 0, 0], max: [0, 0, 0] } }

const state = {
  clock: 0, // seconds since the match began, advanced one physics step at a time
  checkpoint: 0,
  finishClock: null as number | null,
  eliminatedClock: null as number | null,
  eliminatedPlace: null as number | null,
  toast: null as string | null,
  toastUntil: 0,
  status: null as string | null,
  callout: null as Callout | null,
}

const field: Racer[] = []

// Moving floors register here by collider handle so the player can ride them
export const surfaces = new Map<number, (p: Vec3) => { x: number; z: number }>()

// Latest player position, for scenery that reacts to the player (e.g. walls fading out of the camera's way)
export const playerPosition: Vec3 = { x: 0, y: 0, z: 0 }

const listeners = new Set<() => void>()
let view = computeView()

const inZone = ({ min, max }: Zone, p: Vec3) =>
  p.x >= min[0] && p.x <= max[0] && p.y >= min[1] && p.y <= max[1] && p.z >= min[2] && p.z <= max[2]

// Where a runner who's reached `checkpoint` is heading: the next checkpoint, or the finish
function goal(checkpoint: number): Point {
  if (checkpoint < course.checkpoints.length) return course.checkpoints[checkpoint].respawn
  const { min, max } = course.finish
  const mid = (a: number, b: number) => (isFinite(a) && isFinite(b) ? (a + b) / 2 : isFinite(a) ? a : isFinite(b) ? b : 0)
  return [mid(min[0], max[0]), mid(min[1], max[1]), mid(min[2], max[2])]
}
function toGoal(checkpoint: number, p: Vec3) {
  const g = goal(checkpoint)
  return Math.hypot(p.x - g[0], p.y - g[1], p.z - g[2])
}

// How many of the field are ahead of the player: home before it, or further round the course
function ahead() {
  let n = 0
  const mine = state.finishClock
  const here = mine === null ? toGoal(state.checkpoint, playerPosition) : 0
  for (const r of field) {
    if (mine !== null) {
      if (r.finishClock !== null && r.finishClock < mine) n++
    } else if (r.finishClock !== null) n++
    else if (r.outClock !== null) continue
    else if (state.eliminatedClock !== null) n++
    else if (r.checkpoint > state.checkpoint || (r.checkpoint === state.checkpoint && toGoal(r.checkpoint, r.at) < here)) n++
  }
  return n
}
function stillIn() {
  return field.reduce((n, r) => n + (r.outClock === null ? 1 : 0), 0)
}

function computeView(): RaceView {
  const { clock, finishClock, eliminatedClock } = state
  const ended = finishClock ?? eliminatedClock
  const phase: Phase =
    finishClock !== null
      ? 'finished'
      : eliminatedClock !== null
        ? 'eliminated'
        : clock < COUNTDOWN_SECONDS
          ? 'countdown'
          : 'running'
  const raceTime = (ended ?? clock) - COUNTDOWN_SECONDS
  return {
    phase,
    count: clock < COUNTDOWN_SECONDS ? 3 - Math.floor(clock) : null,
    showRun: clock >= COUNTDOWN_SECONDS && clock < COUNTDOWN_SECONDS + 1.2 && ended === null,
    elapsed: Math.max(0, Math.floor(raceTime * 10) / 10),
    checkpoint: state.checkpoint,
    toast: clock < state.toastUntil ? state.toast : null,
    // Lasting out a survival level, everyone still standing wins together
    place: finishClock !== null ? (course.survival ? 1 : ahead() + 1) : state.eliminatedPlace,
    position: ahead() + 1,
    field: field.length + 1,
    left: stillIn() + (eliminatedClock === null ? 1 : 0),
    status: state.status,
    callout: state.callout,
  }
}

function publish() {
  const next = computeView()
  const changed = (Object.keys(next) as (keyof RaceView)[]).some((key) => next[key] !== view[key])
  if (!changed) return
  view = next
  listeners.forEach((l) => l())
}

function showToast(text: string, seconds = 1.6) {
  state.toast = text
  state.toastUntil = state.clock + seconds
}

export const subscribeRace = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getRaceView = () => view
export const raceCourse = () => course

export const raceClock = () => state.clock
export const canMove = () => state.clock >= COUNTDOWN_SECONDS

// Make `next` the active course and restart the match
export function startRace(next: RaceCourse) {
  course = next
  state.clock = 0
  state.checkpoint = 0
  state.finishClock = null
  state.eliminatedClock = null
  state.eliminatedPlace = null
  field.length = 0
  state.toast = null
  state.toastUntil = 0
  state.status = null
  state.callout = null
  publish()
}

const over = () => state.finishClock !== null || state.eliminatedClock !== null
export const raceOver = over
// When the player finished (match clock), or null
export const playerFinishClock = () => state.finishClock

// Out of the race: for levels where a fall (or anything else) ends your run rather than respawning you
export function eliminate() {
  if (over()) return
  state.eliminatedClock = state.clock
  state.eliminatedPlace = stillIn() + 1
  publish()
}

// The race is won some other way than crossing the finish line (e.g. surviving to the end)
export function finishRace() {
  if (over()) return
  state.finishClock = state.clock
  publish()
}

// The level's status line; the HUD only redraws when the text changes
export function setRaceStatus(text: string | null) {
  if (state.status === text) return
  state.status = text
  publish()
}

// The level's callout (or none)
export function setRaceCallout(callout: Callout | null) {
  if (state.callout === callout) return
  state.callout = callout
  publish()
}

export function advanceClock(dt: number) {
  state.clock += dt
  publish()
}

export function respawnPoint(): Point {
  return state.checkpoint === 0 ? course.spawn : course.checkpoints[state.checkpoint - 1].respawn
}

// ---------------------------------------------------------------------------------------------------------
// The field

export const racers = (): readonly Racer[] => field

// A runner joins the race (after the level has started it); `leave` takes it out again
export function joinRace(name: string, colour: string, start: Point) {
  const racer: Racer = { name, colour, start, checkpoint: 0, finishClock: null, outClock: null, at: { x: start[0], y: start[1], z: start[2] } }
  field.push(racer)
  publish()
  const leave = () => {
    const i = field.indexOf(racer)
    if (i >= 0) field.splice(i, 1)
  }
  return { racer, leave }
}

// A racer's out of it (a level where falling is the end)
export function eliminateRacer(racer: Racer) {
  if (racer.outClock === null && racer.finishClock === null) racer.outClock = state.clock
}

// Where a racer comes back after a fall: its last checkpoint (a little to one side, so they don't pile up)
function racerRespawn(racer: Racer): Point {
  const [x, y, z] = racer.checkpoint === 0 ? racer.start : course.checkpoints[racer.checkpoint - 1].respawn
  return racer.checkpoint === 0 ? [x, y, z] : [x + (Math.random() - 0.5) * 1.4, y, z + (Math.random() - 0.5) * 0.8]
}

// Called with a racer's position every frame: its checkpoints and its finish
function reportRacer(racer: Racer, p: Vec3, grounded: boolean) {
  racer.at.x = p.x
  racer.at.y = p.y
  racer.at.z = p.z
  if (state.clock < COUNTDOWN_SECONDS || racer.finishClock !== null || racer.outClock !== null) return
  if (grounded) {
    for (let i = course.checkpoints.length - 1; i >= racer.checkpoint; i--) {
      if (inZone(course.checkpoints[i].zone, p)) {
        racer.checkpoint = i + 1
        break
      }
    }
  }
  if (inZone(course.finish, p)) racer.finishClock = state.clock
}

// The rules a racer runs under: the player's, with its own checkpoints and finish
export function racerRules(racer: Racer, overrides: Partial<PlayerRules> = {}): PlayerRules {
  return {
    canMove,
    respawnAt: () => racerRespawn(racer),
    fallY: -30,
    surfaceVelocity: (handle, p) => surfaces.get(handle)?.(p) ?? null,
    onMove: (p, grounded) => reportRacer(racer, p, grounded),
    ...overrides,
  }
}

// Player rules every race level uses: locked until RUN, respawn at the last checkpoint, ride moving floors
export function raceRules(overrides: Partial<PlayerRules> = {}): PlayerRules {
  return {
    canMove,
    respawnAt: respawnPoint,
    fallY: -30,
    surfaceVelocity: (handle, p) => surfaces.get(handle)?.(p) ?? null,
    onMove: reportPosition,
    ...overrides,
  }
}

// Called with the player's position every frame: activates checkpoints and detects the finish
export function reportPosition(p: Vec3, grounded: boolean) {
  playerPosition.x = p.x
  playerPosition.y = p.y
  playerPosition.z = p.z
  if (state.clock < COUNTDOWN_SECONDS || over()) return
  if (grounded) {
    // Jump straight to the furthest checkpoint the player is standing in (skipping is fine)
    for (let i = course.checkpoints.length - 1; i >= state.checkpoint; i--) {
      if (inZone(course.checkpoints[i].zone, p)) {
        state.checkpoint = i + 1
        showToast(`Checkpoint ${state.checkpoint}/${course.checkpoints.length}`)
        break
      }
    }
  }
  if (inZone(course.finish, p)) state.finishClock = state.clock
  publish()
}
