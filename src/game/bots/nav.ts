import type { useRapier } from '@react-three/rapier'

// Where the bots can go, worked out from the map itself: the ground is cut into half-metre cells, and a ray
// down through each finds every surface it passes that faces up with room to stand above it (the ground,
// floors, stairs' slopes, roofs, the tops of crates...). Each becomes a node. Nodes in neighbouring cells link
// up where nothing stands between them: walking (up or down a little), jumping up onto something low, or
// dropping off something higher. Paths over the links come from A*.
//
// Only fixed things count: anything that moves (players, loose shapes, moving platforms) is ignored.

type Physics = ReturnType<typeof useRapier>
export type NavBounds = { x0: number; x1: number; z0: number; z1: number; inside: (x: number, z: number) => boolean }

const CELL = 0.5
const TOP = 40 // rays start above everything
const HEADROOM = 1.85 // room a body needs above a surface
const STEP = 0.5 // up or down this much between neighbouring cells is a walk
const JUMP = 1.3 // up onto something this high is a jump
const DROP = 4 // down off something this high is a drop
const SLICE = 6 // ms of work per frame while building

export type Link = 'walk' | 'jump' | 'drop'

export class NavGrid {
  readonly x0: number
  readonly z0: number
  readonly nx: number
  readonly nz: number
  xs: number[] = []
  ys: number[] = [] // the surface (feet) height
  zs: number[] = []
  cellOf: number[] = []
  links: { to: number; kind: Link; cost: number }[][] = []
  crowded: boolean[] = [] // close to a wall or an edge: paths keep away where they can
  goals: number[] = [] // open nodes reachable from the starts: somewhere to head for
  private head: Int32Array
  private next: number[] = []

  constructor(b: NavBounds) {
    this.x0 = b.x0
    this.z0 = b.z0
    this.nx = Math.ceil((b.x1 - b.x0) / CELL)
    this.nz = Math.ceil((b.z1 - b.z0) / CELL)
    this.head = new Int32Array(this.nx * this.nz).fill(-1)
  }

  get size() {
    return this.xs.length
  }

  add(cell: number, x: number, y: number, z: number) {
    const n = this.xs.length
    this.xs.push(x)
    this.ys.push(y)
    this.zs.push(z)
    this.cellOf.push(cell)
    this.links.push([])
    this.crowded.push(false)
    this.next.push(this.head[cell])
    this.head[cell] = n
    return n
  }

  // The nodes in cell (i, j)
  *inCell(i: number, j: number) {
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return
    for (let n = this.head[i + j * this.nx]; n >= 0; n = this.next[n]) yield n
  }

  // The node nearest a body centred at (x, y, z) (feet 1 below), within a metre or so; -1 if none
  nearest(x: number, y: number, z: number, reach = 2) {
    const ci = Math.floor((x - this.x0) / CELL)
    const cj = Math.floor((z - this.z0) / CELL)
    const feet = y - 1
    let best = -1
    let bestScore = Infinity
    for (let j = cj - reach; j <= cj + reach; j++) {
      for (let i = ci - reach; i <= ci + reach; i++) {
        for (const n of this.inCell(i, j)) {
          const dy = this.ys[n] - feet
          if (dy > 1 || dy < -2.5) continue
          const score = (this.xs[n] - x) ** 2 + (this.zs[n] - z) ** 2 + (dy * 1.5) ** 2
          if (score < bestScore) {
            bestScore = score
            best = n
          }
        }
      }
    }
    return best
  }

  // Is there ground to stand on at (x, z), level with feet at `feet`?
  standable(x: number, feet: number, z: number) {
    const i = Math.floor((x - this.x0) / CELL)
    const j = Math.floor((z - this.z0) / CELL)
    for (const n of this.inCell(i, j)) if (Math.abs(this.ys[n] - feet) < 0.6 && !this.crowded[n]) return true
    return false
  }

