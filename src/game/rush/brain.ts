import type { RapierRigidBody } from '@react-three/rapier'
import { allRunners } from '../playerContact'
import type { BotTraits, Steering } from '../race/bots/steering'
import { SPEED, type Runner, type RunnerInput } from '../runner'
import { BACK, BLAST_RUNNERS, CELLS, FRONT, HALF, WALL_DEPTH, cellX } from './course'
import { active, open, round, speedAt, wallZ, walls, type Wall } from './walls'

// A bot's mind on the stage. It knows what every wall's made of, so it does what good players do: it picks
// the way through the next wall coming (a gap, or failing that a cracked block to smash, never spikes or TNT),
// the nearer the better and away from the lasers and anyone else making for the same one, and goes to meet
// it: across to line up with it on the way, and then through, flat out (so a cracked block breaks), as soon as
// it's lined up and the wall's on the stage (not still coming up out of the slot, with nothing beyond it to
// land on). A gap others are already crowding in front of it passes up (one at a time is all a gap takes), and
// one it finds itself wedged in with others, getting nowhere, it gives up for another. It keeps clear of lit
// TNT. The less able ones line up more slowly, choose worse, and now and then hesitate.

const DECIDE_EVERY = 0.12
const LINED_UP = 0.5 // how near the middle of its way through it has to be
const WEDGED = 0.5 // seconds charging without getting anywhere: it's wedged in, and tries another way
const SAFE_X = HALF - 1 // never further out than this (the lasers)
const EDGE_X = HALF - 1.25 // through a gap at the very side, it keeps to the inside of it
const aimX = (k: number) => Math.max(-EDGE_X, Math.min(EDGE_X, cellX(k)))

// Which ways through which walls bots are making for, so they don't all queue at the same one
const claims = new Map<string, Set<RushBrain>>()
const key = (n: number, k: number) => `${n}:${k}`

export class RushBrain implements Steering {
  quit = false
  private readonly speed: number
  private readonly sway: number // how sharp its lining up is (1: sharp)
  private readonly slips: number
  private readonly notice: number // how long after a wall comes up before it's taken in what it's made of
  private readonly start: number
  private readonly lapse: number
  private wall = -1
  private cell = -1
  private nextDecide = 0
  private lapseAt = -1
  private lapseUntil = 0
  // Charging: since when, and from where (to tell it's wedged); and a way it's given up on, till when
  private chargeSince = -1
  private chargeFrom = 0
  private avoid = { wall: -1, cell: -1, until: 0 }
  private me = -1 // its body's handle

  constructor(bot: BotTraits) {
    const level = Math.max(0, Math.min(1, (bot.skill.speed - 0.78) / 0.19))
    this.speed = SPEED * bot.skill.speed
    this.sway = 0.55 + 0.45 * level
    this.slips = 0.03 + 0.12 * (1 - level) ** 2
    this.notice = 0.25 + 0.7 * (1 - level) * (0.5 + Math.random() * 0.5)
    this.start = bot.skill.start
    this.lapse = bot.skill.lapse
  }

  update(input: RunnerInput, rb: RapierRigidBody, runner: Runner, _physics: unknown, now: number, canMove: boolean) {
    input.x = input.z = 0
    input.jump = input.drop = input.crouchHeld = input.crouchPressed = false
    if (!canMove || now < this.start || round.over) return
    const p = rb.translation()
    this.me = rb.handle

    // Now and then its mind wanders a moment
    if (this.lapse > 0) {
      if (this.lapseAt < 0) this.lapseAt = now + 8 + Math.random() * 14
      if (now >= this.lapseAt && runner.grounded) {
        this.lapseUntil = now + this.lapse * (0.3 + Math.random() * 0.6)
        this.lapseAt = this.lapseUntil + 8 + Math.random() * 14
      }
      if (now < this.lapseUntil) return
    }

    if (now >= this.nextDecide) {
      this.nextDecide = now + DECIDE_EVERY / this.sway
      this.decide(p, now)
    }
    this.steer(input, p, now)
    // (Never out by the lasers)
    if (Math.abs(p.x) > SAFE_X && Math.sign(input.x) === Math.sign(p.x)) input.x = -Math.sign(p.x) * 0.3
  }

