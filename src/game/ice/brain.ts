import type { RapierRigidBody } from '@react-three/rapier'
import { allRunners } from '../playerContact'
import type { BotTraits, Steering } from '../race/bots/steering'
import { JUMP_VELOCITY, SPEED, type Runner, type RunnerInput } from '../runner'
import { CELLS, TILE, TILES, TOUCH_COST, layerOf, layerTop, tileAt, tileUnder } from './course'
import { ice, round, solid } from './tiles'

// A bot's mind on the ice. Standing cracks ice far quicker than landing on it does, so it never stands still:
// it hops, and hops again the moment it lands, each time onto whichever tile within a hop it likes best: one
// with plenty of ice left (more than its landing will take, with something to spare), in a part of the floor
// with plenty left round it, not too crowded, and not one another bot's already making for. With nowhere
// left to land on its floor, it makes for the best spot on the floor below and drops; falling, it steers to
// land on somewhere good. The less able ones slip up now and then: they land on a tile without looking how
// cracked it is, or their mind wanders and they stand there while the ice gives way.

const G = 20
const AIRTIME = (2 * JUMP_VELOCITY) / G // a jump, up and back down to the same height
const CROWD = 2.2 // others nearer a tile than this put it off
const HOP_EVERY = 0.35 // seconds after a jump before it'll think about the next one (it's still in the air)
const DECIDE_EVERY = 0.1 // (and making for the edge, to drop down, how often it thinks again)

// Who's making for which tile (and until when that counts), so they don't all land on the same one
const claims = new Map<number, { by: IceBrain; until: number }>()

type At = { x: number; y: number; z: number }

export class IceBrain implements Steering {
  quit = false
  private readonly speed: number // m/s
  private readonly leap: number // how far a hop takes it
  private readonly spare: number // how much ice it wants left after it lands (the less careful, the less)
  private readonly slips: number // how likely a hop is to be a careless one
  private readonly start: number
  private readonly lapse: number
  private readonly seed: number
  private target = -1 // the tile it's making for
  private jumpFrames = 0
  private hopAt = 0 // not before then: it's only just jumped
  private nextDecide = 0
  private careless = false // this hop: it didn't look
  private lapseAt = -1
  private lapseUntil = 0
  private others: number[] = [] // where the rest are: x, z

  constructor(bot: BotTraits) {
    const level = Math.max(0, Math.min(1, (bot.skill.speed - 0.78) / 0.19))
    this.speed = SPEED * bot.skill.speed
    this.leap = this.speed * AIRTIME * 0.9
    this.spare = 0.06 + 0.18 * level * Math.random()
    this.slips = 0.006 + 0.04 * (1 - level) ** 2
    this.start = bot.skill.start
    this.lapse = bot.skill.lapse
    this.seed = (bot.bias + 1) * 9973
  }

