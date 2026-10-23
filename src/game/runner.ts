import { CoefficientCombineRule, type RapierCollider, type RapierRigidBody, type useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import type { CharacterMotion } from './Character'
import { grabEdges, type GrabEdge, type GrabKind } from './grab'
import type { Posture, Stance, Vec3 } from './playerContact'

// A runner's body: what a bean does with what it's told to do (run this way, jump, let go, crouch), whoever
// is telling it: the keyboard (./Player) or a bot (./race/bots). Running, jumping, being knocked about and
// carried by moving floors; crouching and rolling; catching ledges, holds, bars and zip lines, and what Space
// does on each; falling off and coming back. One step of it is stepRunner().

type Physics = ReturnType<typeof useRapier>

export const SPEED = 6
export const JUMP_VELOCITY = 8
// Capsule center to feet is 1.0 (half-height 0.5 + radius 0.5); the extra slack keeps slopes up to ~40° grounded
const GROUND_RAY_LENGTH = 1.2
const GROUND_PROBES = [
  [0, 0],
  [0.35, 0],
  [-0.35, 0],
  [0, 0.35],
  [0, -0.35],
] as const
const KNOCK_DECAY = 3 // per second; a 10 m/s knock carries the player about 3 m

// Stances: C crouches (press again to stand up). On the move, C rolls instead: the bean drops onto its side
// and rolls along for as long as C is held (steer with the movement keys; it keeps going without them), then
// stands back up (or crouches, under something too low to stand). Each stance has its speed (a share of SPEED), collision capsule and camera height (above
// the body centre). The capsule's bottom stays at the feet, 1 below the body centre; rolling, it's a ball.
export const STANCES: Record<Stance, { speed: number; radius: number; halfHeight: number; look: number }> = {
  stand: { speed: 1, radius: 0.5, halfHeight: 0.5, look: 1 },
  crouch: { speed: 0.45, radius: 0.5, halfHeight: 0.3, look: 0.65 },
  roll: { speed: 1.2, radius: 0.5, halfHeight: 0.02, look: 0.35 },
}
const ROLL_START_SPEED = 2 // already sliding along this fast (without keys held) counts as moving
export const STANCE_RATE = 10 // how quickly the body eases into (and out of) a crouch

// Hanging. Heights are measured up from the capsule centre; the shoulders sit about 0.4 above it when reaching up.
const REACH_MIN = 0.3 // an edge lower than this is at chest height: you'd land on it rather than hang from it
const REACH_MAX = 1.3 // arms at full stretch overhead
const WALL_REACH = 0.95 // furthest a ledge can be from the body centre: body radius 0.5 plus a forward reach
const BAR_REACH = 0.9 // arms reach forward for a bar overhead
const END_SLACK = 0.45 // how far past the end of a grab line the hands still catch it
const MAX_CATCH_SPEED = 16 // falling faster than this, the hands can't hold on
// Where the body hangs relative to the grab line: `height` below it, `out` from the wall.
// `spread` is half the distance between the hands, `lift` how far above the line the hands sit.
const HANG: Record<GrabKind, { height: number; out: number; spread: number; lift: number }> = {
  ledge: { height: 0.75, out: 0.52, spread: 0.26, lift: 0.1 },
  hold: { height: 0.75, out: 0.52, spread: 0.12, lift: 0.08 },
  bar: { height: 1.05, out: 0, spread: 0.26, lift: 0.03 },
  zip: { height: 1.05, out: 0, spread: 0.18, lift: 0.03 },
}
const SNAP_RATE = 14 // how hard the body is pulled into the hang spot; capped so a long reach reads as a pull-up
const SNAP_MAX = 9
const SHIMMY_SPEED = 2.2
const REGRAB_DELAY = 0.35 // after letting go, ignore that same edge briefly so you don't instantly re-catch it
const CLIMB_UP_SPEED = 7
const CLIMB_IN_SPEED = 4.5
const HOP_VELOCITY = 8.2 // climbing-wall hop from one hold to the next
const HOP_SIDE = 3
const FLING = { forward: 5.5, up: 4.5 } // swing off a bar
const ZIP_SPEED = 14 // sliding down a zip line (m/s, along the cable)
const ZIP_END = 0.8 // let go this far short of the bottom
const zipVel: Vec3 = { x: 0, y: 0, z: 0 }

// How high a grab line is `t` along it (a zip line slopes; everything else is level)
const edgeY = (e: GrabEdge, t: number, len: number) => (len > 1e-6 ? e.a.y + ((e.b.y - e.a.y) * t) / len : e.a.y)
// Bars and zip lines are hung beneath, from either side
const hangsBeneath = (e: GrabEdge) => e.kind === 'bar' || e.kind === 'zip'

type HangState = {
  edge: GrabEdge | null
  t: number // position of the body along the edge, 0..edge length
  side: 1 | -1 // bars: which side you hang from
  climbing: boolean
  climbTime: number
  jumpHeld: boolean // Space still held from the jump that led here: it must be released before it acts again
  dropHeld: boolean // same for Shift, so the press that climbs you down doesn't also let go
  released: GrabEdge | null
  releaseTimer: number
}

function edgeFrame(e: GrabEdge) {
  const dx = e.b.x - e.a.x
  const dz = e.b.z - e.a.z
  const len = Math.hypot(dx, dz)
  return len > 1e-6 ? { tx: dx / len, tz: dz / len, len } : { tx: e.out.z, tz: -e.out.x, len: 0 }
}

// The reflex: find the edge the hands can reach from here, if any.
// Rising, you only reach for edges the jump can't carry you over (the ones you'll clear you land on instead),
// and only once the hands are up to them.
export function findGrab(pos: Vec3, vy: number, gravity: number, exclude: GrabEdge | null, among: Iterable<GrabEdge> = grabEdges()) {
  let best: { edge: GrabEdge; t: number; side: 1 | -1 } | null = null
  let bestScore = Infinity
  for (const e of among) {
    if (e === exclude) continue
    const spec = HANG[e.kind]
    const { tx, tz, len } = edgeFrame(e)
    const along = (pos.x - e.a.x) * tx + (pos.z - e.a.z) * tz
    if (along < -END_SLACK || along > len + END_SLACK) continue
    const t = THREE.MathUtils.clamp(along, 0, len)
    const ey = edgeY(e, t, len)
    const h = ey - pos.y
    if (h < (hangsBeneath(e) ? 0.5 : REACH_MIN) || h > REACH_MAX) continue
    if (vy > 1) {
      const apexFeet = pos.y + (vy * vy) / (2 * gravity) - 1
      if (apexFeet > ey + 0.1 || h > spec.height) continue
    }
    const dOut = (pos.x - e.a.x - tx * t) * e.out.x + (pos.z - e.a.z - tz * t) * e.out.z
    if (hangsBeneath(e) ? Math.abs(dOut) > BAR_REACH : dOut < 0.2 || dOut > WALL_REACH) continue
    const score = Math.abs(h - spec.height) + Math.abs(Math.abs(dOut) - spec.out)
    if (score < bestScore) {
      bestScore = score
      best = { edge: e, t, side: dOut >= 0 ? 1 : -1 }
    }
  }
  return best
}

// Climbing down: a ledge you're standing on, right at its edge, to lower yourself over and hang from
function findLedgeBelow(pos: Vec3) {
  let best: { edge: GrabEdge; t: number } | null = null
  let bestOut = -Infinity
  for (const e of grabEdges()) {
    if (hangsBeneath(e)) continue
    const h = e.a.y - pos.y
    if (h < -1.3 || h > -0.6) continue
    const { tx, tz, len } = edgeFrame(e)
    const along = (pos.x - e.a.x) * tx + (pos.z - e.a.z) * tz
    if (along < -0.1 || along > len + 0.1) continue
    const t = THREE.MathUtils.clamp(along, 0, len)
    const dOut = (pos.x - e.a.x - tx * t) * e.out.x + (pos.z - e.a.z - tz * t) * e.out.z
    if (dOut < -0.9 || dOut > 0.15 || dOut <= bestOut) continue
    bestOut = dOut
    best = { edge: e, t }
  }
  return best
}

// Optional level rules. Levels that pass nothing get free movement and respawn at `spawn` below y = -10.
export type PlayerRules = {
  canMove?: () => boolean
  respawnAt?: () => [number, number, number]
  // Falling below this height respawns you. A function lets it change over time (e.g. rising slime).
  fallY?: number | (() => number)
  // Velocity of whatever the player is standing on (conveyors, spinning platforms), keyed by collider handle
  surfaceVelocity?: (colliderHandle: number, position: Vec3) => { x: number; z: number } | null
  onMove?: (position: Vec3, grounded: boolean) => void
  cameraYaw?: number // starting camera direction
  // Levels with rooms to go into: the camera comes in front of any wall or ceiling between it and the player,
  // rather than showing the outside of the building you're in
  cameraCollides?: boolean
}

// What a runner is told to do this frame
export type RunnerInput = {
  x: number // which way to run, in the world (any length up to 1: shorter is slower)
  z: number
  jump: boolean // Space held
  drop: boolean // Shift held
  crouchHeld: boolean // C held
  crouchPressed: boolean // C went down since the last frame
}

// Everything a runner's body remembers from one frame to the next
export type Runner = {
  motion: { current: CharacterMotion } // for its Character
  posture: Posture
  shape: Stance // the stance its capsule has been asked for
  rollDir: THREE.Vector3
  hang: HangState
  knock: Vec3
  // How the last step left it, for whoever's steering
  grounded: boolean
  floor: { x: number; z: number } | null // what the ground under it is doing (a belt, a spinning disc)
  respawns: number // counts the times it's fallen off and come back
}

export const restingMotion = (): CharacterMotion => ({ vx: 0, vz: 0, grounded: true, hang: null, grabs: 0, jolt: 0, crouch: 0 })

// `motion` is what its Character reads (pass the same one to both)
export function createRunner(motion: { current: CharacterMotion } = { current: restingMotion() }): Runner {
  return {
    motion,
    posture: { stance: 'stand', crouch: 0, lookHeight: 1 },
    shape: 'stand',
    rollDir: new THREE.Vector3(0, 0, -1),
    hang: { edge: null, t: 0, side: 1, climbing: false, climbTime: 0, jumpHeld: false, dropHeld: false, released: null, releaseTimer: 0 },
    knock: { x: 0, y: 0, z: 0 },
    grounded: true,
    floor: null,
    respawns: 0,
  }
}

// A knock from an obstacle. The strongest hit wins rather than hits adding up, so touching two coins at once
// isn't a double shove.
export function knockRunner(runner: Runner, v: Vec3) {
  const k = runner.knock
  if (Math.hypot(v.x, v.z) >= Math.hypot(k.x, k.z)) {
    k.x = v.x
    k.z = v.z
  }
  k.y = Math.max(k.y, v.y)
}

export type RunnerEnv = {
  rb: RapierRigidBody
  collider: RapierCollider | null
  physics: Physics
  rules?: PlayerRules
  spawn: [number, number, number]
  setCapsule: (stance: Stance) => void // each stance has a capsule of its own (see the notes where it's drawn)
}

// Reused every frame to avoid allocating new objects
const ZERO: Vec3 = { x: 0, y: 0, z: 0 }
const direction = new THREE.Vector3()
let groundRay: InstanceType<Physics['rapier']['Ray']> | null = null
let headRay: InstanceType<Physics['rapier']['Ray']> | null = null

export const damp = (current: number, target: number, rate: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt))

