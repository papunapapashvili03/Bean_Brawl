import type { RapierRigidBody } from '@react-three/rapier'
import { allRunners } from '../playerContact'
import type { BotTraits, Steering } from '../race/bots/steering'
import { JUMP_VELOCITY, SPEED, type Runner, type RunnerInput } from '../runner'
import { BEAM_HALF, LOW_Y, PILLAR, RADIUS, SECTIONS, SECTION_ANGLE, along, angleOf, mod, sectionOf } from './course'
import { gone, highAngle, highSpin, lowAngle, lowSpin, round, warned } from './state'

// A bot's mind on Beam Sweep. It knows exactly where both beams are and how fast they're turning, so it
// knows when each will next sweep over where it's standing. It keeps crouched (under the high beam, and
// ready), and jumps each sweep of the low one: at a moment that has it high enough all the while the beam's
// under it, and back down before the high one comes round (or not up until it's gone by). Its timing's as
// good as it is: the less able are a little early or late, now and then too much so, and now and then miss
// one altogether. It stands somewhere roomy, well out from the pillar (where the beams take longest to go by)
// but not out at the edge, and moves off a section that's about to drop.

const G = 20
const AIRTIME = (2 * JUMP_VELOCITY) / G
const CLEAR = LOW_Y + BEAM_HALF + 0.04 // feet this high clear the low beam
const ROOT = Math.sqrt(JUMP_VELOCITY ** 2 - 2 * G * CLEAR)
const UP_BY = (JUMP_VELOCITY - ROOT) / G // after jumping, feet are clear of it from then
const DOWN_AT = (JUMP_VELOCITY + ROOT) / G // until then
const BODY = 0.5 // its radius
const AIR_MARGIN = 0.06 // seconds kept between being in the air and the high beam going by
const SPOT_EVERY = 0.8

type Sweep = [number, number] // from when a beam touches a body here, to when it's clear

// When the beam next sweeps over a point at angle a, r out (it's a bar right across: either end will do)
function sweep(angle: (t: number) => number, spin: (t: number) => number, now: number, a: number, r: number): Sweep {
  const half = Math.min(1.2, (BEAM_HALF + BODY + 0.08) / Math.max(r, 0.5))
  const at = angle(now)
  let d = mod(a - at, Math.PI) // how much further it turns until it's lined up with the point
  if (d > Math.PI - half) d -= Math.PI // (still going over it)
  return [whenAt(angle, spin, now, at + d - half), whenAt(angle, spin, now, at + d + half)]
}
// When the beam's turned to `target` (now, if it already has; never, if it's stopped)
function whenAt(angle: (t: number) => number, spin: (t: number) => number, now: number, target: number) {
  let t = now
  let a = angle(t)
  if (target <= a) return now
  for (let k = 0; k < 5; k++) {
    const w = spin(t)
    if (!w) return Infinity
    t += (target - a) / w
    a = angle(t)
  }
  return t
}

export class JumpBrain implements Steering {
  quit = false
  private readonly speed: number
  private readonly wobble: number // how far off its timing can be (seconds, give or take)
  private readonly misses: number // how likely it is to miss a sweep altogether
  private readonly start: number
  private readonly seed: number
  private plannedFor = -1 // the low sweep (by when it's gone by) it's planned a jump for, and
  private jumpAt = Infinity // when it'll jump for it
  private jumpFrames = 0
  private spot: { x: number; z: number } | null = null
  private nextSpot = 0

  constructor(bot: BotTraits) {
    const { level, mistakes } = bot.skill
    this.speed = SPEED * bot.skill.speed
    this.wobble = (0.03 + 0.09 * (1 - level)) * Math.sqrt(mistakes)
    this.misses = (bot.skill.lapse > 0 ? 0.006 + 0.05 * (1 - level) ** 2 : 0.003) * mistakes
    this.start = bot.skill.start
    this.seed = (bot.bias + 1) * 9973
  }

