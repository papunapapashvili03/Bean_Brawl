import type { RapierRigidBody } from '@react-three/rapier'
import { allRunners } from '../playerContact'
import type { BotTraits, Steering } from '../race/bots/steering'
import { SPEED, type Runner, type RunnerInput } from '../runner'
import { CORNERS, TILE, TILES, tileUnder } from './course'
import { floor, round, solid } from './calls'

// A bot's mind on Color Call. While the pattern's shown, it gets itself somewhere with every colour near at
// hand: a corner where tiles meet, with the nearest tile of whatever's called as close as it can be on
// average (./calls works that out for every corner), not too far off and not crowded. A moment after the
// call (its reaction: the less able, the slower), it runs for the nearest tile of the colour called (one
// that isn't already full) and stops on it, well in from its edges. Then it stays put till the floor's
// back. The less able ones get themselves placed less well, and now and then set off for the wrong colour
// before they see their mistake, or don't notice the call for a moment.

const INSET = 0.5 // how far in from a tile's edge it stops (its middle, that is: all of it on the tile)
const FULL = 2 // others already on a tile before it's crowded
const THINK_EVERY = 0.25 // seconds, while it's waiting for the call
const RUSH_EVERY = 0.08 // and once it's going for one

export class ColorBrain implements Steering {
  quit = false
  private readonly speed: number
  private readonly reaction: number // seconds from a call until it's off
  private readonly places: number // how well it picks where to wait, 0..1
  private readonly wrongs: number // how likely it is to go for the wrong colour first
  private readonly start: number
  private readonly lapse: number
  private readonly seed: number
  private call = -1 // the call it's seen
  private seesAt = 0 // when it takes the call in
  private wrong = -1 // a colour it's mistakenly going for, until
  private rightAt = 0
  private goal: { x: number; z: number } | null = null
  private nextThink = 0
  private others: number[] = [] // where the rest are: x, z

  constructor(bot: BotTraits) {
    const level = Math.max(0, Math.min(1, (bot.skill.speed - 0.78) / 0.19))
    this.speed = SPEED * bot.skill.speed
    this.reaction = 0.13 + 0.3 * (1 - level)
    this.places = Math.max(0, Math.min(1, 1.3 * level - 0.1))
    this.wrongs = 0.02 + 0.12 * (1 - level) ** 2
    this.start = bot.skill.start
    this.lapse = bot.skill.lapse
    this.seed = (bot.bias + 1) * 9973
  }

  update(input: RunnerInput, rb: RapierRigidBody, _runner: Runner, _physics: unknown, now: number, canMove: boolean) {
    input.x = input.z = 0
    input.jump = input.drop = input.crouchHeld = input.crouchPressed = false
    if (!canMove || now < this.start || round.over) return
    const p = rb.translation()
    if (p.y < -0.4) return // (falling: nothing to be done)

    if (floor.phase === 'call' && this.call !== floor.n) this.hear(now)
    if (now >= this.nextThink) this.think(rb.handle, p, now)
    if (!this.goal) return

    const dx = this.goal.x - p.x
    const dz = this.goal.z - p.z
    const d = Math.hypot(dx, dz)
    if (d < 0.1) return
    // (Strolling there while it waits; flat out once there's a call to get to)
    const rushing = floor.phase === 'call' && now >= this.seesAt
    const pace = (Math.min(1, d / 0.35) * (rushing ? this.speed : 0.6 * this.speed)) / SPEED / d
    input.x = dx * pace
    input.z = dz * pace
  }

  // A colour's been called: when it'll take it in, and whether it'll get it wrong at first
  private hear(now: number) {
    this.call = floor.n
    let r = this.reaction * (0.8 + 0.4 * Math.random())
    if (this.lapse > 0 && Math.random() < 0.08) r += this.lapse * Math.random() // (miles away)
    this.seesAt = floor.since + r
    this.wrong = -1
    if (Math.random() < this.wrongs && floor.inUse.length > 1) {
      const others = floor.inUse.filter((c) => c !== floor.called)
      this.wrong = others[Math.floor(Math.random() * others.length)]
      this.rightAt = this.seesAt + 0.3 + 0.4 * Math.random()
    }
    this.nextThink = Math.max(now, this.seesAt)
  }

  private think(me: number, p: { x: number; z: number }, now: number) {
    this.others.length = 0
    for (const r of allRunners()) {
      if (r.handle === me) continue
      const o = r.position()
      if (o.y > -0.4 && Math.abs(o.x - p.x) < 12 && Math.abs(o.z - p.z) < 12) this.others.push(o.x, o.z)
    }
    if (floor.phase === 'look' || (floor.phase === 'call' && now < this.seesAt)) {
      this.nextThink = now + THINK_EVERY
      this.goal = this.places > 0 ? this.waitAt(p, now) : null
    } else if (floor.phase === 'call') {
      this.nextThink = now + RUSH_EVERY
      this.goal = this.safest(p, this.wrong >= 0 && now < this.rightAt ? this.wrong : floor.called)
    } else {
      // Down (or coming back up): stay well on the tile it's on
      this.nextThink = now + RUSH_EVERY
      const here = tileUnder(p.x, p.z)
      this.goal = here >= 0 && solid(here) ? inside(here, p) : null
    }
  }

  // Where to wait for the call: the best corner near it
  private waitAt(p: { x: number; z: number }, now: number) {
    let best = -1
    let bestScore = Infinity
    CORNERS.forEach((c, k) => {
      const d = Math.hypot(c.x - p.x, c.z - p.z)
      if (d > 8) return
      let score = floor.cover[k] * this.places + 0.12 * d
      for (let o = 0; o < this.others.length; o += 2) {
        const od = Math.hypot(this.others[o] - c.x, this.others[o + 1] - c.z)
        if (od < 1.4) score += 0.8 * (1 - od / 1.4)
      }
      score += 0.3 * (1 - this.places) * Math.sin(k * 12.9898 + this.seed + Math.floor(now / 4))
      if (score < bestScore) {
        bestScore = score
        best = k
      }
    })
    return best >= 0 ? CORNERS[best] : null
  }

  // The nearest spot well inside a tile of the colour, out of those that aren't already full
  private safest(p: { x: number; z: number }, colour: number) {
    let best: { x: number; z: number } | null = null
    let bestScore = Infinity
    TILES.forEach((t, i) => {
      if (floor.colours[i] !== colour || !solid(i)) return
      const spot = inside(i, p)
      let score = Math.hypot(spot.x - p.x, spot.z - p.z)
      let on = 0
      for (let o = 0; o < this.others.length; o += 2) {
        if (Math.abs(this.others[o] - t.x) < TILE / 2 && Math.abs(this.others[o + 1] - t.z) < TILE / 2) on++
      }
      if (on >= FULL && score > 0.01) score += 1.5 * (on - FULL + 1)
      if (score < bestScore) {
        bestScore = score
        best = spot
      }
    })
    return best
  }
}

// The nearest point to p that's well inside a tile
function inside(i: number, p: { x: number; z: number }) {
  const t = TILES[i]
  const r = TILE / 2 - INSET
  return { x: Math.max(t.x - r, Math.min(t.x + r, p.x)), z: Math.max(t.z - r, Math.min(t.z + r, p.z)) }
}