  // A* from one node to another: the nodes along the way (start excluded), or null
  private g = new Float32Array(0)
  private came = new Int32Array(0)
  private seen = new Uint32Array(0)
  private closed = new Uint32Array(0)
  private stamp = 0
  path(start: number, goal: number, maxSteps = 40000): number[] | null {
    const n = this.size
    if (this.g.length !== n) {
      this.g = new Float32Array(n)
      this.came = new Int32Array(n)
      this.seen = new Uint32Array(n)
      this.closed = new Uint32Array(n)
    }
    const s = ++this.stamp
    const { xs, ys, zs } = this
    const h = (a: number) => {
      const dx = Math.abs(xs[a] - xs[goal])
      const dz = Math.abs(zs[a] - zs[goal])
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz) + Math.abs(ys[a] - ys[goal]) * 0.5
    }
    // A binary heap of (node, f) pairs; a node may sit in it more than once (the stale copies are skipped)
    const heapNode: number[] = []
    const heapF: number[] = []
    const swap = (a: number, b: number) => {
      ;[heapNode[a], heapNode[b]] = [heapNode[b], heapNode[a]]
      ;[heapF[a], heapF[b]] = [heapF[b], heapF[a]]
    }
    const pushHeap = (node: number, f: number) => {
      heapNode.push(node)
      heapF.push(f)
      for (let i = heapNode.length - 1; i > 0; ) {
        const p = (i - 1) >> 1
        if (heapF[i] >= heapF[p]) break
        swap(i, p)
        i = p
      }
    }
    const popHeap = () => {
      const top = heapNode[0]
      const lastNode = heapNode.pop()!
      const lastF = heapF.pop()!
      if (heapNode.length) {
        heapNode[0] = lastNode
        heapF[0] = lastF
        for (let i = 0; ; ) {
          const l = i * 2 + 1
          const r = l + 1
          let m = i
          if (l < heapNode.length && heapF[l] < heapF[m]) m = l
          if (r < heapNode.length && heapF[r] < heapF[m]) m = r
          if (m === i) break
          swap(i, m)
          i = m
        }
      }
      return top
    }
    this.g[start] = 0
    this.seen[start] = s
    this.came[start] = -1
    pushHeap(start, h(start))
    for (let steps = 0; heapNode.length && steps < maxSteps; steps++) {
      const a = popHeap()
      if (a === goal) {
        const out: number[] = []
        for (let c = goal; c !== start; c = this.came[c]) out.push(c)
        return out.reverse()
      }
      if (this.closed[a] === s) continue
      this.closed[a] = s
      for (const { to, cost } of this.links[a]) {
        if (this.closed[to] === s) continue
        const g = this.g[a] + cost
        if (this.seen[to] === s && g >= this.g[to]) continue
        this.seen[to] = s
        this.g[to] = g
        this.came[to] = a
        pushHeap(to, g + h(to))
      }
    }
    return null
  }

  // Which link goes from a to b (or null)
  link(a: number, b: number) {
    return this.links[a].find((l) => l.to === b) ?? null
  }
}