  update(input: RunnerInput, rb: RapierRigidBody, runner: Runner, _physics: unknown, now: number, canMove: boolean) {
    input.x = input.z = 0
    input.jump = input.drop = input.crouchHeld = input.crouchPressed = false
    if (!canMove || now < this.start || round.over) return
    const p = rb.translation()
    const v = rb.linvel()
    if (p.y < -1) return // (off the edge: nothing to be done)
    const grounded = runner.grounded && v.y < 1
    const r = Math.hypot(p.x, p.z)
    const a = angleOf(p.x, p.z)

    // The next sweep of the low beam over it, and of the high one: the jump for the low one, planned once
    const low = sweep(lowAngle, lowSpin, now, a, r)
    const high = sweep(highAngle, highSpin, now, a, r)
    if (Math.abs(low[1] - this.plannedFor) > 0.25) {
      this.plannedFor = low[1]
      this.jumpAt = Math.random() < this.misses ? Infinity : this.plan(low, high) + this.wobble * gauss()
    }

    // Somewhere to stand: moving there (crouched) while there's time before the next sweep
    if (now >= this.nextSpot || !this.spot || this.unsafe(this.spot, now)) {
      this.nextSpot = now + SPOT_EVERY
      this.spot = this.pickSpot(rb.handle, p, now)
    }
    // Getting off a section that's going: standing, flat out. Otherwise moving only while there's a lull
    // between sweeps, and crouched.
    const fleeing = this.unsafe(p, now)
    const quiet = Math.min(low[0], high[0]) - now > 0.45 || (high[1] < low[0] && now > high[1] && low[0] - now > 0.3)
    const dx = this.spot ? this.spot.x - p.x : 0
    const dz = this.spot ? this.spot.z - p.z : 0
    const d = Math.hypot(dx, dz)
    const moving = grounded && d > 0.3 && (quiet || fleeing)
    const highSoon = high[0] - now < 0.3 && high[1] > now
    const still = Math.hypot(v.x, v.z) < 1
    const stance = runner.posture.stance

    // Jump when it's time (crouched, it stands up as it goes). On the floor otherwise: crouched, unless it's
    // running for it (then up, until the high beam's close); changing stance, it stops for a moment first
    // (moving, the same key would have it roll)
    if (grounded && now >= this.jumpAt && now <= low[1]) {
      this.jumpFrames = 2
      this.jumpAt = Infinity
    } else if (grounded && this.jumpFrames === 0) {
      const want = fleeing && moving && !highSoon ? 'stand' : 'crouch'
      if (stance !== want && stance !== 'roll') {
        if (still) input.crouchPressed = true
      } else if (moving) {
        const pace = (Math.min(1, d / 0.6) * this.speed) / SPEED / d
        input.x = dx * pace
        input.z = dz * pace
      }
    }
    if (this.jumpFrames > 0) {
      this.jumpFrames--
      input.jump = true
    }
  }

  // When to jump for this sweep of the low beam: high enough all the while it's going under, and either back
  // down before the high one sweeps by or not off the floor until it's gone
  private plan(low: Sweep, high: Sweep) {
    let from = low[1] - DOWN_AT
    let to = low[0] - UP_BY
    if (high[0] >= low[0]) to = Math.min(to, high[0] - AIR_MARGIN - AIRTIME)
    else from = Math.max(from, high[1] + AIR_MARGIN)
    // (No moment does both: clear the low one, and hope)
    return from <= to ? (from + to) / 2 : (low[1] - DOWN_AT + low[0] - UP_BY) / 2
  }

  // Somewhere that's going to drop (or has), off the platform, or too near the pillar or the edge
  private unsafe(at: { x: number; z: number }, now: number) {
    const r = Math.hypot(at.x, at.z)
    if (r < PILLAR + 2 || r > RADIUS - 1.2) return true
    const s = sectionOf(at.x, at.z)
    return gone(s) || warned(s, now)
  }

  // Where to stand: on a section that's staying, well out from the pillar, clear of the others
  private pickSpot(me: number, p: { x: number; z: number }, now: number) {
    const others: { x: number; z: number }[] = []
    for (const r of allRunners()) if (r.handle !== me && r.position().y > -1) others.push(r.position())
    let best: { x: number; z: number } | null = null
    let bestScore = -Infinity
    for (let s = 0; s < SECTIONS; s++) {
      if (gone(s) || warned(s, now)) continue
      for (const r of [5, 6.5, 8]) {
        for (const f of [0.25, 0.5, 0.75]) {
          const [x, z] = along((s + f) * SECTION_ANGLE, r)
          let room = 6
          for (const o of others) room = Math.min(room, Math.hypot(o.x - x, o.z - z))
          const d = Math.hypot(x - p.x, z - p.z)
          const score = room - 0.25 * d + 0.3 * Math.sin(s * 7.1 + r * 3.3 + f * 11 + this.seed) - 0.15 * Math.abs(r - 6.5)
          if (score > bestScore) {
            bestScore = score
            best = { x, z }
          }
        }
      }
    }
    // (Where it is is as good, unless it's somewhere to get away from: then stay put)
    if (best && !this.unsafe(p, now) && this.spot && !this.unsafe(this.spot, now)) {
      let room = 6
      for (const o of others) room = Math.min(room, Math.hypot(o.x - p.x, o.z - p.z))
      if (room > 2.2) return { x: p.x, z: p.z }
    }
    return best
  }
}

function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
}
