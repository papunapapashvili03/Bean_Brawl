import type { RapierCollider, RapierRigidBody, useRapier } from '@react-three/rapier'
import { grabEdges, type GrabEdge } from '../../grab'
import { allRunners, isRunner } from '../../playerContact'
import { JUMP_VELOCITY, SPEED, STANCES, findGrab, type Runner, type RunnerInput } from '../../runner'
import { NOT_COMES_AND_GOES, standing, timetabled } from '../kinematic'
import { GRID, distance, foreseen, ray, rayDown, solidsAt, type Solid } from './predict'
import { resumeAt, type BotView, type P3, type Route, type Waypoint } from './route'

// A bot's pilot: what it tells its body (../../runner) to do, frame by frame, to get round a course.
//
// It heads for the points of the course's route (./route), one after another. How it gets to the next one it
// works out for itself, a few times a second, by trying out what it could do over the next second or two
// (run on, veer off to either side, wait, turn back; jump now or in a moment; roll, or roll under something and
// get back up) in its head, against where
// everything on the course will be by then (./predict): a try that gets knocked about or falls off is out,
// and of the rest it takes the one that gets it nearest where it's going. So it weaves between whatever's
// swinging or rolling at it, waits for a gap, and jumps when (and only when) there'll be something to land on.
// Other runners count too, as things in the way (going on as they're going): it queues behind one that's
// standing where it wants to be rather than barging it off the edge. So does anything loose (a sliding bus,
// a shape falling out of the sky): out of its way if it's moving, round it if it isn't.
//
// Hanging from something, it does what gets it on: swings from bar to bar, pulls itself up over a ledge, hops
// up from hold to hold. Getting nowhere for long enough, it gives up and goes back to its last checkpoint.

type Physics = ReturnType<typeof useRapier>

const G = 20
const DECIDE_EVERY = 0.12
const STEPS = 26 // of a try: 16 short ones (GRID each: 0.8 s), then long ones (2 GRID each: out to 1.8 s)
const SHORT = 16
const BODY = 0.52 // how near a hazard's surface the body's middle (or its chest, or its knees) can come
const REACH = 1.3 // how near a point counts as there
const STUCK_NUDGE = 6 // seconds getting nowhere before it tries something else
const STUCK_QUIT = 14 // ...and before it gives up
const DROP = 1.6 // coming down further than this below where it is (or where it's going, if that's lower) is a fall
// The headings a try can take, as turns (radians) off the way to the target
const TURNS = [0, 0.44, -0.44, 0.87, -0.87, 1.4, -1.4, 2.1, -2.1, Math.PI]
const JUMP_TURNS = 5 // only the first few of those are tried with a jump
const JUMP_DELAYS = [0, 0.15, 0.3, 0.45]
const HOP = 0.4 // of its speed, for a short hop
const ROLLS = [0.45, 0.7] // seconds, for a roll under something and back up
const ROLL_JUMPS = [0.15, 0.35, 0.6] // ...and then a jump, this long after
const NONE = 0
const OK = 1
const BLOCKED = 2

export type PilotSkill = {
  speed: number // 0..1 of flat out
  margin: number // how wide a berth it gives hazards (m)
  start: number // seconds after RUN before it gets going
  lapse: number // how long its mind wanders when it does (seconds, give or take; 0: never)
}

// Scratch, shared by every pilot (one decides at a time)
const hazards: Solid[][] = Array.from({ length: STEPS + 1 }, () => [])
const floors: Solid[][] = Array.from({ length: STEPS + 1 }, () => [])
const nearEdges: GrabEdge[] = []
const others: number[] = [] // the runners about: x, y, z, and how fast they're going (x, z), one after another
const ELBOW = 0.92 // how near another runner's middle it can get
// Where bots in mid-jump mean to come down, so nobody else jumps for the same spot: counted as someone
// standing there until they've landed
type Claim = { by: Pilot; x: number; y: number; z: number; until: number }
const claims: Claim[] = []
// Loose things about: x, y, z, their speed (x, y, z), how far out they reach sideways and up and down
const loose: number[] = []
const LOOSE = 9 // numbers each
const SEEN_WITHIN = 9 // metres
const LOOSE_HITS = 1.5 // moving faster than this (m/s), a loose thing knocks you over
const seenBodies = new Set<number>()
let lookBall: InstanceType<Physics['rapier']['Ball']> | null = null
const NO_TURN = { x: 0, y: 0, z: 0, w: 1 }
let groundY = 0
let groundSolid: Solid | null = null
let downRay: InstanceType<Physics['rapier']['Ray']> | null = null
const probe = { x: 0, y: 0, z: 0 }
const sim = { hit: -1, fall: -1, x: 0, y: 0, z: 0, landed: false, hang: false, blocked: 0, grounded: false }
const target: P3 = [0, 0, 0]
// With the point it's heading for one to pass through rather than stop at (`through`), the point after it
const then: P3 = [0, 0, 0]
let via = false
// How far into a try step k is
const tauOf = (k: number) => (k <= SHORT ? k * GRID : SHORT * GRID + (k - SHORT) * 2 * GRID)