// Builds the grid a slice at a time (call step() once a frame until it returns the grid). `starts`: points
// the bots start from, so goals are only places they can actually get to.
export function navBuilder({ world, rapier }: Physics, bounds: NavBounds, starts: [number, number, number][]) {
  const nav = new NavGrid(bounds)
  const flags = rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC | rapier.QueryFilterFlags.EXCLUDE_SENSORS
  const down = new rapier.Ray({ x: 0, y: TOP, z: 0 }, { x: 0, y: -1, z: 0 })
  const up = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
  const across = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })

  // Nothing solid between two points at this height
  const clear = (ax: number, az: number, bx: number, bz: number, y: number) => {
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    across.origin = { x: ax, y, z: az }
    across.dir = { x: dx / len, y: 0, z: dz / len }
    return !world.castRay(across, len, true, flags)
  }

  function* work(): Generator<void, NavGrid> {
    // 1. Surfaces with headroom, cell by cell
    const tops: number[] = []
    for (let j = 0; j < nav.nz; j++) {
      for (let i = 0; i < nav.nx; i++) {
        const x = nav.x0 + (i + 0.5) * CELL
        const z = nav.z0 + (j + 0.5) * CELL
        if (!bounds.inside(x, z)) continue
        tops.length = 0
        down.origin = { x, y: TOP, z }
        world.intersectionsWithRay(
          down,
          TOP + 6,
          true,
          (hit) => {
            if (hit.normal.y > 0.6) tops.push(TOP - hit.timeOfImpact)
            return true
          },
          flags,
        )
        tops.sort((a, b) => b - a)
        let above = Infinity
        for (const y of tops) {
          if (y < -4 || above - y < 0.3) continue
          above = y
          up.origin = { x, y: y + 0.05, z }
          if (world.castRay(up, HEADROOM, true, flags)) continue
          nav.add(i + j * nav.nx, x, y, z)
        }
      }
      yield
    }

    // 2. Links to the neighbouring cells (each pair once: four directions, both ways)
    const DIRS = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]
    const walks = new Uint8Array(nav.size)
    for (let a = 0; a < nav.size; a++) {
      const cell = nav.cellOf[a]
      const ci = cell % nav.nx
      const cj = Math.floor(cell / nav.nx)
      for (const [di, dj] of DIRS) {
        for (const b of nav.inCell(ci + di, cj + dj)) {
          const dy = nav.ys[b] - nav.ys[a]
          const rise = Math.abs(dy)
          if (rise > DROP) continue
          const top = Math.max(nav.ys[a], nav.ys[b])
          if (!clear(nav.xs[a], nav.zs[a], nav.xs[b], nav.zs[b], top + 0.45)) continue
          if (!clear(nav.xs[a], nav.zs[a], nav.xs[b], nav.zs[b], top + 1.3)) continue
          const dist = Math.hypot(nav.xs[b] - nav.xs[a], nav.zs[b] - nav.zs[a])
          if (rise <= STEP) {
            nav.links[a].push({ to: b, kind: 'walk', cost: dist })
            nav.links[b].push({ to: a, kind: 'walk', cost: dist })
            walks[a]++
            walks[b]++
          } else {
            const [high, low] = dy > 0 ? [b, a] : [a, b]
            nav.links[high].push({ to: low, kind: 'drop', cost: dist + 0.6 + rise * 0.3 })
            if (rise <= JUMP) nav.links[low].push({ to: high, kind: 'jump', cost: dist + 1.5 })
          }
        }
      }
      if (a % 300 === 299) yield
    }
    // Hemmed in (fewer than all eight ways open): walking along here costs more
    for (let a = 0; a < nav.size; a++) {
      nav.crowded[a] = walks[a] < 8
      if (nav.crowded[a]) for (const l of nav.links[a]) if (l.kind === 'walk') l.cost *= 1.6
    }

    // 3. Everywhere the starts can reach
    const reached = new Uint8Array(nav.size)
    const queue: number[] = []
    for (const [x, y, z] of starts) {
      const n = nav.nearest(x, y, z, 4)
      if (n >= 0 && !reached[n]) {
        reached[n] = 1
        queue.push(n)
      }
    }
    for (let q = 0; q < queue.length; q++) {
      for (const { to } of nav.links[queue[q]]) {
        if (reached[to]) continue
        reached[to] = 1
        queue.push(to)
      }
    }
    for (let a = 0; a < nav.size; a++) if (reached[a] && !nav.crowded[a]) nav.goals.push(a)
    return nav
  }

  const it = work()
  return {
    // Some more of the work; the finished grid once it's done
    step(): NavGrid | null {
      const until = performance.now() + SLICE
      while (performance.now() < until) {
        const r = it.next()
        if (r.done) return r.value
      }
      return null
    },
  }
}

// The box round an outline, and whether a point is inside it
export function outlineBounds(outline: [number, number][], margin = 1): NavBounds {
  const xs = outline.map((p) => p[0])
  const zs = outline.map((p) => p[1])
  const inside = (x: number, z: number) => {
    let hit = false
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, zi] = outline[i]
      const [xj, zj] = outline[j]
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
    }
    return hit
  }
  return { x0: Math.min(...xs) - margin, x1: Math.max(...xs) + margin, z0: Math.min(...zs) - margin, z1: Math.max(...zs) + margin, inside }
}