// One frame of a runner's body, `frameTime` seconds long
export function stepRunner(runner: Runner, env: RunnerEnv, input: RunnerInput, frameTime: number) {
  // (Never a negative time, or a great leap after the page has been away: either would put speeds that aren't
  // numbers into the physics, which it doesn't survive)
  const delta = Math.min(Math.max(frameTime, 0), 0.1) || 0
  const { rb, rules } = env
  const { rapier, world } = env.physics
  const { jump, drop, crouchHeld } = input
  const canMove = rules?.canMove?.() ?? true
  const pos = rb.translation()

  // 1. Movement: input sets horizontal velocity; knockback and moving floors add on top; gravity keeps vertical.
  // Crouching is slower.
  const ps = runner.posture
  const speed = SPEED * STANCES[ps.stance].speed
  direction.set(input.x, 0, input.z)
  const pushed = direction.length()
  // (Anything that isn't a way to run, a slip in whatever's steering included, is standing still: a body told
  // to move at a speed that isn't a number takes the whole physics world down with it)
  if (canMove && pushed > 0 && isFinite(pushed)) direction.multiplyScalar((speed * Math.min(1, pushed)) / pushed)
  else direction.set(0, 0, 0)
  const vel = rb.linvel()
  // Ground check: rays down from the centre and four points around the base. A single centre ray misses
  // when you stand on an edge with your middle over a gap, and then you can't jump out.
  const ray = (groundRay ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }))
  let hit = null
  for (const [ox, oz] of GROUND_PROBES) {
    ray.origin = { x: pos.x + ox, y: pos.y, z: pos.z + oz }
    hit = world.castRay(ray, GROUND_RAY_LENGTH, true, undefined, undefined, undefined, rb)
    if (hit) break
  }
  const grounded = hit !== null
  const floor = (hit && rules?.surfaceVelocity?.(hit.collider.handle, pos)) || null
  // No friction in the air (nor taking off, still within reach of the ground): pushing into a wall mid-jump,
  // or being pressed in on by a crowd, would otherwise drag you down and eat the jump
  const col = env.collider
  const friction = grounded && vel.y < 3 ? 0.2 : 0
  if (col && col.friction() !== friction) {
    col.setFriction(friction)
    col.setFrictionCombineRule(friction > 0 ? CoefficientCombineRule.Average : CoefficientCombineRule.Min)
  }
  const k = runner.knock
  const m = runner.motion.current
  const hs = runner.hang
  hs.releaseTimer -= delta
  if (hs.releaseTimer <= 0) hs.released = null
  let dropPressed = drop && !hs.dropHeld
  hs.dropHeld = drop

  // Stance. Standing up from a crouch needs room overhead.
  const headUp = (headRay ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }))
  const roomFor = (stance: Stance) => {
    const shape = STANCES[stance]
    const top = -1 + 2 * shape.radius + 2 * shape.halfHeight // above the body centre
    for (const [ox, oz] of GROUND_PROBES) {
      headUp.origin = { x: pos.x + ox, y: pos.y - 0.5, z: pos.z + oz }
      const flags = rapier.QueryFilterFlags.EXCLUDE_SENSORS
      if (world.castRay(headUp, top + 0.5, true, flags, undefined, undefined, rb)) return false
    }
    return true
  }
  const rise = (stance: Stance) => {
    if (!roomFor(stance)) return false
    ps.stance = stance
    return true
  }
  if (!hs.edge && input.crouchPressed) {
    // On the move: roll, the way you're going. Standing still: crouch, or stand back up.
    const sliding = Math.hypot(vel.x, vel.z) > ROLL_START_SPEED
    if (canMove && ps.stance !== 'roll' && (direction.lengthSq() > 0 || sliding)) {
      ps.stance = 'roll'
      if (direction.lengthSq() > 0) runner.rollDir.copy(direction).normalize()
      else runner.rollDir.set(vel.x, 0, vel.z).normalize()
    } else if (ps.stance === 'crouch') rise('stand')
    else if (ps.stance === 'stand') ps.stance = 'crouch'
  }
  // Let go of C to stop rolling and stand up (under something low, crouch; lying still until there's room)
  if (ps.stance === 'roll' && !crouchHeld && !rise('stand')) rise('crouch')
  if (ps.stance === 'roll') {
    // Rolling along: steer with the keys, or keep going the way you were
    if (crouchHeld && canMove) {
      if (direction.lengthSq() > 0) runner.rollDir.copy(direction).normalize()
      direction.copy(runner.rollDir).multiplyScalar(SPEED * STANCES.roll.speed)
    } else direction.set(0, 0, 0)
  }
  const rolling = ps.stance === 'roll'
  // Space while crouching: you stand up as you jump (not while rolling)
  let jumpNow = jump && canMove && grounded && vel.y < 1 && !rolling
  if (jumpNow && ps.stance === 'crouch' && !rise('stand')) jumpNow = false

  const letGo = (v: Vec3) => {
    hs.released = hs.edge
    hs.releaseTimer = REGRAB_DELAY
    hs.edge = null
    hs.climbing = false
    m.hang = null
    rb.setGravityScale(1, true)
    rb.setLinvel(v, true)
  }

  const hangOn = (edge: GrabEdge, t: number, side: 1 | -1, jolt: number) => {
    hs.edge = edge
    hs.t = t
    hs.side = edge.kind === 'bar' ? side : 1
    hs.climbing = false
    hs.jumpHeld = jump
    ps.stance = 'stand' // hanging from the hands
    rb.setGravityScale(0, true)
    m.grabs++
    m.jolt = jolt
  }

  // Grab reflex: in the air, with an edge within arm's reach, the hands catch it (hold Shift to fall past)
  if (!hs.edge && !grounded && canMove && !drop && !rolling && vel.y > -MAX_CATCH_SPEED) {
    const gravity = Math.abs(world.gravity.y) || 20
    const grab = findGrab(pos, vel.y, gravity, hs.released)
    if (grab) hangOn(grab.edge, grab.t, grab.side, THREE.MathUtils.clamp(Math.hypot(vel.x, vel.y, vel.z) / 10, 0.25, 1))
  }
  // Climb down: Shift at a taped edge lowers you over it to hang
  if (!hs.edge && grounded && canMove && dropPressed && !rolling) {
    const below = findLedgeBelow(pos)
    if (below) {
      hangOn(below.edge, below.t, 1, 0.3)
      dropPressed = false // this press climbed down; the next one lets go
    }
  }

  if (hs.edge) {
    // 1b. Hanging: A/D (along the edge) shimmies, Space climbs / hops / flings, Shift or pulling away lets go
    const e = hs.edge
    const spec = HANG[e.kind]
    const { tx, tz, len } = edgeFrame(e)
    const outX = e.out.x * hs.side
    const outZ = e.out.z * hs.side
    const along = (direction.x * tx + direction.z * tz) / speed
    const away = (direction.x * outX + direction.z * outZ) / speed
    if (!jump) hs.jumpHeld = false
    const jumpPressed = jump && !hs.jumpHeld
    // A zip line carries you down it; anything else, A/D shimmies along
    const zip = e.kind === 'zip'
    const len3 = Math.hypot(len, e.b.y - e.a.y) || 1
    if (zip) hs.t = Math.min(len, hs.t + ((ZIP_SPEED * len) / len3) * delta)
    else if (!hs.climbing) hs.t = THREE.MathUtils.clamp(hs.t + along * SHIMMY_SPEED * delta, 0, len)
    const cx = e.a.x + tx * hs.t
    const cz = e.a.z + tz * hs.t
    const cy = edgeY(e, hs.t, len)
    if (zip) {
      zipVel.x = (tx * len * ZIP_SPEED) / len3
      zipVel.y = ((e.b.y - e.a.y) * ZIP_SPEED) / len3
      zipVel.z = (tz * len * ZIP_SPEED) / len3
    }
    const ev = zip ? zipVel : (e.vel ?? ZERO) // moving edges (and zip lines) carry the body along

    if (hs.climbing) {
      // Mantle: pull straight up until the feet clear the edge, then step in over it
      hs.climbTime += delta
      const over = -((pos.x - cx) * outX + (pos.z - cz) * outZ) // how far past the edge, over the top
      if (hs.climbTime > 1) letGo({ x: ev.x, y: ev.y, z: ev.z })
      else if (pos.y < cy + 1.1)
        rb.setLinvel(
          {
            x: (cx + outX * spec.out - pos.x) * 10 + ev.x,
            y: CLIMB_UP_SPEED + ev.y,
            z: (cz + outZ * spec.out - pos.z) * 10 + ev.z,
          },
          true,
        )
      else if (over < 0.6 && hs.climbTime < 0.7)
        rb.setLinvel({ x: -outX * CLIMB_IN_SPEED + ev.x, y: ev.y, z: -outZ * CLIMB_IN_SPEED + ev.z }, true)
      else letGo({ x: -outX * 2 + ev.x, y: Math.max(ev.y, 0), z: -outZ * 2 + ev.z })
    } else if (dropPressed || !canMove || Math.hypot(k.x, k.z) > 2 || k.y > 0) {
      letGo({ x: outX * 1.5, y: 0, z: outZ * 1.5 })
    } else if (zip && (jumpPressed || hs.t >= len - ZIP_END)) {
      // Off the zip line (at the bottom, or jumping off): carried on by the speed for a moment
      k.x = ev.x
      k.z = ev.z
      letGo({ x: ev.x, y: Math.max(ev.y, 0), z: ev.z })
    } else if (!hangsBeneath(e) && away > 0.7) {
      letGo({ x: outX * 2, y: 0, z: outZ * 2 }) // pushing away from the wall
    } else if (jumpPressed && e.kind === 'ledge') {
      hs.climbing = true
      hs.climbTime = 0
    } else if (jumpPressed && e.kind === 'hold') {
      letGo({ x: tx * along * HOP_SIDE, y: HOP_VELOCITY, z: tz * along * HOP_SIDE })
    } else if (jumpPressed) {
      // Bar: fling the way you're pushing, or straight ahead
      const moving = direction.lengthSq() > 0
      const fx = moving ? direction.x / speed : -outX
      const fz = moving ? direction.z / speed : -outZ
      letGo({ x: fx * FLING.forward, y: FLING.up, z: fz * FLING.forward })
    } else {
      // Hold on: pull the body into the hang spot below the hands
      let vx = (cx + outX * spec.out - pos.x) * SNAP_RATE
      let vy = (cy - spec.height - pos.y) * SNAP_RATE
      let vz = (cz + outZ * spec.out - pos.z) * SNAP_RATE
      const outNow = (pos.x - cx) * outX + (pos.z - cz) * outZ
      if (!hangsBeneath(e) && pos.y > cy + 0.3 && outNow < spec.out) {
        // Climbing down from on top: step out over the edge before dropping, or the floor holds you back
        const slide = ((cx - pos.x) * tx + (cz - pos.z) * tz) * SNAP_RATE // stay lined up along the edge
        vx = outX * CLIMB_IN_SPEED + tx * slide
        vz = outZ * CLIMB_IN_SPEED + tz * slide
        vy = 0
      }
      const pull = Math.hypot(vx, vy, vz)
      if (pull > SNAP_MAX) {
        vx *= SNAP_MAX / pull
        vy *= SNAP_MAX / pull
        vz *= SNAP_MAX / pull
      }
      rb.setLinvel({ x: vx + ev.x, y: vy + ev.y, z: vz + ev.z }, true)
    }

    if (hs.edge && pos.y < cy + 0.3) {
      // Tell the character where its hands close around the edge: just over the lip, both on the edge
      const t0 = Math.max(hs.t - spec.spread, 0)
      const t1 = Math.min(hs.t + spec.spread, len)
      const inset = hangsBeneath(e) ? 0 : 0.03
      const pose = (m.hang ??= {
        kind: e.kind,
        hands: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        ],
        tx,
        tz,
        yaw: 0,
        shimmy: 0,
      })
      pose.kind = e.kind
      pose.hands[0].x = e.a.x + tx * t0 - outX * inset
      pose.hands[0].y = edgeY(e, t0, len) + spec.lift
      pose.hands[0].z = e.a.z + tz * t0 - outZ * inset
      pose.hands[1].x = e.a.x + tx * t1 - outX * inset
      pose.hands[1].y = edgeY(e, t1, len) + spec.lift
      pose.hands[1].z = e.a.z + tz * t1 - outZ * inset
      pose.tx = tx
      pose.tz = tz
      pose.yaw = zip ? Math.atan2(tx, tz) : Math.atan2(-outX, -outZ) // face the wall (or through the bar; down the zip line)
      pose.shimmy = hs.climbing ? 0 : along
    } else {
      m.hang = null // climbed up past the hands: let the arms come back
    }
    m.vx = 0
    m.vz = 0
    m.grounded = false
  } else {
    const control = 1 - Math.min(0.85, Math.hypot(k.x, k.z) / 10) // being knocked back weakens steering
    let vy = jumpNow ? JUMP_VELOCITY : vel.y
    if (k.y > 0) {
      vy = k.y
      k.y = 0
    }
    rb.setLinvel(
      {
        x: direction.x * control + k.x + (floor ? floor.x : 0),
        y: vy,
        z: direction.z * control + k.z + (floor ? floor.z : 0),
      },
      true,
    )
    m.vx = direction.x
    m.vz = direction.z
    m.grounded = grounded
  }
  m.roll = ps.stance === 'roll'
  const decay = Math.exp(-KNOCK_DECAY * delta)
  k.x *= decay
  k.z *= decay
  runner.grounded = m.grounded
  runner.floor = floor
  rules?.onMove?.(pos, m.grounded)

  // 1c. The body eases into its stance, and the capsule takes its shape (shorter crouching)
  ps.crouch = damp(ps.crouch, ps.stance === 'crouch' ? 1 : 0, STANCE_RATE, delta)
  m.crouch = ps.crouch
  if (runner.shape !== ps.stance) {
    runner.shape = ps.stance
    env.setCapsule(ps.stance)
  }

  // 2. Respawn if we fall off the map
  const fallY = typeof rules?.fallY === 'function' ? rules.fallY() : (rules?.fallY ?? -10)
  if (pos.y < fallY) putBack(runner, env)
}

// Back where the rules say a fallen runner goes (its last checkpoint, or where it started), standing still
export function putBack(runner: Runner, env: RunnerEnv) {
  const { rb } = env
  const [x, y, z] = env.rules?.respawnAt?.() ?? env.spawn
  const hs = runner.hang
  if (hs.edge) {
    hs.edge = null
    hs.climbing = false
    runner.motion.current.hang = null
    rb.setGravityScale(1, true)
  }
  runner.posture.stance = 'stand'
  rb.setTranslation({ x, y, z }, true)
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
  runner.knock.x = runner.knock.y = runner.knock.z = 0
  runner.respawns++
}
