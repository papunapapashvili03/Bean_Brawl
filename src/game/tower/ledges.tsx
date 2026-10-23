import { useGrabEdges, type GrabEdge } from '../grab'
import { TapedRod } from '../GripTape'
import { Block } from '../race/parts'
import { BRIDGE, COLORS, LADDERS, SHELF_DEPTH, TIERS } from './course'

// Hanging ledges on the tower. Every taped edge is one the hands catch (see ../grab):
//  - a safety lip along the plaza front, for jumps off the last pillar that fall short of the slime shore
//  - ledge ladders at the bottom of each switchback (shelf, then tier lip): a shortcut in the boulder run-off
//  - both sides of the cannon bridge: drop over the side and hang, and the shots fly over your head

type P3 = [number, number, number]

const TRIM = 0.23 // tier tops carry a raised rim; the lip sits on top of it
const BRIDGE_END_INSET = 0.3

type Ledge = { a: P3; b: P3; out: { x: number; z: number } }

const plazaTop = TIERS.plaza.max[1] + TRIM
const plazaFront = TIERS.plaza.max[2]
const bridgeTop = BRIDGE.max[1]
const bridgeZ0 = BRIDGE.max[2] - BRIDGE_END_INSET
const bridgeZ1 = BRIDGE.min[2] + BRIDGE_END_INSET

const LEDGES: Ledge[] = [
  { a: [TIERS.plaza.min[0], plazaTop, plazaFront], b: [TIERS.plaza.max[0], plazaTop, plazaFront], out: { x: 0, z: 1 } },
  ...LADDERS.flatMap((l): Ledge[] => [
    { a: [l.x0, l.shelfTop, l.wallZ + SHELF_DEPTH], b: [l.x1, l.shelfTop, l.wallZ + SHELF_DEPTH], out: { x: 0, z: 1 } },
    { a: [l.x0, l.tierTop + TRIM, l.wallZ], b: [l.x1, l.tierTop + TRIM, l.wallZ], out: { x: 0, z: 1 } },
  ]),
  ...[-1, 1].map((side): Ledge => {
    const x = side < 0 ? BRIDGE.min[0] : BRIDGE.max[0]
    return { a: [x, bridgeTop, bridgeZ0], b: [x, bridgeTop, bridgeZ1], out: { x: side, z: 0 } }
  }),
]

const EDGES: GrabEdge[] = LEDGES.map(({ a, b, out }) => ({
  kind: 'ledge',
  a: { x: a[0], y: a[1], z: a[2] },
  b: { x: b[0], y: b[1], z: b[2] },
  out,
}))

export function TowerLedges() {
  useGrabEdges(EDGES)
  return (
    <>
      {LADDERS.map((l, i) => (
        <Block
          key={i}
          min={[l.x0, l.shelfTop - 0.5, l.wallZ]}
          max={[l.x1, l.shelfTop, l.wallZ + SHELF_DEPTH]}
          color={COLORS.trim}
          top={COLORS.top}
        />
      ))}
      {LEDGES.map((l, i) => (
        <TapedRod key={i} a={l.a} b={l.b} />
      ))}
    </>
  )
}
