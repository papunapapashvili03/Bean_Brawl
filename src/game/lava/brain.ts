import type { RapierRigidBody } from '@react-three/rapier'
import { allRunners } from '../playerContact'
import type { BotTraits, Steering } from '../race/bots/steering'
import { JUMP_VELOCITY, SPEED, type Runner, type RunnerInput } from '../runner'
import { HEX, PILLARS, SPACING, pillarUnder } from './course'
import { overLava, round, safeUntil, topAt } from './pillars'

// A bot's mind on the lava. It knows every pillar's timetable (./pillars), so it plays the way the good
// players do: it stays on a pillar while it'll be safe a good while yet, keeping to its middle, and before it
// isn't (about to sink, or about to be swallowed by the tide) it hops to the best one within reach: one that's
// staying up longest, high over the lava, not too far, not too far up to jump to, and not crowded or already
// claimed by another bot. The less able ones leave it later, and now and then their mind wanders or they
// misjudge a hop.

const G = 20
const DECIDE_EVERY = 0.12
const HORIZON = 8 // seconds it looks ahead
const MAX_HOP = 4.7 // between pillar middles, at most
const MAX_RISE = 1.25 // how much higher a pillar can be than its feet and still be jumped to
const CROWD = 1.3

// Who's making for which pillar (and until when that counts), so they don't all go for the same one
const claims = new Map<number, { by: LavaBrain; until: number }>()

// The pillars within a hop or two of each
const NEAR = PILLARS.map((p, i) => PILLARS.map((_, j) => j).filter((j) => j !== i && Math.hypot(PILLARS[j].x - p.x, PILLARS[j].z - p.z) < 2 * SPACING + 0.2))

// Seconds a jump takes to come down `rise` higher than it went up (null: it doesn't get that high)
function airtime(rise: number) {
  const v = JUMP_VELOCITY
  const under = v * v - 2 * G * rise
  return under < 0 ? null : (v + Math.sqrt(under)) / G
}

export class LavaBrain implements Steering {
  quit = false
  private readonly speed: number
  private readonly stayFor: number // it moves on when where it stands is safe for less than this
  private readonly slips: number // how likely a hop is to come up short
  private readonly start: number
  private readonly lapse: number
  private readonly seed: number
  private target = -1
  private nextDecide = 0
  private jumpFrames = 0
  private short = 1 // this hop's effort (under 1: a slip, coming up short)
  private lapseAt = -1
  private lapseUntil = 0
  private others: number[] = []

  constructor(bot: BotTraits) {
    const level = Math.max(0, Math.min(1, (bot.skill.speed - 0.78) / 0.19))
    this.speed = SPEED * bot.skill.speed
    this.stayFor = 1 + 1.6 * level + Math.random() * 0.4
    this.slips = 0.01 + 0.06 * (1 - level) ** 2
    this.start = bot.skill.start
    this.lapse = bot.skill.lapse
    this.seed = (bot.bias + 1) * 7919
  }

