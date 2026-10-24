import { WALL } from './course'

// When the wall (./Wall) is up and when it's down: up ten seconds, down five, round and round on the match clock

export const CYCLE = WALL.up + WALL.down
const smooth = (u: number) => u * u * (3 - 2 * u)

// Where the wall's top is at time t (0: down, flush with the track)
export function wallTop(t: number) {
  const c = ((t % CYCLE) + CYCLE) % CYCLE
  if (c < WALL.move) return WALL.height * smooth(c / WALL.move)
  if (c < WALL.up) return WALL.height
  if (c < WALL.up + WALL.move) return WALL.height * (1 - smooth((c - WALL.up) / WALL.move))
  return 0
}
// How long it stays down from t (0 if it isn't down)
export function openFor(t: number) {
  const c = ((t % CYCLE) + CYCLE) % CYCLE
  return c >= WALL.up + WALL.move ? CYCLE - c : 0
}
export const rising = (t: number) => {
  const c = ((t % CYCLE) + CYCLE) % CYCLE
  return c < WALL.move
}