// Looking for ground among pieces that stand until they go (see `standing` in ../kinematic): a ray stops at
// anything fixed, and at such a piece if it'll still be there at the moment looked at (`lookAt`), unless it's
// looked at as it moves instead (on the timetable, all in `floors`) or it's something that knocks you about
let planNow = 0
let lookAt = 0
let lookPhysics: Physics | null = null
function stillThere(c: RapierCollider) {
  const body = c.parent()
  if (!body) return true
  const until = standing.get(body.handle)
  if (until === undefined) return !body.isKinematic()
  if (until() <= lookAt + 0.25) return false
  const moving = timetabled.get(body.handle)
  return !moving || (!moving.hazard && !foreseen(lookPhysics!, body.handle))
}

export class Pilot {
  readonly route: Route
  readonly skill: PilotSkill
  readonly bias: number
  i = 0 // the point it's heading for
  private memo: Record<string, number> = {}
  private from: P3 = [0, 0, 0] // where it's coming from: the last point (or where it was put down)
  private fromSet = false
  private arrived = 0 // when it got to that point
  private respawns = 0
  // The plan: the way it's running, whether it's rolling, when it means to jump
  private hx = 0
  private hz = 0
  private roll = false
  private rollUntil = Infinity // when the roll it means to make is over (Infinity: it keeps on rolling)
  private jumpDue = -1
  private jumpFrames = 0
  private landing: P3 | null = null // where the jump it's planning comes down
  private homing: P3 | null = null // in the air from a jump: the spot it's making for
  private homingUntil = 0
  private nextDecide = 0
  private pulse = 0 // Space, on and off, while hanging
  private leaping = -1 // until when it's in the air from a leap
  private wasRolling = false
  // Getting nowhere: when it last got anywhere (more than a few steps from `anchor`)
  private anchor: P3 = [0, 0, 0]
  private since = 0
  private nudgeUntil = 0
  private lapseAt = -1 // when its mind next wanders, and until when
  private lapseUntil = 0
  quit = false // it's given up: put it back at its checkpoint
  waiting = false // (for anyone watching) nothing it could do just now was safe

  constructor(route: Route, skill: PilotSkill, bias: number) {
    this.route = route
    this.skill = skill
    this.bias = bias
  }

  // Back at a checkpoint (or the start): carry on from there
  resume(checkpoint: number) {
    this.i = resumeAt(this.route, checkpoint)
    this.memo = {}
    this.fromSet = false
    this.hx = this.hz = 0
    this.jumpDue = this.leaping = -1
    this.roll = false
    this.homing = null
    this.since = -1
    this.quit = false
    this.nextDecide = 0
  }

  private view(now: number, p: { x: number; y: number; z: number }, physics: Physics): BotView {
    return { t: now, x: p.x, y: p.y, z: p.z, bias: this.bias, memo: this.memo, physics }
  }

  // Where point n is for this bot: its spot, moved to the bot's side of the way
  private aim(n: number, v: BotView, into: P3) {
    const w = this.route[n]
    const at = typeof w.at === 'function' ? w.at(v) : w.at
    into[0] = at[0]
    into[1] = at[1]
    into[2] = at[2]
    if (w.spread) {
      const dx = at[0] - this.from[0]
      const dz = at[2] - this.from[2]
      const len = Math.hypot(dx, dz) || 1
      into[0] += (-dz / len) * this.bias * w.spread
      into[2] += (dx / len) * this.bias * w.spread
    }
    return w
  }

