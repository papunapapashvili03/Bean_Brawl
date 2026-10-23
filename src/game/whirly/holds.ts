import type { GrabEdge } from '../grab'
import { HOLD_HALF } from './course'

// Climbing holds, for the course's climbing walls (./Climb, ./WindmillWall): where they go up a face, and
// them (and the ledge along the face's top) as things to grab

type P3 = [number, number, number]

export type Hold = { x: number; y: number; color: string }

// Holds in columns up a face, with a little seeded wobble (small enough that hopping straight up still
// catches the next one)
export function holdSpots(rows: readonly number[], columns: readonly number[], seed = 9): Hold[] {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const candy = ['#ffd23f', '#4fc3ff', '#ff3d9a', '#7cf08a', '#ffffff', '#ff9a3c']
  return rows.flatMap((y) => columns.map((x0) => ({ x: x0 + (rand() - 0.5) * 0.24, y, color: candy[Math.floor(rand() * candy.length)] })))
}
// A face's holds, and ledges along its top, as things to grab (the face looks towards +z)
export function climbEdges(holds: readonly Hold[], ledges: readonly { a: P3; b: P3 }[], face: number): GrabEdge[] {
  return [
    ...holds.map(
      (h): GrabEdge => ({
        kind: 'hold',
        a: { x: h.x - HOLD_HALF, y: h.y, z: face + 0.1 },
        b: { x: h.x + HOLD_HALF, y: h.y, z: face + 0.1 },
        out: { x: 0, z: 1 },
      }),
    ),
    ...ledges.map(
      (l): GrabEdge => ({
        kind: 'ledge',
        a: { x: l.a[0], y: l.a[1], z: l.a[2] },
        b: { x: l.b[0], y: l.b[1], z: l.b[2] },
        out: { x: 0, z: 1 },
      }),
    ),
  ]
}
