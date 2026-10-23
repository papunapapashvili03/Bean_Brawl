import type { Outfit } from '../outfit'

// What goes back and forth with the online play server (../../../server/index.mjs), as JSON.
//
// To the server:
//   { t: 'join', room, name, outfit }   into a room
//   { t: 's', d: State }                where my bean is and what it's doing (about 20 a second)
//   { t: 'outfit', outfit }             I've changed what I'm wearing
//   { t: 'ping', c }                    (c: my clock, to time the answer)
// From it:
//   { t: 'welcome', id, colour, players: Player[] }   I'm in: my id and colour, and who's here already
//   { t: 'join', player: Player } / { t: 'leave', id }
//   { t: 's', id, d: State }            someone's bean
//   { t: 'outfit', id, outfit }
//   { t: 'pong', c, s }                 (c back, s: the server's clock)
//   { t: 'error', reason }              'room-full' | 'no-such-room'

export type NetPlayer = { id: number; name: string; colour: string; outfit: Partial<Outfit> }

// A bean's state, as a flat list of numbers (the server checks there are STATE_LENGTH of them, all numbers)
export const STATE_LENGTH = 11
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
} as const
export const FLAG_GROUNDED = 1
export const FLAG_ROLL = 2
export const FLAG_HANG = 4

export const SEND_EVERY = 0.05 // seconds: 20 a second