  // One frame: fills `input` with what the body should do
  update(input: RunnerInput, rb: RapierRigidBody, runner: Runner, physics: Physics, now: number, canMove: boolean, checkpoint: number, finished: boolean) {
    input.x = input.z = 0
    input.jump = input.drop = input.crouchHeld = input.crouchPressed = false
    if (runner.respawns !== this.respawns) {
      this.respawns = runner.respawns
      this.resume(checkpoint)
    }
    if (!canMove || now < this.skill.start || this.i >= this.route.length) return
    const p = rb.translation()
    const v = this.view(now, p, physics)
    const feet = p.y - 1
    if (!this.fromSet) {
      this.fromSet = true
      this.from[0] = p.x
      this.from[1] = feet
      this.from[2] = p.z
    }

    // On to the next point, once this one's reached (or passed: it's behind, along the way from the last)
    let w: Waypoint = this.aim(this.i, v, target)
    for (let guard = 0; guard < 4; guard++) {
      const dx = target[0] - p.x
      const dz = target[2] - p.z
      const level = Math.abs(feet - target[1]) < 1.3
      let there = Math.hypot(dx, dz) < (w.r ?? REACH) && level
      if (!there && level && !w.leap) {
        const ax = target[0] - this.from[0]
        const az = target[2] - this.from[2]
        const len = Math.hypot(ax, az) || 1
        const along = (-dx * ax - dz * az) / len // how far past it
        const aside = Math.abs(-dx * az + dz * ax) / len
        there = along > 0 && aside < Math.max(3, (w.spread ?? 0) + 2)
      }
      if (!there || w.hold || (w.leap && !runner.grounded) || w.wait?.(v)) break
      const leap = w.leap
      this.from[0] = target[0]
      this.from[1] = target[1]
      this.from[2] = target[2]
      this.i++
      this.memo = {}
      v.memo = this.memo
      this.since = -1
      this.arrived = now
      if (this.i >= this.route.length) return
      w = this.aim(this.i, v, target)
      if (leap) {
        // Jump for it, heading on
        this.leaping = now + 1.4
        this.jumpFrames = 3
        this.jumpDue = -1
        this.nextDecide = now + 0.3
        break
      }
    }
    const tx = target[0] - p.x
    const tz = target[2] - p.z
    const left = Math.hypot(tx, tz)
    const ux = left > 1e-3 ? tx / left : 0
    const uz = left > 1e-3 ? tz / left : 0

    // Knocked off the way here (well below it)? Back to where it starts
    if (w.back && runner.grounded) {
      const ax = target[0] - this.from[0]
      const az = target[2] - this.from[2]
      const t = Math.max(0, Math.min(1, ((p.x - this.from[0]) * ax + (p.z - this.from[2]) * az) / (ax * ax + az * az || 1)))
      if (feet < this.from[1] + (target[1] - this.from[1]) * t - (w.drop ?? DROP)) {
        let to = resumeAt(this.route, checkpoint)
        for (let j = this.i - 1; j > to; j--) {
          const at = this.route[j].at
          if (Math.abs((typeof at === 'function' ? at(v) : at)[1] - feet) < 0.9) {
            to = j
            break
          }
        }
        this.i = to
        this.fromSet = false
        this.memo = {}
        this.since = -1
        return
      }
    }

    // Getting anywhere? (Staying put where it's meant to stay isn't getting nowhere)
    if (w.hold || w.wait?.(v)) this.since = now
    if (this.since < 0 || Math.hypot(p.x - this.anchor[0], p.y - this.anchor[1], p.z - this.anchor[2]) > 2.5) {
      this.anchor[0] = p.x
      this.anchor[1] = p.y
      this.anchor[2] = p.z
      this.since = now
    }
    const stuck = now - this.since
    if (finished && stuck > 1.5) {
      // Over the line and as far out of the way as it's going to get: that'll do
      this.i = this.route.length
      return
    }
    if (stuck > STUCK_QUIT) {
      this.quit = true
      return
    }

    // Every so often its mind wanders, and it just stands there a moment (some more than others)
    if (this.skill.lapse > 0) {
      if (this.lapseAt < 0) this.lapseAt = now + 4 + Math.random() * 9
      if (now >= this.lapseAt && runner.grounded && !runner.hang.edge && !this.homing) {
        this.lapseUntil = now + this.skill.lapse * (0.5 + Math.random())
        this.lapseAt = this.lapseUntil + 5 + Math.random() * 9
      }
      if (now < this.lapseUntil) {
        this.since = now
        this.jumpDue = -1
        return
      }
    }

    // Hanging: do what gets it on from whatever it's caught
    const edge = runner.hang.edge
    if (edge) {
      this.pulse += 1
      const press = this.pulse % 14 < 7
      this.jumpDue = -1
      this.nextDecide = 0
      if (this.since >= 0) this.since = Math.max(this.since, now - STUCK_NUDGE) // hanging on isn't getting nowhere (not yet)
      if (edge.kind === 'ledge') {
        input.jump = press && !runner.hang.climbing
      } else {
        input.x = ux
        input.z = uz
        input.jump = press
      }
      return
    }
    this.pulse = 0

    // In the air from a leap: keep heading on (and for the hold or bar it was for)
    if (now < this.leaping) {
      if (runner.grounded && this.jumpFrames === 0 && now > this.leaping - 1.1) this.leaping = -1
      else {
        input.x = ux * this.skill.speed
        input.z = uz * this.skill.speed
        if (this.jumpFrames > 0) {
          this.jumpFrames--
          input.jump = true
        }
        return
      }
    }
    // Didn't make it (back on the ground: where it leapt from, or with the next point still up out of
    // reach): go back for another go
    const last = this.i > 0 ? this.route[this.i - 1] : null
    if (last && (last.leap || last.retry) && runner.grounded && now > this.arrived + 1.5) {
      const back = Math.hypot(p.x - this.from[0], p.z - this.from[2]) < 2.6 && Math.abs(feet - this.from[1]) < 1
      if (target[1] - feet > 0.9 || (last.leap && back)) {
        this.i--
        this.since = -1
        this.fromSet = false
        this.memo = {}
        return
      }
    }

    // In the air from a jump of its own: make for where it meant to come down (no second thoughts)
    if (this.homing) {
      if (now > this.homingUntil || (runner.grounded && now > this.homingUntil - 1.25) || Math.hypot(runner.knock.x, runner.knock.z) > 2) this.homing = null
      else {
        const dx = this.homing[0] - p.x
        const dz = this.homing[2] - p.z
        const d = Math.hypot(dx, dz)
        const pace = d > 1e-3 ? (Math.min(1, d / 0.45) * this.skill.speed) / d : 0
        input.x = dx * pace
        input.z = dz * pace
        if (this.jumpFrames > 0) {
          this.jumpFrames--
          input.jump = true
        }
        this.nextDecide = 0
        return
      }
    }

    // Decide what to do, every so often (and at once when the last plan's run out); but with a jump about to
    // happen, jump (thinking again just before it, it could put it off again, and again)
    if (now >= this.nextDecide && !(this.jumpDue > now && this.jumpDue - now < DECIDE_EVERY)) {
      this.nextDecide = now + DECIDE_EVERY
      if (stuck > STUCK_NUDGE && now >= this.nudgeUntil) {
        // Getting nowhere: make for somewhere else nearby for a moment (as carefully as anywhere)
        const a = Math.random() * Math.PI * 2
        target[0] = p.x + Math.cos(a) * 4
        target[2] = p.z + Math.sin(a) * 4
        via = false
        this.plan(rb, runner, physics, now, p, Math.cos(a), Math.sin(a), 4, this.skill.margin, DROP)
        this.nudgeUntil = now + 2.5
        this.nextDecide = now + 0.6
      } else {
        via = Boolean(w.through) && this.i + 1 < this.route.length
        if (via) this.aim(this.i + 1, v, then)
        this.plan(rb, runner, physics, now, p, ux, uz, left, w.tight ? 0 : this.skill.margin, w.drop ?? DROP)
      }
    }

    input.x = this.hx * this.skill.speed
    input.z = this.hz * this.skill.speed
    if (this.jumpDue >= 0 && now >= this.jumpDue - 0.009 && runner.grounded) {
      this.jumpFrames = 3
      this.jumpDue = -1
      this.nextDecide = now + 0.08
      if (this.landing) {
        claims.push({ by: this, x: this.landing[0], y: this.landing[1], z: this.landing[2], until: now + 1.1 })
        this.homing = this.landing
        this.homingUntil = now + 1.4
      }
    }
    if (this.jumpFrames > 0) {
      this.jumpFrames--
      input.jump = true
    }
    const rolling = this.roll && now < this.rollUntil
    input.crouchHeld = rolling
    input.crouchPressed = rolling && !this.wasRolling
    this.wasRolling = rolling
  }

