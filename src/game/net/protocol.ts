import type { Outfit } from '../outfit'

// What goes back and forth with the online play server (../../../server/index.mjs), as JSON.
//
// To the server:
//   { t: 'join', room: 'playground', name, outfit }   into the playground
//   { t: 'queue', name, outfit, skill } into a Party Games lobby (see ./party); skill: { q, f }, how hard I
//                                       need the bots in the qualifying rounds and the final (../bots/difficulty)
//   { t: 'rejoin', show, ticket }       back into a show I dropped out of
//   { t: 'leave' }                      out of my lobby or show, for good
//   { t: 's', d: State }                where my bean is and what it's doing (about 20 a second)
//   { t: 'b', d: Bots }                 (a show's host) where the bots are (about 10 a second)
//   { t: 'done', how, clock, bot? }     my round's over (or, from the host, a bot's): 'finish' (home), 'out',
//                                       or 'won' (the final), when by the round's clock
//   { t: 'away' } / { t: 'here' }      my page is hidden or barely being drawn (or back): in a show, someone
//                                       else should run the bots meanwhile
//   { t: 'outfit', outfit }             I've changed what I'm wearing
//   { t: 'ping', c }                    (c: my clock, to time the answer)
// From it:
//   { t: 'welcome', id, colour, players: Player[] }   I'm in the playground: my id and colour, and who's here
//   { t: 'lobby', id, seed, startAt, max, you, colour, players }   I'm in a lobby, the show starting at startAt
//   { t: 'starts', at }                 the lobby's full: it starts sooner
//   { t: 'show', id, seed, at, round, host, players, ticket, field }   the show's started: round 0's clock
//                                       starts at `at` (the server's clock); `host` runs the bots; `field`:
//                                       { low, high }, how hard the round's bots play (../bots/difficulty)
//   { t: 'rejoined', id, colour, round, at, host, players, field }    back in my show
//   { t: 'result', round, through, at, field }   a round's decided: who's through ('p:<id>' players,
//                                       'b:<name>' bots), when the next one's clock starts, and its field
//   { t: 'host', id }                   someone else runs the bots now
//   { t: 'done', id | bot, how, clock } someone's (or a bot's) round is over
//   { t: 'join', player: Player } / { t: 'leave', id }
//   { t: 's', id, d: State }            someone's bean
//   { t: 'b', id, d: Bots }             the bots, from the host
//   { t: 'outfit', id, outfit }
//   { t: 'pong', c, s }                 (c back, s: the server's clock)
//   { t: 'error', reason }              'room-full' | 'no-such-room' | 'show-gone'

export type NetPlayer = { id: number; name: string; colour: string; outfit: Partial<Outfit> }

// A bean's state, as a flat list of numbers (the server checks there are STATE_LENGTH of them, all numbers).
// From x to crouch they're in the same order as each bot's in a Bots message, so both are read the same way
// (./puppet).
export const STATE_LENGTH = 12
export const S = {
  stamp: 0, // the sender's clock (ms) when it was taken
  x: 1, // the body's middle
  y: 2,
  z: 3,
  vx: 4, // how fast it's going
  vy: 5,
  vz: 6,
  yaw: 7, // which way it faces
  flags: 8, // FLAG_*
  crouch: 9, // 0..1
  grabs: 10, // how many things it's caught hold of so far (each new one, it jolts)
  checkpoint: 11, // in a race, the last checkpoint it's reached
} as const
export const FLAG_GROUNDED = 1
export const FLAG_ROLL = 2
export const FLAG_HANG = 4

// The bots, from a show's host: its clock (ms), then BOT_STATE numbers for each bot (in the order the
// round's bots are made in, the same on every screen): x, y, z, vx, vy, vz, yaw, flags, crouch, checkpoint
export const BOT_STATE = 10
export const B = { x: 0, y: 1, z: 2, vx: 3, vy: 4, vz: 5, yaw: 6, flags: 7, crouch: 8, checkpoint: 9 } as const

export const SEND_EVERY = 0.05 // seconds: 20 a second
export const BOTS_EVERY = 0.1 // seconds: 10 a second
