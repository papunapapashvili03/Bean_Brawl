import type { RapierRigidBody } from '@react-three/rapier'
import { allRunners } from '../playerContact'
import type { BotTraits, Steering } from '../race/bots/steering'
import { JUMP_VELOCITY, SPEED, type Runner, type RunnerInput } from '../runner'
import { HEX, SPACING, TILES, layerOf, layerTop, tileAt, tileUnder } from './course'
import { fallAt, fresh, round, solid, topOf } from './tiles'

// A bot's mind on the hexagons. Everything it stands on drops away a moment later, so it plays the way the
// good players do: it stands on a tile until just before it goes, then hops to the next, and every hop
// uses up only the one tile it lands on. Which tile next: out of the untouched ones within reach, the one
// with the most untouched floor round it (somewhere it can keep going from, not a dead end), not too
// crowded, and not one another bot's already making for. Out of tiles within a hop, it runs for one further
// off (jumping any hole on the way). With nowhere left to go on its floor, it makes for the best spot on the
// floor below and drops; falling, it steers to land on somewhere good. The less able ones slip up now and
// then: they hop a moment too late, or their mind wanders and they just stand there.

// Seconds after the tile's gone that a slip-up hops (by when it's already falling)
const SLIP = 0.3

const G = 20
const AIRTIME = (2 * JUMP_VELOCITY) / G // a jump, up and back down to the same height
const DECIDE_EVERY = 0.1
const LOOK = 3 // rings of tiles round it to choose from
const SAMPLE = 0.4 // metres between the points looked at along the way to a tile
const CROWD = 2.2 // others nearer a tile than this put it off
const LONGEST_WAIT = 0.9 // standing on a tile that somehow isn't going, it moves on anyway

// Who's making for which tile (and until when that counts), so they don't all go for the same one
const claims = new Map<number, { by: HexBrain; until: number }>()

// Whether the way to the tile last looked at has a hole in it to jump
let overHole = false

type At = { x: number; y: number; z: number }

export class HexBrain implements Steering {
  quit = false
  private readonly speed: number // m/s
  private readonly leap: number // how far a hop takes it
  private readonly lead: number // how long before its tile goes it hops (the less careful, the sooner)
  private readonly slips: number // how likely it is to hop too late, each time
  private readonly start: number
  private readonly lapse: number
  private readonly seed: number
  private target = -1 // the tile it's making for
  private jumpFrames = 0
  private nextDecide = 0
  private waitingOn = -1 // the tile it's standing on, waiting to hop, and since when
  private waitingSince = 0
  private late = 0 // this time, how long after it should it hops
  private lapseAt = -1
  private lapseUntil = 0
  private others: number[] = [] // where the rest are: x, z

