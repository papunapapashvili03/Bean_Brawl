import type { RapierRigidBody } from '@react-three/rapier'
import { allRunners } from '../playerContact'
import type { BotTraits, Steering } from '../race/bots/steering'
import { SPEED, type Runner, type RunnerInput } from '../runner'
import { GONE, TILE, TILES, tileUnder } from './course'
import { round, strikes, waves } from './strikes'

// A bot's mind on Pattern Panic. It plans through space and time: from everything it's seen light up (seen,
// that is, a moment after it lit up: its reaction, the less able the slower), it knows which tiles will be
// down when over the next few seconds, and works out every tile it could be on at each moment from now
// without ever being on one as it drops (waiting where it is, or going tile to tile at its own pace). Of the
// tiles it could be on at the end, it goes for the best: near the middle (with room all round), not crowded,
// not far, with somewhere safe next to it; and it sets off on the first step of the way there. It plans
// again every moment, as more lights up. Now and then the less able ones' minds wander, and they don't take
// in what's lit up for a moment.

const DT = 0.1 // seconds a planning step
const STEPS = 40 // how far ahead it plans
const THEN = 1.5 // and beyond that, how far ahead it looks for where not to end up
const N = TILES.length
const BEFORE = 0.2 // seconds before a tile drops, and after it's back, that it's somewhere not to be
const AFTER = 0.1
const PLAN_EVERY = 0.12

// (Scratch for planning, one bot at a time: which tiles are no place to be at each step, and for each tile
// it could be on at each step, which way it went first to get there: that tile + 1, 0 if it can't)
const bad = new Uint8Array((STEPS + 1) * N)
const first = new Int16Array((STEPS + 1) * N)
const struckThen = new Uint8Array(N)

// Where each is making for, so they don't all go for the same tile
const claims = new Map<PanicBrain, number>()

export class PanicBrain implements Steering {
  quit = false
  private readonly speed: number
  private readonly reaction: number
  private readonly start: number
  private readonly lapse: number
  private readonly seed: number
  private readonly straight: number // planning steps to the next tile along, and diagonally
  private readonly diagonal: number
  private react = 0 // this wave's reaction (it's quicker on some than others)
  private reactWave = -1
  private goal = -1 // the tile it's going to now
  private nextPlan = 0
  private lapseAt = -1
  private lapseFrom = 0 // its mind wandered then (what's lit up since, it hasn't taken in), until
  private lapseUntil = 0

  constructor(bot: BotTraits) {
    const { level, reaction } = bot.skill
    this.speed = SPEED * bot.skill.speed
    this.reaction = (0.15 + 0.35 * (1 - level)) * reaction
    this.start = bot.skill.start
    this.lapse = bot.skill.lapse
    this.seed = (bot.bias + 1) * 9973
    this.straight = Math.ceil(TILE / this.speed / DT)
    this.diagonal = Math.ceil((TILE * Math.SQRT2) / this.speed / DT)
    this.nextPlan = Math.random() * PLAN_EVERY
  }

  update(input: RunnerInput, rb: RapierRigidBody, _runner: Runner, _physics: unknown, now: number, canMove: boolean) {
    input.x = input.z = 0
    input.jump = input.drop = input.crouchHeld = input.crouchPressed = false
    if (!canMove || now < this.start || round.over) return
    const p = rb.translation()
    if (p.y < -0.4) {
      claims.delete(this)
      return // (falling: nothing to be done)
    }

    // Now and then its mind wanders for a moment
    if (this.lapse > 0) {
      if (this.lapseAt < 0) this.lapseAt = now + 8 + Math.random() * 16
      if (now >= this.lapseAt) {
        this.lapseFrom = now
        this.lapseUntil = now + this.lapse * (0.3 + 0.7 * Math.random())
        this.lapseAt = this.lapseUntil + 8 + Math.random() * 16
      }
    }

    if (now >= this.nextPlan) {
      this.nextPlan = now + PLAN_EVERY
      this.plan(rb.handle, p, now)
    }
    if (this.goal < 0) return
    const g = TILES[this.goal]
    const dx = g.x - p.x
    const dz = g.z - p.z
    const d = Math.hypot(dx, dz)
    if (d < 0.12) return
    const pace = (Math.min(1, d / 0.4) * this.speed) / SPEED / d
    input.x = dx * pace
    input.z = dz * pace
  }

