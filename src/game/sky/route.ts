import type { BotView, P3, Route } from '../race/bots/route'
import { CASCADE, CLIMB_PLATFORMS, FINISH, MAZE, PLAYER_SLOT, RAMP, START_SLOTS, TOP_Y, VAULT, WIDTH, cascadeGapX, floorY } from './course'

// The bots' way round the sky course (see ../race/bots): down the ramp, up the cascade, across the vault,
// through a door in each wall of the maze, up the spinning coins and through the gate. Each keeps to its own
// side of the wide parts, as it started.

const SIDE = WIDTH / 2 - 2.6 // how far from the middle they spread out

export const BOT_STARTS: P3[] = START_SLOTS.filter((_, i) => i !== PLAYER_SLOT).map(([x, z]) => [x, 1.3, z])
export const botLane = (start: P3) => start[0] / 8.1

// A wall of the maze: which door to make for. Two of the five are real, and look just like the rest: a bot
// goes for one that's already standing open if it can see one, and otherwise tries them (the nearest it
// hasn't tried), pushing up against each a moment to find out.
const DOORS = MAZE.doorXs.length
function doorIn(wallZ: number) {
  const face = wallZ + 0.8 // the front of a shut door
  return (v: BotView): P3 => {
    const m = v.memo
    const { world, rapier } = v.physics
    if (v.t >= (m.scan ?? 0)) {
      m.scan = v.t + 0.3
      const flags = rapier.QueryFilterFlags.EXCLUDE_KINEMATIC | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_SENSORS
      for (let i = 0; i < DOORS; i++) {
        const ray = new rapier.Ray({ x: MAZE.doorXs[i], y: TOP_Y + 1, z: wallZ + 2.5 }, { x: 0, y: 0, z: -1 })
        m[`open${i}`] = world.castRay(ray, 3.5, true, flags) ? 0 : 1
      }
    }
    const open = (i: number) => m[`open${i}`] === 1
    const tried = (i: number) => m[`tried${i}`] === 1
    let pick = m.door ?? -1
    const anyOpen = MAZE.doorXs.some((_, i) => open(i))
    if (pick < 0 || (anyOpen ? !open(pick) : tried(pick))) {
      // The nearest worth going for (each bot with leanings of its own, so they don't all try the same one)
      let best = Infinity
      const all = MAZE.doorXs.every((_, i) => tried(i))
      for (let i = 0; i < DOORS; i++) {
        if (anyOpen ? !open(i) : tried(i) && !all) continue
        const leaning = anyOpen ? 0 : 2.5 * Math.abs(Math.sin(i * 2.4 + v.bias * 5))
        const cost = Math.abs(MAZE.doorXs[i] - v.x) + leaning
        if (cost < best) {
          best = cost
          pick = i
        }
      }
      m.door = pick
      m.press = -1
    }
    const x = MAZE.doorXs[pick]
    if (!open(pick)) {
      // Up against it: if it hasn't opened in a moment, it isn't going to
      const pressing = Math.abs(v.x - x) < 1.2 && v.z - face < 0.62
      if (!pressing) m.press = -1
      else if ((m.press ?? -1) < 0) m.press = v.t
      else if (v.t - m.press > 0.45) {
        m[`tried${pick}`] = 1
        m.door = -1
      }
    }
    return [x, TOP_Y, wallZ - 1.6]
  }
}

// Up the cascade: a few metres on up the slope, in the lane the next wave of coins leaves clear; and once
// near the top, off it
const CASCADE_AHEAD = 5
const CASCADE_TOP = CASCADE.z1 - 1.5
function upCascade(v: BotView): P3 {
  const z = Math.min(v.z, CASCADE.z0) - CASCADE_AHEAD
  if (z <= CASCADE_TOP + 1) return [v.bias * (SIDE - 0.5), TOP_Y, CASCADE_TOP]
  return [cascadeGapX(v.z, v.t) + v.bias * 0.9, floorY(z), z]
}

export const SKY_ROUTE: Route = [
  { at: [0, floorY(RAMP.z1 + 1), RAMP.z1 + 1], spread: SIDE, resume: 0 },
  { at: upCascade, resume: 1 },
  { at: [0, TOP_Y, VAULT.z1 - 1], spread: SIDE, resume: 2 },
  ...MAZE.walls.map((z, i) => ({ at: doorIn(z), r: 0.9, ...(i === 0 ? { resume: 3 } : {}) })),
  ...CLIMB_PLATFORMS.map((p, i) => ({ at: [p.x, p.top, p.z] as P3, r: 1, ...(i === 0 ? { resume: 4 } : {}) })),
  { at: [0, FINISH.y, FINISH.zFront - 2.5], r: 1.6 },
  { at: [0, FINISH.y, FINISH.gateZ - 1.5], spread: 2.5 },
  // Over the line: on to the back of the deck, clear of the sweeper
  { at: [0, FINISH.y, FINISH.zBack + 2.2], spread: 5.5, r: 1 },
]