  update(input: RunnerInput, rb: RapierRigidBody, runner: Runner, _physics: unknown, now: number, canMove: boolean) {
    input.x = input.z = 0
    input.jump = input.drop = input.crouchHeld = input.crouchPressed = false
    if (!canMove || now < this.start || round.over) return
    const p = rb.translation()
    const vy = rb.linvel().y
    const feet = p.y - 1
    const grounded = runner.grounded && vy < 1
    // The floor it's on, or (falling through) the one it'll come down on
    let layer = layerOf(feet)
    if (!grounded && vy < 0 && feet < layerTop(layer) - 0.3 && layer > 0) layer--

    // Now and then its mind wanders, and it stands there a moment (with the ice giving way under it)
    if (this.lapse > 0) {
      if (this.lapseAt < 0) this.lapseAt = now + 12 + Math.random() * 18
      if (now >= this.lapseAt && grounded) {
        this.lapseUntil = now + this.lapse * (0.3 + 0.7 * Math.random())
        this.lapseAt = this.lapseUntil + 12 + Math.random() * 18
      }
      if (now < this.lapseUntil) return
    }

    // Down on the ice: where next (it'll be off again at once). In the air: still going for where it was,
    // unless that's gone, or it's falling through and needs somewhere on the floor below.
    const t = this.target
    const lost = t >= 0 && (!solid(t) || (!grounded && TILES[t].layer !== layer))
    if (lost || t < 0 || (grounded && now >= this.hopAt && now >= this.nextDecide)) {
      this.nextDecide = now + DECIDE_EVERY
      this.decide(rb.handle, p, vy, feet, layer, grounded, now)
    }
    if (this.target < 0) return

    const goal = TILES[this.target]
    const dx = goal.x - p.x
    const dz = goal.z - p.z
    const d = Math.hypot(dx, dz) || 1e-3
    const run = (want: number) => {
      const pace = Math.min(this.speed, want) / SPEED / d
      input.x = dx * pace
      input.z = dz * pace
    }

    if (!grounded) {
      // In the air: so as to come down right on it
      const drop = Math.max(0, feet - layerTop(goal.layer))
      const landIn = Math.max(0.05, (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * drop))) / G)
      run(d / landIn)
    } else if (goal.layer !== layer) {
      // Down to the floor below: off the edge it's on, for the spot right over it
      run(this.speed)
    } else if (now >= this.hopAt) {
      // Off again: just hard enough to come down on it
      this.jumpFrames = 3
      this.hopAt = now + HOP_EVERY
      run(d / AIRTIME)
    }
    if (this.jumpFrames > 0) {
      this.jumpFrames--
      input.jump = true
    }
  }

  private decide(me: number, p: At, vy: number, feet: number, layer: number, grounded: boolean, now: number) {
    this.others.length = 0
    for (const r of allRunners()) {
      if (r.handle === me) continue
      const o = r.position()
      if (Math.abs(o.y - p.y) < 3 && Math.abs(o.x - p.x) < 12 && Math.abs(o.z - p.z) < 12) this.others.push(o.x, o.z)
    }
    if (grounded) this.careless = Math.random() < this.slips
    // How far it can get before it comes down: a hop's worth from the ice, less in the air
    const fall = Math.max(0, feet - layerTop(layer))
    const reach = grounded ? this.leap : (this.speed * (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * fall)))) / G + 0.5

    // Somewhere with ice to spare; or, with nowhere like that, anywhere that'll hold it; or, with nowhere at
    // all to land on this floor, down to the best spot on the one below
    let best = this.pick(layer, p, now, reach, this.spare)
    if (best < 0) best = this.pick(layer, p, now, reach, 0.02)
    if (grounded && layer > 0 && best < 0) best = this.pick(layer - 1, p, now, 9, this.spare)
    if (this.target >= 0 && this.target !== best && claims.get(this.target)?.by === this) claims.delete(this.target)
    this.target = best
    if (best >= 0) claims.set(best, { by: this, until: now + AIRTIME + 0.3 })
  }

  // The best tile to land on, on a floor, within `reach`, that'll have at least `need` ice left once it's
  // landed (or -1)
  private pick(layer: number, p: At, now: number, reach: number, need: number) {
    const here = tileUnder(layer, p.x, p.z)
    // (Up on the floor above it, dropping to it: through a hole, not through ice that's still there)
    const below = p.y - 1 > layerTop(layer + 1) - 0.3
    const span = Math.ceil(reach / TILE) + 1
    let best = -1
    let bestScore = -Infinity
    const ci = Math.floor(p.x / TILE + CELLS / 2)
    const cj = Math.floor(p.z / TILE + CELLS / 2)
    for (let i = 0; i < TILES.length; i++) {
      const tile = TILES[i]
      if (tile.layer !== layer || Math.abs(tile.i - ci) > span || Math.abs(tile.j - cj) > span || !solid(i)) continue
      const d = Math.hypot(tile.x - p.x, tile.z - p.z)
      if (d > reach) continue
      // Enough ice to take its landing, and the others already on it in the meantime, with some to spare
      let on = 0
      for (let o = 0; o < this.others.length; o += 2) {
        if (Math.abs(this.others[o] - tile.x) < TILE / 2 && Math.abs(this.others[o + 1] - tile.z) < TILE / 2) on++
      }
      const left = ice[i] - on * AIRTIME - TOUCH_COST
      if (!this.careless && left < need) continue
      let score = this.careless ? 0 : 3 * left
      let around = 0
      for (const n of tile.region) if (solid(n)) around += ice[n]
      score += 0.06 * around
      if (i === here) score -= 0.3 // (somewhere else, so as not to wear one tile through)
      if (below) {
        const over = tileAt(layer + 1, tile.i, tile.j)
        if (over >= 0 && solid(over)) score -= 3
      }
      score -= 0.3 * Math.max(0, d - 3.2)
      for (let o = 0; o < this.others.length; o += 2) {
        const od = Math.hypot(this.others[o] - tile.x, this.others[o + 1] - tile.z)
        if (od < CROWD) score -= 2.5 * (1 - od / CROWD)
      }
      const claim = claims.get(i)
      if (claim && claim.by !== this && claim.until > now) score -= 3
      // Keep in from the edge, and a leaning of its own
      score -= 0.03 * Math.hypot(tile.x, tile.z)
      score += 0.3 * Math.sin(i * 12.9898 + this.seed + Math.floor(now / 3))
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    return best
  }
}