  update(input: RunnerInput, rb: RapierRigidBody, runner: Runner, _physics: unknown, now: number, canMove: boolean) {
    input.x = input.z = 0
    input.jump = input.drop = input.crouchHeld = input.crouchPressed = false
    if (!canMove || now < this.start || round.over) return
    const p = rb.translation()
    const vy = rb.linvel().y
    const feet = p.y - 1
    const grounded = runner.grounded

    // Now and then its mind wanders, and it stands there a moment
    if (this.lapse > 0) {
      if (this.lapseAt < 0) this.lapseAt = now + 10 + Math.random() * 16
      if (now >= this.lapseAt && grounded) {
        this.lapseUntil = now + this.lapse * (0.4 + Math.random() * 0.8)
        this.lapseAt = this.lapseUntil + 10 + Math.random() * 16
      }
      if (now < this.lapseUntil) return
    }

    const here = pillarUnder(p.x, p.z)
    if (now >= this.nextDecide || (grounded && here === this.target && this.jumpFrames === 0 && here >= 0 && overLava(here, now) < 0.3)) {
      this.nextDecide = now + DECIDE_EVERY
      if (grounded) this.decide(rb.handle, p, feet, here, now)
    }
    const t = this.target
    if (t < 0) return
    const goal = PILLARS[t]
    const dx = goal.x - p.x
    const dz = goal.z - p.z
    const d = Math.hypot(dx, dz) || 1e-3
    const run = (want: number) => {
      const pace = Math.min(this.speed, want) / SPEED / d
      input.x = dx * pace
      input.z = dz * pace
    }

    if (!grounded) {
      // In the air: so as to come down right on it (or, a slip, a little short of it)
      const drop = Math.max(0, feet - topAt(t, now))
      const landIn = Math.max(0.05, (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * drop))) / G)
      run((d / landIn) * this.short)
    } else if (t === here) {
      // Staying: to its middle (not near an edge, where a shove would put it in)
      if (d > 0.45) run(Math.min(this.speed, d * 2.5))
    } else {
      // Off to another: jump just hard enough to come down on it, from where it can reach it
      const air = airtime(topAt(t, now + 0.6) - feet)
      if (air === null) {
        run(this.speed * 0.5)
        return
      }
      const reach = this.speed * air
      const edge = here >= 0 ? Math.hypot(p.x - PILLARS[here].x, p.z - PILLARS[here].z) > HEX * 0.55 : true
      if (d <= reach * 0.92 || edge) {
        this.jumpFrames = 3
        this.short = Math.random() < this.slips ? 0.75 : 1
        run(d / air)
      } else run(this.speed)
    }
    if (this.jumpFrames > 0) {
      this.jumpFrames--
      input.jump = true
    }
  }

  private decide(me: number, p: { x: number; z: number }, feet: number, here: number, now: number) {
    this.others.length = 0
    for (const r of allRunners()) {
      if (r.handle === me) continue
      const o = r.position()
      if (Math.abs(o.x - p.x) < 10 && Math.abs(o.z - p.z) < 10) this.others.push(o.x, o.z)
    }
    // Where it is: safe for long enough yet? Then it stays.
    if (here >= 0 && safeUntil(here, now, HORIZON, 0.35) - now >= this.stayFor + 0.5) {
      this.claim(here, now)
      return
    }
    const look = here >= 0 ? [here, ...NEAR[here]] : PILLARS.map((_, i) => i)
    let best = -1
    let bestScore = -Infinity
    for (const c of look) {
      const pillar = PILLARS[c]
      const d = Math.hypot(pillar.x - p.x, pillar.z - p.z)
      if (c !== here && d > MAX_HOP) continue
      const land = now + (c === here ? 0 : 0.7)
      if (c !== here && topAt(c, land) - feet > MAX_RISE) continue
      const over = overLava(c, land)
      const safe = over < 0.3 ? 0 : Math.min(HORIZON, safeUntil(c, land, HORIZON, 0.35) - land)
      let score = safe + 0.4 * Math.min(2, Math.max(0, over)) - 0.12 * d - (c === here ? 0 : 0.6)
      for (let o = 0; o < this.others.length; o += 2) {
        const od = Math.hypot(this.others[o] - pillar.x, this.others[o + 1] - pillar.z)
        if (od < CROWD) score -= 1.6 * (1 - od / CROWD)
      }
      const claim = claims.get(c)
      if (claim && claim.by !== this && claim.until > now) score -= 1.4
      if (c === this.target) score += 0.5
      score += 0.3 * Math.sin(c * 12.9898 + this.seed + Math.floor(now / 4))
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    if (best >= 0) this.claim(best, now)
  }

  private claim(c: number, now: number) {
    if (this.target >= 0 && this.target !== c && claims.get(this.target)?.by === this) claims.delete(this.target)
    this.target = c
    claims.set(c, { by: this, until: now + 1.5 })
  }
}