  // -------------------------------------------------------------------------------------------------------
  // Trying things out

  private plan(
    rb: RapierRigidBody,
    runner: Runner,
    physics: Physics,
    now: number,
    p: { x: number; y: number; z: number },
    ux: number,
    uz: number,
    left: number,
    margin: number,
    drop: number,
  ) {
    const vel = rb.linvel()
    const speed = SPEED * this.skill.speed
    const grounded = runner.grounded
    planNow = now
    lookPhysics = physics
    // What's about, moment by moment, as far as this bot could get to by then
    for (let k = 0; k <= STEPS; k++) {
      const tau = tauOf(k)
      const all = solidsAt(physics, now + tau)
      const reach = 1.4 + 7.6 * tau
      const hs = hazards[k]
      const fs = floors[k]
      hs.length = 0
      fs.length = 0
      for (const s of all) {
        const d = s.bound + reach
        if (Math.abs(s.x - p.x) > d || Math.abs(s.z - p.z) > d || Math.abs(s.y - p.y) > s.bound + 14) continue
        if (s.hazard) hs.push(s)
        else fs.push(s)
      }
    }
    // Who else is about
    others.length = 0
    for (const r of allRunners()) {
      if (r.handle === rb.handle) continue
      const o = r.position()
      if (Math.abs(o.x - p.x) > 14 || Math.abs(o.z - p.z) > 14 || Math.abs(o.y - p.y) > 5) continue
      const ov = r.velocity()
      others.push(o.x, o.y, o.z, ov.x, ov.z)
    }
    for (let c = claims.length - 1; c >= 0; c--) {
      const claim = claims[c]
      if (claim.until < now) claims.splice(c, 1)
      else if (claim.by !== this && Math.abs(claim.x - p.x) < 14 && Math.abs(claim.z - p.z) < 14) others.push(claim.x, claim.y, claim.z, 0, 0)
    }
    // What's loose about
    loose.length = 0
    seenBodies.clear()
    const { world, rapier } = physics
    const ball = (lookBall ??= new rapier.Ball(SEEN_WITHIN))
    const notLoose = rapier.QueryFilterFlags.EXCLUDE_FIXED | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC | rapier.QueryFilterFlags.EXCLUDE_SENSORS
    world.intersectionsWithShape(p, NO_TURN, ball, (c) => {
      const body = c.parent()
      if (!body || isRunner(body.handle) || seenBodies.has(body.handle)) return true
      seenBodies.add(body.handle)
      const shape = c.shape as unknown as { type: number; radius?: number; halfHeight?: number; halfExtents?: { x: number; y: number; z: number } }
      let wide = 1
      let tall = 1
      if (shape.halfExtents) {
        wide = Math.hypot(shape.halfExtents.x, shape.halfExtents.z) * 0.85
        tall = shape.halfExtents.y
      } else if (shape.radius !== undefined) {
        wide = shape.radius
        tall = shape.halfHeight ?? shape.radius
      }
      const at = c.translation()
      const v = body.linvel()
      loose.push(at.x, at.y, at.z, v.x, v.y, v.z, wide, tall, Math.hypot(v.x, v.y, v.z))
      return true
    }, notLoose)
    // Ledges within reach of a jump
    nearEdges.length = 0
    for (const e of grabEdges()) {
      const mx = (e.a.x + e.b.x) / 2
      const mz = (e.a.z + e.b.z) / 2
      const half = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z) / 2
      if (Math.hypot(mx - p.x, mz - p.z) < half + 7 && Math.abs(e.a.y - p.y) < 4) nearEdges.push(e)
    }