  private steer(input: RunnerInput, p: { x: number; z: number }, now: number) {
    const w = this.wall >= 0 ? walls[this.wall] : null
    if (!w || this.cell < 0) {
      // Nothing coming yet: to the middle of the stage
      this.head(input, -p.x * 0.5, -p.z * 0.3, 0.5)
      return
    }
    const front = wallZ(w, now) + WALL_DEPTH / 2
    const gap = p.z - front
    const dx = aimX(this.cell) - p.x
    const lined = Math.abs(dx) < LINED_UP

    // Lit TNT near: away from it, whatever else
    const fuse = this.litNear(p, now)
    if (fuse !== null) {
      this.head(input, Math.sign(p.x - fuse) || 1, 0.6, 1)
      return
    }
    // (Not through a wall with nothing beyond it yet: still coming up out of the slot)
    const onStage = wallZ(w, now) - WALL_DEPTH / 2 > FRONT + 0.6
    if (lined && onStage) {
      // Lined up: through it, flat out (unless it's been wedged in a while, getting nowhere: then another way)
      if (this.chargeSince < 0) {
        this.chargeSince = now
        this.chargeFrom = p.z
      } else if (now - this.chargeSince > WEDGED) {
        if (this.chargeFrom - p.z < 0.3) {
          this.avoid = { wall: w.n, cell: this.cell, until: now + 1 }
          this.nextDecide = now
        }
        this.chargeSince = now
        this.chargeFrom = p.z
      }
      this.head(input, dx * 1.5, -1, 1)
    } else {
      this.chargeSince = -1
      // Getting lined up: across to it, coming on to meet the wall only while it's a little way off (so as
      // not to be pressed against it, getting across), sliding back off it if it is (while there's room),
      // and keeping back from the front edge
      const time = gap / Math.max(0.5, speedAt(now))
      let ahead = gap > 2 + (onStage ? 0 : 0.8) ? -0.5 : 0
      if (Math.abs(dx) / this.speed > time) ahead = Math.max(ahead, 0)
      if (gap < 0.8 && p.z < BACK - 2.5) ahead = 0.5
      if (p.z < FRONT + 1.5) ahead = 0.6
      // (Slowing as it comes across, so as not to overshoot)
      this.head(input, dx * 0.9, ahead, 1)
    }
  }

  // Run this way ((x, z), any length), at most at `share` of its speed
  private head(input: RunnerInput, x: number, z: number, share: number) {
    const p = Math.hypot(x, z)
    if (p < 0.05) return
    const pace = Math.min(1, p) * share * (this.speed / SPEED)
    input.x = (x / p) * pace
    input.z = (z / p) * pace
  }

  // Lit TNT within reach of its blast, in a wall that's near: where it is across the stage (or null)
  private litNear(p: { x: number; z: number }, now: number) {
    for (const w of walls) {
      if (!active(w, now)) continue
      const z = wallZ(w, now)
      if (Math.abs(z - p.z) > BLAST_RUNNERS + 1) continue
      for (let k = 0; k < CELLS; k++) {
        const b = w.blocks[k]
        if (b.alive && b.kind === 'tnt' && b.litAt <= now && Math.hypot(cellX(k) - p.x, z - p.z) < BLAST_RUNNERS) return cellX(k)
      }
    }
    return null
  }

  private decide(p: { x: number; z: number }, now: number) {
    // The next wall: the nearest one coming that it isn't through yet
    let next: Wall | null = null
    let nearest = Infinity
    for (const w of walls) {
      if (!active(w, now) || now < w.comesAt + this.notice) continue
      const back = wallZ(w, now) - WALL_DEPTH / 2
      if (p.z < back + 0.2) continue
      const d = p.z - back
      if (d < nearest) {
        nearest = d
        next = w
      }
    }
    if (!next) {
      this.claim(-1, -1)
      return
    }
    const front = wallZ(next, now) + WALL_DEPTH / 2
    const gap = p.z - front
    // Who's at the wall's front already, waiting to go through; and who's alongside it, in the way across
    const queued: number[] = []
    const alongside: number[] = []
    for (const r of allRunners()) {
      if (r.handle === this.me) continue
      const o = r.position()
      if (o.z > front - 0.4 && o.z < Math.min(p.z, front + 2.5)) queued.push(o.x)
      if (Math.abs(o.z - p.z) < 1.1 && Math.abs(o.x - p.x) > 0.3) alongside.push(o.x)
    }
    const time = Math.max(0.2, gap / Math.max(0.5, speedAt(now)) + (BACK - p.z) / Math.max(0.5, speedAt(now)))
    let best = -1
    let bestCost = Infinity
    let second = -1
    for (let k = 0; k < CELLS; k++) {
      const b = next.blocks[k]
      const x = aimX(k)
      let cost = open(b) ? 0 : b.kind === 'cracked' ? 2.2 : Infinity
      if (cost === Infinity) continue
      const across = Math.abs(x - p.x)
      if (across / this.speed > time) cost += 30
      cost += across * 0.8
      for (const ox of alongside) if ((ox - p.x) * (x - p.x) > 0 && Math.abs(ox - p.x) < across) cost += 1.5
      if (k === 0 || k === CELLS - 1) cost += 1.2
      const others = claims.get(key(next.n, k))
      if (others) cost += 1.2 * (others.size - (others.has(this) ? 1 : 0))
      for (const ox of queued) if (Math.abs(ox - x) < 1.2) cost += 1.6
      if (next.n === this.avoid.wall && k === this.avoid.cell && now < this.avoid.until) cost += 3
      if (next.n === this.wall && k === this.cell) cost -= 0.6
      if (cost < bestCost) {
        second = best
        best = k
        bestCost = cost
      }
    }
    // (A slip: the second best)
    if (second >= 0 && next.n !== this.wall && Math.random() < this.slips) best = second
    this.claim(best < 0 ? -1 : next.n, best)
  }

  private claim(n: number, k: number) {
    if (this.wall >= 0 && this.cell >= 0 && (n !== this.wall || k !== this.cell)) {
      const was = key(this.wall, this.cell)
      claims.get(was)?.delete(this)
      if (!claims.get(was)?.size) claims.delete(was)
    }
    this.wall = n
    this.cell = k
    if (n < 0 || k < 0) return
    const id = key(n, k)
    if (!claims.has(id)) claims.set(id, new Set())
    claims.get(id)!.add(this)
  }
}
