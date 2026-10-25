import {
  BAND,
  END,
  LAVA_START,
  PILLARS,
  ROUND,
  SINK_DEPTH,
  SINK_WARN,
  SPEED,
  START_TOP,
  TIDE_EVERY,
  TIDE_FIRST,
  TIDE_RISE,
  TIDE_TIME,
} from './course'
import { COUNTDOWN_SECONDS } from '../race/race'
import { roundSeedFor, shuffle } from '../roundSeed'

// The round's timetable: the lava's level, and every pillar's height, at any time on the match clock. It's all
// worked out when the round starts (different every round), so everyone (the arena, the bots) knows where
// everything will be. A pillar holds a height for a few seconds, then goes to another (a little over where
// the lava will be by then); now and then instead it glows, sinks under the lava for a few seconds, and comes
// back up. Never too many are under at once. As the round goes on they hold their heights for less long, and
// sink more often; and from half a minute in, one after another (the outer ones first, mostly) glows and sinks
// for good, till only two are left: two neighbours near the middle, that take turns to sink, so whoever's
// still standing has to keep hopping from one to the other, all together, for the last thirty-five seconds
// or so.

const RUN = COUNTDOWN_SECONDS
const MAX_UNDER = 0.3 // of the pillars still about, under the lava for a while at any one time (at most)
const FEW = 4 // with fewer than this still about, none sinks for a while (only for good)
const KEEP = 2 // pillars that never sink for good
const RETIRE_FROM = RUN + 30 // when the first sinks for good
const RETIRE_BY = END - 40 // ...and when the last does
const GONE = -12 // where a pillar that's sunk for good ends up
const FINAL = RETIRE_BY + 2 // when the last two start taking turns to sink
const TURNS_EVERY = 5 // ...one after the other, this far apart

// ---------------------------------------------------------------------------------------------------------
// The lava

export function lavaAt(time: number) {
  const t = still(time)
  if (t <= TIDE_FIRST) return LAVA_START
  const n = Math.floor((t - TIDE_FIRST) / TIDE_EVERY)
  const into = t - TIDE_FIRST - n * TIDE_EVERY
  const rising = Math.min(1, into / TIDE_TIME)
  return LAVA_START + TIDE_RISE * (n + rising * rising * (3 - 2 * rising))
}
// When the next tide starts coming in, from t
export function nextTide(t: number) {
  if (t < TIDE_FIRST) return TIDE_FIRST
  return TIDE_FIRST + Math.ceil((t - TIDE_FIRST) / TIDE_EVERY + 1e-9) * TIDE_EVERY
}

// ---------------------------------------------------------------------------------------------------------
// The pillars

// Each pillar's heights: times and heights to go between, smoothly; and when each of its sinks starts (and
// when its glow does)
type Plan = { at: number[]; y: number[]; sinks: { warnAt: number; at: number; upAt: number }[] }
export const plans: Plan[] = PILLARS.map(() => ({ at: [], y: [], sinks: [] }))

