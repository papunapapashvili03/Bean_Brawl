import type { RaceCourse, Zone } from '../race/race'

// Sky course layout. Units are metres; runners head towards -z, so "distance along the course" is -z.

export const FALL_Y = -30
export const WIDTH = 22

const TAN20 = Math.tan((20 * Math.PI) / 180)

export const START = { zFront: 0, zBack: 12, y: 0 }
export const RAMP = { z0: 0, z1: -25, y0: 0, y1: -2.5 }
export const CASCADE = { z0: -25, z1: -70, y0: RAMP.y1, y1: RAMP.y1 + 45 * TAN20, angle: (20 * Math.PI) / 180 }
export const TOP_Y = CASCADE.y1 // the conveyor vault and door maze sit on this level

// The coins rolling down the cascade: a wave every `wave` seconds, a coin in every lane but one (`gaps`: the
// clear lane for each wave, cycling in a fixed pattern). They're thick enough that the gap between coins in
// neighbouring lanes (0.6 m) is narrower than a runner (1 m), so the open lane is the only way through.
export const COINS = {
  lanes: 5,
  laneWidth: 4,
  wave: 1.8,
  speed: 8, // metres per second down the slope
  radius: 1.6,
  thickness: 3.4,
  gaps: [2, 1, 0, 1, 2, 3, 4, 3],
}
export const laneX = (lane: number) => (lane - (COINS.lanes - 1) / 2) * COINS.laneWidth

// The middle of the lane left clear by the next wave to reach a runner at `z` on the slope (the one bearing
// down on it, or going by it now) at time t on the match clock
export function cascadeGapX(z: number, t: number) {
  const along = Math.cos(CASCADE.angle) * COINS.speed // how fast a coin's z grows
  const coinZ = (wave: number) => CASCADE.z1 + (t - wave * COINS.wave) * along
  const clear = z + COINS.radius + 0.6 // a coin further down than this has gone by
  // The oldest wave still above the runner
  let wave = Math.floor(t / COINS.wave)
  while (wave > 0 && coinZ(wave) < clear) wave--
  if (coinZ(wave) >= clear) wave++
  return laneX(COINS.gaps[Math.max(0, wave) % COINS.gaps.length])
}
export const VAULT = { z0: -70, z1: -110 }
export const MAZE = { z0: -110, z1: -146.5, walls: [-117, -126, -135], doorXs: [-8, -4, 0, 4, 8], doorWidth: 3 }

// Final climb: spinning coin platforms rising in a spiral, then the finish deck with the crown gate
export const CLIMB_PLATFORMS = Array.from({ length: 9 }, (_, i) => ({
  x: 3.2 * Math.sin(i * 1.25),
  z: -148.5 - i * 3.6,
  top: TOP_Y + 1 + i,
  radius: 1.8,
  spin: [0.5, -0.8, 0.65, -1, 0.7, -0.55, 0.9, -0.75, 0.6][i],
}))
const lastPlatform = CLIMB_PLATFORMS[CLIMB_PLATFORMS.length - 1]
export const FINISH = {
  zFront: lastPlatform.z - lastPlatform.radius,
  zBack: -198,
  y: lastPlatform.top + 1,
  width: 16,
  sweeperZ: -184.5,
  gateZ: -190,
  gateHalfWidth: 4.5,
}

// Height of the walkable floor at a point along the course (sections 1-4)
export function floorY(z: number) {
  if (z >= RAMP.z0) return START.y
  if (z >= RAMP.z1) return RAMP.y0 + ((RAMP.z0 - z) / (RAMP.z0 - RAMP.z1)) * (RAMP.y1 - RAMP.y0)
  if (z >= CASCADE.z1) return CASCADE.y0 + (CASCADE.z0 - z) * TAN20
  return TOP_Y
}

const respawnOn = (z: number): [number, number, number] => [0, floorY(z) + 1.3, z]

// Reaching `z` activates a checkpoint; falling off sends you back to its respawn point
export const CHECKPOINTS = [
  { z: -25, respawn: respawnOn(-23.5) },
  { z: -70, respawn: respawnOn(-71.5) },
  { z: -110, respawn: respawnOn(-112) },
  { z: -145, respawn: respawnOn(-143.5) },
]

export const SECTION_NAMES = ['Starting Ramp', 'Coin Cascade', 'Conveyor Vault', 'Safe Door Maze', 'Final Climb']

// 30 grid slots behind the start line: 3 rows of 10
export const START_SLOTS: [number, number][] = Array.from({ length: 30 }, (_, i) => [
  -8.1 + (i % 10) * 1.8,
  3 + Math.floor(i / 10) * 2.6,
])
export const PLAYER_SLOT = 4
export const PLAYER_SPAWN: [number, number, number] = [START_SLOTS[PLAYER_SLOT][0], 1.3, START_SLOTS[PLAYER_SLOT][1]]

// The only randomness in a match: which 2 of the 5 doors in each wall open. Everyone gets the same layout.
export function pickDoorLayout(random = Math.random): number[][] {
  return MAZE.walls.map(() => {
    const doors = [0, 1, 2, 3, 4]
    for (let i = doors.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[doors[i], doors[j]] = [doors[j], doors[i]]
    }
    return doors.slice(0, 2)
  })
}

// Anywhere past `z` along the course
const past = (z: number): Zone => ({ min: [-Infinity, -Infinity, -Infinity], max: [Infinity, Infinity, z] })

export const SKY_COURSE: RaceCourse = {
  spawn: PLAYER_SPAWN,
  sections: SECTION_NAMES,
  checkpoints: CHECKPOINTS.map((c) => ({ zone: past(c.z), respawn: c.respawn })),
  // Through the crown gate: between its posts, on the finish deck, past the line
  finish: {
    min: [-FINISH.gateHalfWidth, FINISH.y - 0.5, -Infinity],
    max: [FINISH.gateHalfWidth, Infinity, FINISH.gateZ],
  },
}