    // What it's standing on, if that's something that moves: staying put means staying on it
    let stayX = 0
    let stayZ = 0
    if (grounded && this.ground(physics, p.x, p.y - 0.4, p.z, 1.3, 0) === OK && groundSolid) {
      const dx = groundSolid.x - p.x
      const dz = groundSolid.z - p.z
      const off = Math.hypot(dx, dz)
      if (off > 0.4) {
        const pace = Math.min(1, off / 1.5) / off
        stayX = dx * pace
        stayZ = dz * pace
      }
    }

    const feet = p.y - 1
    const low = Math.min(feet, target[1], via ? then[1] : Infinity) - drop // coming down lower than this is a fall
    // How far it has to go: to the target, or through it and on to the next
    const leg = via ? Math.hypot(then[0] - target[0], then[2] - target[2]) : 0
    const total = left + leg
    const ideal = Math.min(total, speed * 1.8)
    const floor = runner.floor
    let best = -Infinity
    let bx = 0
    let bz = 0
    let bJump = -1
    let bRoll = 0
    let landX = 0
    let landY = 0
    let landZ = 0
    let lands = false

    // (`pace`: how much of its speed it runs at)
    // (`roll`: how long it rolls for, in seconds: 0 not at all, Infinity on and on)
    const attempt = (hx: number, hz: number, jumpAt: number, roll: number, cost: number, arrive = false, pace = 1) => {
      this.simulate(physics, p, vel.y, grounded, floor, hx * pace, hz * pace, speed, jumpAt, roll, low, BODY + margin, arrive)
      let score: number
      // (Nothing safe? Better knocked about, later rather than sooner, than off the edge)
      if (sim.fall >= 0) score = -1000 + sim.fall * 200
      else if (sim.hit >= 0) score = -600 + sim.hit * 100
      else {
        const d = Math.hypot(target[0] - sim.x, target[2] - sim.z) + leg
        score = total - (via ? Math.min(d, Math.hypot(then[0] - sim.x, then[2] - sim.z)) : d) - cost - sim.blocked * 0.02 + (sim.hang ? -0.3 : 0)
      }
      if (score > best) {
        best = score
        bx = hx * pace
        bz = hz * pace
        bJump = jumpAt
        bRoll = roll
        lands = sim.landed
        landX = sim.x
        landY = sim.y
        landZ = sim.z
      }
      return score
    }

