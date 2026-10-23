import type { CollisionEnterPayload } from '@react-three/rapier'
import type { CharacterMotion } from './Character'
import { withVolume } from './race/sound'

export type Vec3 = { x: number; y: number; z: number }

export type Stance = 'stand' | 'crouch' | 'roll'

// How the player holds itself: its stance, how far it has eased into a crouch (0..1), and how high above its
// centre the camera looks (eye level, e.g. for a scope)
export type Posture = { stance: Stance; crouch: number; lookHeight: number }

// Anyone running about (the player, and bots racing it): obstacles recognise them in collision events by
// their body's handle, and knock them around
export type Contactable = { handle: number; knock: (v: Vec3) => void; position: () => Vec3; velocity: () => Vec3 }
type ActivePlayer = Contactable & { posture: () => Posture; motion: () => CharacterMotion }

const runners = new Map<number, Contactable>()
let activePlayer: ActivePlayer | null = null

export function registerRunner(runner: Contactable) {
  runners.set(runner.handle, runner)
  return () => {
    if (runners.get(runner.handle) === runner) runners.delete(runner.handle)
  }
}

// Everyone running about now, for obstacles that go by where runners are rather than by contact events
export const allRunners = (): Iterable<Contactable> => runners.values()
export const isRunner = (handle: number) => runners.has(handle)

// The local player
export function setActivePlayer(player: ActivePlayer) {
  activePlayer = player
  const unregister = registerRunner(player)
  return () => {
    unregister()
    if (activePlayer === player) activePlayer = null
  }
}

export const isActivePlayer = (runner: Contactable) => runner.handle === activePlayer?.handle

// Where the local player is (centre of its capsule), or null when there isn't one
export function activePlayerPosition(): Vec3 | null {
  return activePlayer?.position() ?? null
}

// How the local player stands (e.g. crouching), or null when there isn't one
export function activePlayerPosture(): Posture | null {
  return activePlayer?.posture() ?? null
}

// How fast the local player's going, or null when there isn't one
export function activePlayerVelocity(): Vec3 | null {
  return activePlayer?.velocity() ?? null
}

// What the local player's body is doing (running, in the air, hanging...), or null when there isn't one
export function activePlayerMotion(): CharacterMotion | null {
  return activePlayer?.motion() ?? null
}

// The local player's rigid body handle (e.g. so a shot can ignore the shooter), or null
export function activePlayerHandle(): number | null {
  return activePlayer?.handle ?? null
}

// Knock the player directly, for obstacles that detect the player by position rather than contact events
export function knockPlayer(v: Vec3) {
  activePlayer?.knock(v)
}

// How loud something that happens to `runner` should be: full for the player, fainter for others the further
// off they are, silent beyond earshot
const EARSHOT = 28
export function loudness(runner: Contactable) {
  if (!activePlayer || runner.handle === activePlayer.handle) return 1
  const a = runner.position()
  const b = activePlayer.position()
  return 0.5 * Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / EARSHOT)
}

// onCollisionEnter handler for moving obstacles: knock whichever runner it hit by the velocity returned for
// its position (any sound made working that out is as loud as that runner is near)
export function knockOnHit(getKnock: (runnerPosition: Vec3) => Vec3) {
  return (payload: CollisionEnterPayload) => {
    const handle = payload.other.rigidBody?.handle
    const runner = handle === undefined ? undefined : runners.get(handle)
    if (!runner) return
    withVolume(loudness(runner), () => runner.knock(getKnock(runner.position())))
  }
}