function seeded(seed: number) {
  let s = seed % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

export function planPillars(seed = Math.floor(Math.random() * 1e9)) {
  const random = seeded(seed)
  // The two that stay to the end: one near the middle and a neighbour of it
  const middle = PILLARS.map((_, i) => i).filter((i) => PILLARS[i].ring <= 1)
  const first = middle[Math.floor(random() * middle.length)]
  const second = PILLARS[first].around[Math.floor(random() * PILLARS[first].around.length)]
  const kept = [first, second]
  // When each of the rest sinks for good: the outer ones first, mostly, coming quicker towards the end
  const retireAt = PILLARS.map(() => Infinity)
  const leaving = PILLARS.map((p, i) => ({ i, k: kept.includes(i) ? -Infinity : p.ring + random() * 2.5 }))
    .sort((a, b) => b.k - a.k)
    .slice(0, PILLARS.length - KEEP)
  leaving.forEach(({ i }, n) => (retireAt[i] = RETIRE_FROM + (RETIRE_BY - RETIRE_FROM) * ((n + 1) / leaving.length) ** 0.8))
  const about = (t: number) => retireAt.filter((at) => at > t).length
  const under: [number, number][] = [] // every sink for a while: from when it starts going down till it's back up
  const busy = (from: number, to: number) => under.filter(([a, b]) => a < to && b > from).length
  // (Visited in a random order, so it isn't always the same ones that get to sink)
  const order = shuffle(PILLARS.map((_, i) => i), random)
  for (const i of order) {
    const plan = plans[i]
    plan.at.length = plan.y.length = plan.sinks.length = 0
    let t = 0
    let y = LAVA_START + START_TOP + (random() - 0.5) * 0.3
    const hold = (until: number) => {
      plan.at.push(t, until)
      plan.y.push(y, y)
      t = until
    }
    const move = (to: number, speed = SPEED) => {
      const time = Math.max(0.6, Math.abs(to - y) / speed)
      t += time
      y = to
      plan.at.push(t)
      plan.y.push(y)
    }
    // One that sinks (glowing first), stays under a moment, and comes back up
    const sinkFor = (stay: number) => {
      const start = t
      move(lavaAt(t + 1) - SINK_DEPTH)
      hold(t + stay)
      move(lavaAt(t + 2) + BAND.low + random() * (BAND.high - BAND.low))
      plan.sinks.push({ warnAt: start - SINK_WARN, at: start, upAt: t })
      return start
    }
    hold(RUN + 2 + random() * 6)
    while (t < END + 10) {
      // One of the last two, at the end: taking turns with the other to sink
      const turn = kept.indexOf(i)
      if (turn >= 0 && t >= FINAL - 8) {
        move(lavaAt(t + 2) + 1.4)
        for (let at = FINAL + turn * TURNS_EVERY; at < END + 10; at += 2 * TURNS_EVERY) {
          if (at < t) continue
          hold(at)
          sinkFor(0.8)
        }
        break
      }
      // Its time to sink for good: glowing first, then down, and gone
      if (t >= retireAt[i] - SINK_WARN) {
        const start = Math.max(t, retireAt[i])
        if (start > t) hold(start)
        move(GONE, SPEED * 2)
        plan.sinks.push({ warnAt: start - SINK_WARN, at: start, upAt: Infinity })
        break
      }
      const late = Math.min(1, (t - RUN) / ROUND)
      const sinkNow = random() < 0.18 + 0.17 * late
      const down = (SINK_DEPTH + (y - lavaAt(t))) / SPEED
      const stay = 2 + random() * 2
      if (sinkNow && t > RUN + 10 && t + down + stay + 2 < Math.min(retireAt[i], FINAL - 8) && about(t + down + stay + 2) >= FEW && busy(t, t + down + stay + 2) < MAX_UNDER * about(t)) {
        // Glowing (from a moment ago), then down under the lava, a while there, and back up
        const start = sinkFor(stay)
        under.push([start, t])
      } else {
        // To a new height, a little over where the lava will be when it gets there
        move(lavaAt(t + 1.5) + BAND.low + random() * (BAND.high - BAND.low))
      }
      hold(Math.min(retireAt[i], t + (2.5 + random() * 4.5) * (1 - 0.35 * late)))
    }
    // (A sink glows SINK_WARN before it starts: the hold before it is long enough for that, mostly; never
    // before the round's begun)
    for (const s of plan.sinks) s.warnAt = Math.max(RUN, s.warnAt)
  }
}

const smooth = (u: number) => u * u * (3 - 2 * u)

// Where a pillar's top is at time t
export function topAt(i: number, time: number) {
  const t = still(time)
  const { at, y } = plans[i]
  if (!at.length || t <= at[0]) return y[0] ?? LAVA_START + START_TOP
  let lo = 0
  let hi = at.length - 1
  if (t >= at[hi]) return y[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (at[mid] <= t) lo = mid
    else hi = mid
  }
  const span = at[hi] - at[lo]
  return span > 0 ? y[lo] + (y[hi] - y[lo]) * smooth((t - at[lo]) / span) : y[hi]
}

// How far a pillar's top is over the lava at time t (under it: less than 0)
export const overLava = (i: number, t: number) => topAt(i, t) - lavaAt(t)

// The sink a pillar is glowing for (or going under in) at time t, if any
export function sinkingAt(i: number, t: number) {
  for (const s of plans[i].sinks) if (t >= s.warnAt && t < s.upAt) return s
  return null
}

// Until when a pillar's safe to stand on (its top at least `margin` over the lava), looking from t up to
// `horizon` seconds ahead (t + horizon if it's safe all that time; t if it isn't now)
export function safeUntil(i: number, t: number, horizon: number, margin = 0.2) {
  for (let k = 0; k <= horizon; k += 0.2) if (overLava(i, t + k) < margin) return t + k
  return t + horizon
}

// ---------------------------------------------------------------------------------------------------------
// The round: whether it's over, and who won

export const round = { over: false, at: Infinity, lastStanding: false, winner: null as string | null }
// (Once the round's over, everything stays as it was then)
const still = (t: number) => Math.min(t, round.at)

export function resetLava() {
  round.over = false
  round.at = Infinity
  round.lastStanding = false
  round.winner = null
  planPillars(roundSeedFor('lava'))
}

export function endRound(lastStanding: boolean, winner: string | null, at: number) {
  round.over = true
  round.at = at
  round.lastStanding = lastStanding
  round.winner = winner
}