  constructor(bot: BotTraits) {
    const level = Math.max(0, Math.min(1, (bot.skill.speed - 0.78) / 0.19))
    this.speed = SPEED * bot.skill.speed
    this.leap = this.speed * AIRTIME * 0.95
    this.lead = 0.12 + 0.3 * (1 - level) * Math.random()
    this.slips = 0.004 + 0.03 * (1 - level) ** 2
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
    const grounded = runner.grounded
    // The floor it's on, or (falling through) the one it'll come down on
    let layer = layerOf(feet)
    if (!grounded && vy < 0 && feet < layerTop(layer) - 0.3 && layer > 0) layer--

    // Now and then its mind wanders, and it stands there a moment (with the floor going out from under it)
    if (this.lapse > 0) {
      if (this.lapseAt < 0) this.lapseAt = now + 8 + Math.random() * 14
      if (now >= this.lapseAt && grounded) {
        this.lapseUntil = now + this.lapse * (0.5 + Math.random())
        this.lapseAt = this.lapseUntil + 8 + Math.random() * 14
      }
      if (now < this.lapseUntil) return
    }

    // Time to think again: every so often, and at once if where it was going has gone
    const t = this.target
    const lost = t >= 0 && (!solid(t) || (TILES[t].layer === layer && !fresh(t) && tileUnder(layer, p.x, p.z) !== t))
    const there = t >= 0 && grounded && TILES[t].layer === layer && tileUnder(layer, p.x, p.z) === t
    if (now >= this.nextDecide || lost || there) {
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
      const drop = Math.max(0, feet - topOf(this.target))
      const landIn = Math.max(0.05, (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * drop))) / G)
      run(d / landIn)
    } else if (goal.layer !== layer) {
      // Down to the floor below: for the spot right over it
      run(this.speed)
    } else if (d <= this.leap) {
      // Within a hop: stand on this tile until just before it goes (keeping to its middle, leaning the way
      // it'll go), then jump for that one, just hard enough to come down on it
      const here = tileUnder(layer, p.x, p.z)
      if (here !== this.waitingOn) {
        this.waitingOn = here
        this.waitingSince = now
        this.late = Math.random() < this.slips ? this.lead + SLIP * (0.5 + Math.random()) : 0
      }
      const goes = here >= 0 && solid(here) ? fallAt[here] : now
      if (goes - now > this.lead - this.late && now - this.waitingSince < LONGEST_WAIT + this.late) {
        const cx = TILES[here].x + (dx / d) * 0.4 - p.x
        const cz = TILES[here].z + (dz / d) * 0.4 - p.z
        const off = Math.hypot(cx, cz)
        if (off > 0.15) {
          const pace = Math.min(1, off / 0.8) / off
          input.x = cx * pace
          input.z = cz * pace
        }
      } else {
        this.jumpFrames = 3
        run(d / AIRTIME)
      }
    } else {
      // Further: run for it, jumping any hole on the way from its edge
      run(this.speed)
      if (this.edgeAhead(layer, p.x, p.z, dx / d, dz / d, now)) this.jumpFrames = 3
    }
    if (this.jumpFrames > 0) {
      this.jumpFrames--
      input.jump = true
    }
  }

  // Does the floor give out just ahead (a hole, or a tile that'll be gone by the time it's there)?
  private edgeAhead(layer: number, x: number, z: number, ux: number, uz: number, now: number) {
    for (const ahead of [0.45, 0.8]) {
      if (!standable(tileUnder(layer, x + ux * ahead, z + uz * ahead), now + ahead / this.speed)) return true
    }
    return false
  }

  private decide(me: number, p: At, vy: number, feet: number, layer: number, grounded: boolean, now: number) {
    this.others.length = 0
    for (const r of allRunners()) {
      if (r.handle === me) continue
      const o = r.position()
      if (Math.abs(o.y - p.y) < 3 && Math.abs(o.x - p.x) < 12 && Math.abs(o.z - p.z) < 12) this.others.push(o.x, o.z)
    }
    // In the air: only somewhere it can get to before it comes down
    const fall = Math.max(0, feet - layerTop(layer))
    const reach = grounded ? Infinity : (this.speed * (vy + Math.sqrt(vy * vy + 2 * G * fall))) / G + 0.6

    let best = this.pick(layer, p, now, reach, grounded)
    // Nowhere worth going on this floor (a dead end at best): down to the best spot on the one below
    if (grounded && layer > 0 && (best < 0 || this.deadEnd(best))) {
      const below = this.pick(layer - 1, p, now, 9, false)
      if (below >= 0) best = below
    }
    if (this.target >= 0 && this.target !== best && claims.get(this.target)?.by === this) claims.delete(this.target)
    this.target = best
    if (best >= 0) claims.set(best, { by: this, until: now + 1.5 })
  }

  // The best untouched tile to make for on a floor, within `reach` (or -1). `onFloor`: it's on that floor,
  // and has to be able to get there: with a hop, or else running (and jumping one hole at most).
  private pick(layer: number, p: At, now: number, reach: number, onFloor: boolean) {
    const fr = p.z / (1.5 * HEX)
    const q0 = Math.round(p.x / SPACING - fr / 2)
    const r0 = Math.round(fr)
    const here = tileUnder(layer, p.x, p.z)
    let best = -1
    let bestScore = -Infinity
    for (let dr = -LOOK; dr <= LOOK; dr++) {
      for (let dq = -LOOK; dq <= LOOK; dq++) {
        if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) > LOOK) continue
        const c = tileAt(layer, q0 + dq, r0 + dr)
        if (c < 0 || c === here || !fresh(c)) continue
        const tile = TILES[c]
        const d = Math.hypot(tile.x - p.x, tile.z - p.z)
        if (d > reach) continue
        let score = 0
        overHole = false
        if (onFloor && d > this.leap) {
          // (Too far to hop: running there, it uses up the tiles on the way)
          if (!this.reachable(layer, p, tile, d, now)) continue
          score -= 1.5 + (overHole ? 0.4 : 0)
        }
        for (const n of tile.around) if (fresh(n)) score += 1
        for (const n of tile.near) if (fresh(n)) score += 0.2
        score -= 0.25 * Math.abs(d - 1.2 * SPACING)
        for (let o = 0; o < this.others.length; o += 2) {
          const od = Math.hypot(this.others[o] - tile.x, this.others[o + 1] - tile.z)
          if (od < CROWD) score -= 2.5 * (1 - od / CROWD)
        }
        const claim = claims.get(c)
        if (claim && claim.by !== this && claim.until > now) score -= 2
        // Keep on for the same one (no dithering), keep in from the edge, and a leaning of its own
        if (c === this.target) score += 0.8
        score -= 0.04 * Math.hypot(tile.x, tile.z)
        score += 0.4 * Math.sin(c * 12.9898 + this.seed + Math.floor(now / 3))
        if (score > bestScore) {
          bestScore = score
          best = c
        }
      }
    }
    return best
  }

  // Can it run to the tile along the floor, jumping one hole at most (no wider than a jump), over nothing
  // that'll have gone by the time it's there?
  private reachable(layer: number, p: At, tile: { x: number; z: number }, d: number, now: number) {
    const ux = (tile.x - p.x) / d
    const uz = (tile.z - p.z) / d
    const span = this.speed * AIRTIME - 0.7
    let gapFrom = -1
    let gaps = 0
    for (let s = SAMPLE; s < d; s += SAMPLE) {
      if (standable(tileUnder(layer, p.x + ux * s, p.z + uz * s), now + s / this.speed)) {
        if (gapFrom >= 0 && s - gapFrom > span) return false
        gapFrom = -1
        continue
      }
      if (gapFrom < 0) {
        if (++gaps > 1) return false
        gapFrom = s
        overHole = true
      }
    }
    return gapFrom < 0 || d - gapFrom <= span
  }

  // A tile with no untouched tile within a hop or two of it: from there, it'd be jumping into thin air
  private deadEnd(c: number) {
    for (const n of TILES[c].near) if (fresh(n)) return false
    return true
  }
}

// Somewhere to put a foot down at time t: a tile that'll still be there
function standable(k: number, t: number) {
  return k >= 0 && solid(k) && fallAt[k] > t
}
