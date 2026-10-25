import { BOT_GUNS, type BotDef } from './brain'
import type { P3, TeamSetup } from './match'
import type { NavBounds } from './nav'

// How a gunfight map sets up its bots (see ./Bots)
export type BotsSetup = {
  id: string // names the map (its bots' way round is worked out once and kept)
  teams: TeamSetup[]
  playerTeam: string
  playerSpawn: P3 // where the player starts (the bots start elsewhere)
  size: number // per side, counting the player on its own side
  bounds: NavBounds // where the bots can go
  fallY: number // below this, a bot has fallen off
}

const NAMES = ['Ace', 'Blaze', 'Comet', 'Dash', 'Echo', 'Fizz', 'Gizmo', 'Hex', 'Ivy', 'Jinx', 'Koda', 'Lux', 'Moxie', 'Nova', 'Orbit', 'Pip']

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7) || 1

const middle = (points: [number, number, number][]): [number, number] => [
  points.reduce((s, p) => s + p[0], 0) / points.length,
  points.reduce((s, p) => s + p[2], 0) / points.length,
]

// The bots for a map: their names, guns and where each stands among the bots (`rank`: how good it is, within
// the difficulty it plays at: see ./brain), the same each time for a map
export function botDefs(setup: BotsSetup): BotDef[] {
  const rand = seeded(hash(setup.id))
  const names = [...NAMES].sort(() => rand() - 0.5)
  const defs: BotDef[] = []
  for (const team of setup.teams) {
    const other = setup.teams.find((t) => t.id !== team.id)!
    const count = setup.size - (team.id === setup.playerTeam ? 1 : 0)
    for (let i = 0; i < count; i++) {
      defs.push({
        name: names[defs.length % names.length],
        team: team.id,
        colour: team.colour,
        gun: BOT_GUNS[Math.floor(rand() * BOT_GUNS.length)],
        rank: rand(),
        home: middle(team.spawns),
        away: middle(other.spawns),
      })
    }
  }
  return defs
}