  private plan(me: number, p: { x: number; z: number }, now: number) {
    const here = tileUnder(p.x, p.z)
    if (here < 0) {
      this.goal = -1
      return
    }

    // What it's taken in: everything that lit up long enough ago (and not while its mind was wandering)
    if (waves.n !== this.reactWave) {
      this.reactWave = waves.n
      this.react = this.reaction * (0.75 + 0.6 * Math.random())
    }
    const seenBy = now < this.lapseUntil ? Math.min(this.lapseFrom, now) - this.react : now - this.react
    bad.fill(0)
    struckThen.fill(0)
    for (const s of strikes) {
      if (s.warnAt > seenBy || s.at + GONE + AFTER < now) continue
      if (s.at - BEFORE < now + STEPS * DT + THEN) for (const i of s.tiles) struckThen[i] = 1
      const k0 = Math.max(0, Math.ceil((s.at - BEFORE - now) / DT))
      const k1 = Math.min(STEPS, Math.floor((s.at + GONE + AFTER - now) / DT))
      for (let k = k0; k <= k1; k++) {
        const row = k * N
        for (const i of s.tiles) bad[row + i] = 1
      }
    }

    // Everywhere it could be, step by step: staying put, or on to a tile next door (over this one for the
    // first half of the way, that one for the second). Of the ways it could set off to get somewhere: with
    // its own tile to be struck, going the way it was already going, or else any way at all, rather than
    // waiting (till the last moment, it'd be cutting it fine); with its own tile safe, waiting, or else
    // going the way it was going. (So it doesn't change its mind from one moment to the next.)
    let doomed = false
    for (let k = 1; k <= STEPS && !doomed; k++) if (bad[k * N + here]) doomed = true
    const STAY = here + 1
    const ON = this.goal >= 0 && this.goal !== here ? this.goal + 1 : -1
    const rank = (way: number) => (doomed ? (way === ON ? 0 : way === STAY ? 2 : 1) : way === STAY ? 0 : way === ON ? 1 : 2)
    const better = (at: number, way: number) => !first[at] || rank(way) < rank(first[at])
    first.fill(0)
    first[here] = STAY
    let last = 0
    for (let k = 0; k < STEPS; k++) {
      const row = k * N
      for (let i = 0; i < N; i++) {
        const went = first[row + i]
        if (!went) continue
        last = k
        if (!bad[row + N + i] && better(row + N + i, went)) first[row + N + i] = went
        for (const n of TILES[i].around) {
          const m = TILES[n].i !== TILES[i].i && TILES[n].j !== TILES[i].j ? this.diagonal : this.straight
          const k2 = k + m
          const way = k === 0 ? n + 1 : went
          if (k2 > STEPS || !better(k2 * N + n, way)) continue
          const half = k + (m >> 1)
          let ok = true
          for (let q = k + 1; q <= half && ok; q++) if (bad[q * N + i]) ok = false
          for (let q = half; q <= k2 && ok; q++) if (bad[q * N + n]) ok = false
          if (ok) first[k2 * N + n] = way
        }
      }
    }
    for (let i = 0; i < N; i++) if (first[STEPS * N + i]) last = STEPS

    // Of where it could be at the end (as far as it could get), the best
    const others: number[] = []
    for (const r of allRunners()) {
      if (r.handle === me) continue
      const o = r.position()
      if (o.y > -0.4) others.push(tileUnder(o.x, o.z))
    }
    const claimed = new Map<number, number>()
    for (const [by, tile] of claims) if (by !== this) claimed.set(tile, (claimed.get(tile) ?? 0) + 1)
    const row = last * N
    const ht = TILES[here]
    let best = -1
    let bestScore = -Infinity
    for (let i = 0; i < N; i++) {
      if (!first[row + i]) continue
      const t = TILES[i]
      let score = -0.25 * t.ring - 0.15 * Math.hypot(t.i - ht.i, t.j - ht.j)
      if (i === here) score += 0.3
      if (first[row + i] === ON) score += 0.6
      if (struckThen[i] && !bad[row + i]) score -= 3 // (safe till then, but not for long after)
      for (const o of others) if (o === i) score -= 0.9
      score -= 0.8 * (claimed.get(i) ?? 0)
      for (const n of t.around) if (!bad[row + n]) score += 0.08
      score += 0.25 * Math.sin(i * 12.9898 + this.seed + Math.floor(now / 3))
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best < 0) {
      this.goal = here
      claims.delete(this)
      return
    }
    claims.set(this, best)
    this.goal = first[row + best] - 1
  }
}