    // Straight for it first: if that's safe and gets on, look no further
    const straight = left > 0.05 ? attempt(ux, uz, -1, 0, 0, true) : -Infinity
    if (straight < ideal * 0.7) {
      const base = Math.atan2(uz, ux)
      for (let n = left > 0.05 ? 1 : 0; n < TURNS.length; n++) {
        const a = base + TURNS[n]
        attempt(Math.cos(a), Math.sin(a), -1, 0, Math.abs(TURNS[n]) * 0.25)
      }
      attempt(stayX, stayZ, -1, 0, 0.05) // stay put
      if (grounded) {
        // (Where it means to be already, something coming at it could come from anywhere: it can jump any way,
        // or on the spot)
        const here = left < 1.2
        for (let n = 0; n < (here ? TURNS.length : JUMP_TURNS); n++) {
          const a = base + TURNS[n]
          for (const delay of JUMP_DELAYS) attempt(Math.cos(a), Math.sin(a), delay, 0, 0.3 + (here ? 0 : Math.abs(TURNS[n]) * 0.25) + delay * 0.2, n === 0)
        }
        // ...or on the spot, or a short hop over whatever's coming (not to land far from where it was)
        for (const delay of JUMP_DELAYS) attempt(stayX, stayZ, delay, 0, 0.3 + delay * 0.2)
        for (let n = 0; n < (here ? TURNS.length : JUMP_TURNS); n++) {
          const a = base + TURNS[n]
          for (let d = 0; d < (here ? 3 : 2); d++) attempt(Math.cos(a), Math.sin(a), JUMP_DELAYS[d], 0, 0.35 + JUMP_DELAYS[d] * 0.2, false, HOP)
        }
        // Rolling is for getting under things: on and on, or just under the one in the way and back up (and
        // then, for something to jump coming soon after, a jump)
        if (left > 0.05 && hazards[2].length + hazards[8].length + hazards[14].length > 0) {
          attempt(ux, uz, -1, Infinity, 0.6)
          for (const time of ROLLS) {
            attempt(ux, uz, -1, time, 0.6)
            for (const after of ROLL_JUMPS) attempt(ux, uz, time + after, time, 0.7)
          }
        }
      }
    }
    this.waiting = best < -100
    this.hx = bx
    this.hz = bz
    this.roll = bRoll > 0
    this.rollUntil = now + bRoll
    this.jumpDue = bJump >= 0 ? now + bJump : -1
    this.landing = bJump >= 0 && lands ? [landX, landY, landZ] : null
  }

  // What's under (x, z), from `top` down as far as `reach`, at step k: OK (groundY, and groundSolid if it's
  // something that moves), NONE, or BLOCKED (starting inside something, or coming down on a wall)
  private ground(physics: Physics, x: number, top: number, z: number, reach: number, k: number) {
    const { world, rapier } = physics
    const r = (downRay ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }))
    probe.x = x
    probe.y = top
    probe.z = z
    r.origin = probe
    const crumbling = standing.size > 0
    const flags =
      (crumbling ? 0 : rapier.QueryFilterFlags.EXCLUDE_KINEMATIC) | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_SENSORS
    let status = NONE
    groundY = -Infinity
    groundSolid = null
    lookAt = planNow + tauOf(k)
    const hit = world.castRayAndGetNormal(r, reach, true, flags, NOT_COMES_AND_GOES, undefined, undefined, crumbling ? stillThere : undefined)
    if (hit) {
      if (hit.timeOfImpact <= 1e-4 || hit.normal.y < 0.5) return BLOCKED
      groundY = top - hit.timeOfImpact
      status = OK
    }
    for (const s of floors[k]) {
      const d = s.bound + 0.1
      if (Math.abs(s.x - x) > d || Math.abs(s.z - z) > d) continue
      const t = rayDown(s, x, top, z, reach)
      if (t < 0) continue
      if (t === 0) return BLOCKED
      if (ray.up > 0.5 && top - t > groundY) {
        groundY = top - t
        groundSolid = s
        status = OK
      }
    }
    return status
  }

  // Standing: the body's middle may be out over an edge and still be held up by its sides
  private footing(physics: Physics, x: number, top: number, z: number, reach: number, k: number) {
    let status = this.ground(physics, x, top, z, reach, k)
    if (status !== NONE) return status
    for (let n = 0; n < 4 && status === NONE; n++) {
      status = this.ground(physics, x + (n === 0 ? 0.35 : n === 1 ? -0.35 : 0), top, z + (n === 2 ? 0.35 : n === 3 ? -0.35 : 0), reach, k)
    }
    return status === BLOCKED ? NONE : status
  }

  // One try: from where the bot is, running the way (hx, hz), jumping `jumpAt` seconds in (-1: not at all),
  // rolling or not; with `arrive`, stopping at the target when it gets there (rather than running on past
  // it, off the far side of whatever it's on). Leaves how it went in `sim`.
  private simulate(
    physics: Physics,
    p: { x: number; y: number; z: number },
    vy0: number,
    grounded0: boolean,
    floor: { x: number; z: number } | null,
    hx0: number,
    hz0: number,
    speed: number,
    jumpAt: number,
    roll: number,
    low: number,
    near: number, // how close its middle (or chest, or knees) can come to a hazard
    arrive: boolean,
  ) {
    let hx = hx0
    let hz = hz0
    let x = p.x
    let y = p.y
    let z = p.z
    let vy = vy0
    let grounded = grounded0
    let jumped = false
    let fvx = floor ? floor.x : 0
    let fvz = floor ? floor.z : 0
    let tau = 0
    let after = 0
    // Where it's stopping (or, on the way through the target, passing)
    let toX = target[0]
    let toZ = target[2]
    let last = !via
    sim.hit = sim.fall = -1
    sim.landed = sim.hang = false
    sim.blocked = 0
    let k = 1
    for (; k <= STEPS; k++) {
      const dt = k <= SHORT ? GRID : 2 * GRID
      if (grounded && jumpAt >= 0 && !jumped && tau >= jumpAt - 1e-6) {
        vy = JUMP_VELOCITY
        grounded = false
        jumped = true
        fvx = fvz = 0
      }
      const rolling = tau < roll
      const run = speed * (rolling ? STANCES.roll.speed : 1)
      tau += dt
      let nx = x + (hx * run + fvx) * dt
      let nz = z + (hz * run + fvz) * dt
      if (arrive && Math.hypot(toX - x, toZ - z) <= run * dt + 0.02) {
        if (last) {
          // There: stop
          nx = toX + fvx * dt
          nz = toZ + fvz * dt
          hx = hz = 0
          arrive = false
        } else {
          // Through: on for the next
          last = true
          toX = then[0]
          toZ = then[2]
          const d = Math.hypot(toX - x, toZ - z) || 1
          hx = (toX - x) / d
          hz = (toZ - z) / d
          nx = x + (hx * run + fvx) * dt
          nz = z + (hz * run + fvz) * dt
        }
      }
      // Something loose standing in the way (and this is into it, not away)?
      for (let o = 0; o < loose.length; o += LOOSE) {
        if (loose[o + 8] > LOOSE_HITS || Math.abs(loose[o + 1] - y) > loose[o + 7] + 1) continue
        const reach = loose[o + 6] + 0.5
        const d = Math.hypot(nx - loose[o], nz - loose[o + 2])
        if (d < reach && d < Math.hypot(x - loose[o], z - loose[o + 2])) {
          nx = x
          nz = z
          sim.blocked++
          break
        }
      }
      // Someone in the way (and this is into them, not away)?
      for (let o = 0; o < others.length; o += 5) {
        if (Math.abs(others[o + 1] - y) > 1.7) continue
        const ex = others[o] + others[o + 3] * tau
        const ez = others[o + 2] + others[o + 4] * tau
        const d = Math.hypot(nx - ex, nz - ez)
        if (d < ELBOW && d < Math.hypot(x - ex, z - ez)) {
          nx = x
          nz = z
          sim.blocked++
          break
        }
      }
      if (grounded) {
        // (Looked for from head height down: a step up, a wall, or something too low to walk under is in the way)
        const status = this.footing(physics, nx, y + 0.95, nz, 2.65, k)
        if (status === OK && groundY <= y - 0.5) {
          x = nx
          z = nz
          y = groundY + 1
        } else if (status === NONE) {
          x = nx
          z = nz
          grounded = false
          vy = 0
          fvx = fvz = 0
          if (rolling) {
            // (A roll that runs out of ground isn't a plan: it can't be kept up in the air)
            sim.fall = tau
            break
          }
        } else {
          // Something in the way: stay put (if the floor's still here)
          sim.blocked++
          const here = this.footing(physics, x, y - 0.4, z, 1.3, k)
          if (here === NONE) {
            grounded = false
            vy = 0
          } else if (here === OK) y = groundY + 1
        }
      } else {
        const before = y - 1
        vy -= G * dt
        const ny = y + vy * dt
        const top = Math.max(before, ny - 1) + 0.6
        const reach = top - (ny - 1) + 0.02
        let mx = nx
        let mz = nz
        let status = this.ground(physics, mx, top, mz, reach, k)
        if (status === BLOCKED || (status === OK && groundY > before + 0.3 && groundY > ny - 0.7)) {
          // Up against something: no further that way
          sim.blocked++
          mx = x
          mz = z
          status = this.ground(physics, mx, top, mz, reach, k)
        }
        x = mx
        z = mz
        if (status === OK && vy <= 0 && groundY >= ny - 1.02) {
          if (groundY < low) {
            // (Down on something, but too far down: that's a fall too)
            sim.fall = tau
            break
          }
          y = groundY + 1
          grounded = true
          vy = 0
          sim.landed = true
        } else {
          y = ny
          if (!rolling && vy < 6 && nearEdges.length) {
            probe.x = x
            probe.y = y
            probe.z = z
            if (findGrab(probe, vy, G, null, nearEdges)) {
              sim.hang = true
              break
            }
          }
        }
      }
      // Anything knocking it about?
      let struck = false
      for (const s of hazards[k]) {
        const d = s.bound + near + 0.5
        if (Math.abs(s.x - x) > d || Math.abs(s.z - z) > d || Math.abs(s.y - y) > d + 0.5) continue
        if (rolling ? distance(s, x, y - 0.48, z) < near : distance(s, x, y + 0.42, z) < near || distance(s, x, y - 0.42, z) < near) {
          struck = true
          break
        }
      }
      // ...or anything loose coming at it (or in its way)
      for (let o = 0; o < loose.length && !struck; o += LOOSE) {
        const falling = Math.abs(loose[o + 4]) > 1
        const ly = falling ? Math.max(loose[o + 1] + loose[o + 4] * tau - 0.5 * G * tau * tau, y - 1 + loose[o + 7]) : loose[o + 1]
        if (Math.abs(ly - y) > loose[o + 7] + 1.1) continue
        const lx = loose[o] + loose[o + 3] * tau
        const lz = loose[o + 2] + loose[o + 5] * tau
        const d = Math.hypot(x - lx, z - lz) - loose[o + 6]
        if (d < near && loose[o + 8] > LOOSE_HITS) struck = true
      }
      if (struck) {
        sim.hit = tau
        break
      }
      if (y - 1 < low - 3) {
        sim.fall = tau
        break
      }
      // Down from a jump: a few steps on, then stand (a landing isn't safe until nothing's about to hit it)
      if (sim.landed && ++after >= 3 && !arrive) hx = hz = 0
    }
    // Still in the air at the end: does it come down on anything?
    if (!grounded && !sim.hang && sim.hit < 0 && sim.fall < 0) {
      const status = this.ground(physics, x, y - 0.4, z, 40, Math.min(k, STEPS))
      if (status !== OK || groundY < low) sim.fall = tau
    }
    sim.x = x
    sim.y = y
    sim.z = z
    sim.grounded = grounded
  }
}
