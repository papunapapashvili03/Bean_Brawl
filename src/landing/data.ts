// What the landing page offers: two modes, each a set of maps (every map is a level of the games app, at
// /games/#id). Playground, Island and Dust Bowl Valley aren't in either: they're still at their own links.

export type ModeId = 'party-games' | 'shoot-out'

export type Game = {
  id: string
  title: string
  tag: string // what kind of round it is
  players: number // how many play it (the rest of the spots are bots)
  meta: string // a few words for its row in the list
  blurb: string
}

export type Mode = {
  id: ModeId
  title: string
  tagline: string
  facts: string[]
  maps: Game[]
}

export const MODES: Mode[] = [
  {
    id: 'party-games',
    title: 'Party Games',
    tagline: 'A show of three rounds, a new map each: race to get through, then win the final.',
    facts: ['24–30 players', '3 rounds', 'Bots fill empty spots'],
    maps: [
      { id: 'sky', title: 'Sky Race', tag: 'Obstacle race', players: 16, meta: 'Race · 16 players', blurb: 'Down the ramp, up the coin cascade and through the door maze to the line.' },
      { id: 'tower', title: 'Tower', tag: 'Obstacle race', players: 10, meta: 'Race · 10 players', blurb: 'Climb the switchbacks past boulders, cannons and bumpers to the summit.' },
      { id: 'neon', title: 'Neon', tag: 'Obstacle race', players: 10, meta: 'Race · 10 players', blurb: 'Race the highway, cross the blackout grid and ride the balloons home.' },
      { id: 'whirly', title: 'The Whirlygig', tag: 'Obstacle race', players: 16, meta: 'Race · 16 players', blurb: 'Discs, fans, a windswept bridge, a giant rotor and a wall of windmills: eight sections to the line.' },
      { id: 'gym', title: 'Jungle Gym', tag: 'Obstacle race', players: 16, meta: 'Race · 16 players', blurb: 'Swing the bars, hop the columns, scale the wall and outrun the storm.' },
      { id: 'crumble', title: 'Crumbling Tower', tag: 'Survival', players: 15, meta: 'Survival · 15 players', blurb: 'Climb before it crumbles, then hold on to the crown as it shrinks.' },
      { id: 'tilt', title: 'Tilt Town', tag: 'Survival', players: 12, meta: 'Survival · 12 players', blurb: 'Hold on for a minute while the town tips over and its edge breaks away.' },
      { id: 'hex', title: 'Hexagon', tag: 'Survival', players: 16, meta: 'Survival · 16 players', blurb: 'Eight floors of tiles that drop once touched. Be the last one standing.' },
      { id: 'ice', title: 'Thin Ice', tag: 'Survival', players: 16, meta: 'Survival · 16 players', blurb: 'Three floors of ice that crack under you. Keep hopping, and be the last one standing.' },
      { id: 'color', title: 'Color Call', tag: 'Survival', players: 16, meta: 'Survival · 16 players', blurb: 'A colour is called and the rest of the floor drops. Get on it, faster every time.' },
      { id: 'jump', title: 'Jump Showdown', tag: 'Survival', players: 16, meta: 'Survival · 16 players', blurb: 'Jump the low beam, duck the high one, as they speed up and the platform falls away.' },
      { id: 'panic', title: 'Pattern Panic', tag: 'Survival', players: 16, meta: 'Survival · 16 players', blurb: 'Waves of strikes light up the floor, then drop it. Read the pattern and get clear.' },
    ],
  },
  {
    id: 'shoot-out',
    title: 'Shoot Out',
    tagline: 'Four against four, team deathmatch. First side to 25 takedowns wins.',
    facts: ['4 v 4', 'Team deathmatch', 'First to 25'],
    maps: [
      { id: 'arena', title: 'Block Party', tag: 'Team shooter', players: 8, meta: 'Floating island', blurb: 'A block-built arena on a floating island. Grab a gun from the racks and climb anything taped.' },
      { id: 'villa', title: 'Hillside', tag: 'Team shooter', players: 8, meta: 'Hillside compound', blurb: 'A walled compound on the hillside, room to room and garden to garden.' },
      { id: 'suburb', title: 'Suburb', tag: 'Team shooter', players: 8, meta: 'Desert cul-de-sac', blurb: 'A desert cul-de-sac: back yards, a yellow house and cars in the circle.' },
      { id: 'showdown', title: 'Neon Showdown', tag: 'Team shooter', players: 8, meta: 'Neon city', blurb: 'A glowing circuit board among the towers of the neon city.' },
    ],
  },
]

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id)!

// A map in a mode, played from the mode's page (the games app then shows it as a match, with a way back)
export const playUrl = (mode: ModeId, map: string) => `/games/?mode=${mode}#${map}`
// A party show, starting on its first map (the show itself is kept for the tab, see ../game/show)
export const showUrl = (first: string) => `/games/?mode=party-games&show=1#${first}`
