import * as THREE from 'three'

// Flag patches for the military backpack, drawn on a canvas (3:2) so there are no image assets to load.

export const FLAGS = {
  uk: 'UK',
  georgia: 'Georgia',
  italy: 'Italy',
  germany: 'Germany',
  usa: 'USA',
  india: 'India',
  france: 'France',
  spain: 'Spain',
  japan: 'Japan',
  ukraine: 'Ukraine',
  canada: 'Canada',
  brazil: 'Brazil',
  turkey: 'Turkey',
  china: 'China',
  belgium: 'Belgium',
  monaco: 'Monaco',
  poland: 'Poland',
  bulgaria: 'Bulgaria',
  albania: 'Albania',
  greece: 'Greece',
  portugal: 'Portugal',
  australia: 'Australia',
} as const
export type FlagId = keyof typeof FLAGS

const W = 300
const H = 200

function stripes(g: CanvasRenderingContext2D, colors: string[], vertical: boolean) {
  colors.forEach((c, i) => {
    g.fillStyle = c
    if (vertical) g.fillRect((i * W) / colors.length, 0, W / colors.length + 1, H)
    else g.fillRect(0, (i * H) / colors.length, W, H / colors.length + 1)
  })
}

// Horizontal bands of unequal height: each colour with its share
function bands(g: CanvasRenderingContext2D, parts: [string, number][]) {
  const total = parts.reduce((sum, [, n]) => sum + n, 0)
  let y = 0
  for (const [color, n] of parts) {
    g.fillStyle = color
    g.fillRect(0, y, W, (H * n) / total + 1)
    y += (H * n) / total
  }
}

// A centred cross of the given colour and bar width
function cross(g: CanvasRenderingContext2D, color: string, width: number, cx = W / 2, cy = H / 2, w = W, h = H) {
  g.fillStyle = color
  g.fillRect(cx - width / 2, cy - h / 2, width, h)
  g.fillRect(cx - w / 2, cy - width / 2, w, width)
}

// A filled star with `points` points, the first pointing along angle `rot` (default: straight up)
function star(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  points = 5,
  inner = 0.382,
  rot = -Math.PI / 2,
) {
  g.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 ? r * inner : r
    const a = rot + (i * Math.PI) / points
    if (i) g.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
    else g.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
  }
  g.closePath()
  g.fill()
}

// A symmetric emblem: the right half's outline from the top of the centre line down to the bottom,
// in units of `scale` around (cx, cy) with y down; the left half is its mirror image
function mirrored(g: CanvasRenderingContext2D, half: [number, number][], cx: number, cy: number, scale: number) {
  const outline = [...half, ...[...half].reverse().map(([x, y]): [number, number] => [-x, y])]
  g.beginPath()
  outline.forEach(([x, y], i) => {
    if (i) g.lineTo(cx + x * scale, cy + y * scale)
    else g.moveTo(cx + x * scale, cy + y * scale)
  })
  g.closePath()
  g.fill()
}

// The Union Jack, filling the rectangle (0, 0, w, h): the whole UK flag, or Australia's canton
function unionJack(g: CanvasRenderingContext2D, w = W, h = H) {
  g.save()
  g.scale(w / W, h / H)
  g.beginPath()
  g.rect(0, 0, W, H)
  g.clip()
  g.fillStyle = '#012169'
  g.fillRect(0, 0, W, H)
  g.lineCap = 'butt'
  // White saltire with the red saltire offset (counterchanged) inside it
  g.strokeStyle = '#ffffff'
  g.lineWidth = H * 0.2
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(W, H)
  g.moveTo(W, 0)
  g.lineTo(0, H)
  g.stroke()
  g.strokeStyle = '#c8102e'
  g.lineWidth = H * 0.067
  const o = H * 0.033
  g.beginPath()
  g.moveTo(0, -o)
  g.lineTo(W / 2, H / 2 - o)
  g.moveTo(W / 2, H / 2 + o)
  g.lineTo(W, H + o)
  g.moveTo(W, o)
  g.lineTo(W / 2, H / 2 + o)
  g.moveTo(W / 2, H / 2 - o)
  g.lineTo(0, H - o)
  g.stroke()
  cross(g, '#ffffff', H / 3)
  cross(g, '#c8102e', H / 5)
  g.restore()
}

const MAPLE_LEAF: [number, number][] = [
  [0, -1],
  [0.14, -0.74],
  [0.3, -0.82],
  [0.24, -0.34],
  [0.46, -0.6],
  [0.52, -0.46],
  [0.78, -0.52],
  [0.68, -0.26],
  [0.8, -0.2],
  [0.4, 0.12],
  [0.48, 0.3],
  [0.06, 0.22],
  [0.06, 0.62],
]

// The double-headed eagle, simplified: a head and beak on each side, spread feathered wings and a tail
const EAGLE: [number, number][] = [
  [0, -0.35],
  [0.06, -0.38],
  [0.12, -0.62],
  [0.2, -0.72],
  [0.3, -0.7],
  [0.36, -0.64],
  [0.26, -0.6],
  [0.2, -0.52],
  [0.16, -0.36],
  [0.3, -0.42],
  [0.52, -0.62],
  [0.8, -0.72],
  [0.74, -0.54],
  [0.86, -0.5],
  [0.74, -0.38],
  [0.84, -0.3],
  [0.7, -0.2],
  [0.78, -0.1],
  [0.6, -0.04],
  [0.64, 0.06],
  [0.44, 0.06],
  [0.22, 0.04],
  [0.26, 0.3],
  [0.16, 0.32],
  [0.18, 0.52],
  [0.08, 0.46],
  [0.06, 0.62],
  [0, 0.58],
]

const DRAW: Record<FlagId, (g: CanvasRenderingContext2D) => void> = {
  uk: (g) => unionJack(g),
  georgia: (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    cross(g, '#e8112d', H * 0.2)
    // A small cross (bolnur-katskhuri) in each quarter
    for (const [qx, qy] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ]) {
      const cx = W * qx
      const cy = H * qy
      cross(g, '#e8112d', H * 0.05, cx, cy, H * 0.2, H * 0.2)
      g.fillRect(cx - H * 0.05, cy - H * 0.1, H * 0.1, H * 0.035) // flared ends
      g.fillRect(cx - H * 0.05, cy + H * 0.065, H * 0.1, H * 0.035)
      g.fillRect(cx - H * 0.1, cy - H * 0.05, H * 0.035, H * 0.1)
      g.fillRect(cx + H * 0.065, cy - H * 0.05, H * 0.035, H * 0.1)
    }
  },
  italy: (g) => stripes(g, ['#009246', '#ffffff', '#ce2b37'], true),
  germany: (g) => stripes(g, ['#000000', '#dd0000', '#ffce00'], false),
  usa: (g) => {
    stripes(g, Array.from({ length: 13 }, (_, i) => (i % 2 ? '#ffffff' : '#b22234')), false)
    const cw = W * 0.4
    const ch = (H * 7) / 13
    g.fillStyle = '#3c3b6e'
    g.fillRect(0, 0, cw, ch)
    g.fillStyle = '#ffffff'
    for (let row = 0; row < 9; row++) {
      const n = row % 2 ? 5 : 6
      for (let i = 0; i < n; i++) {
        const x = (cw / 12) * (2 * i + 1 + (row % 2))
        const y = (ch / 10) * (row + 1)
        g.beginPath()
        g.arc(x, y, H * 0.018, 0, Math.PI * 2)
        g.fill()
      }
    }
  },
  india: (g) => {
    stripes(g, ['#ff9933', '#ffffff', '#138808'], false)
    // Ashoka Chakra: a navy wheel with 24 spokes
    const r = H * 0.13
    g.strokeStyle = '#000080'
    g.lineWidth = H * 0.018
    g.beginPath()
    g.arc(W / 2, H / 2, r, 0, Math.PI * 2)
    g.stroke()
    g.lineWidth = H * 0.008
    g.beginPath()
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      g.moveTo(W / 2, H / 2)
      g.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r)
    }
    g.stroke()
  },
  france: (g) => stripes(g, ['#002395', '#ffffff', '#ed2939'], true),
  // Red, yellow twice as tall, red (the civil flag, without the coat of arms)
  spain: (g) =>
    bands(g, [
      ['#aa151b', 1],
      ['#f1bf00', 2],
      ['#aa151b', 1],
    ]),
  japan: (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#bc002d'
    g.beginPath()
    g.arc(W / 2, H / 2, H * 0.3, 0, Math.PI * 2) // the disc is 3/5 of the height across
    g.fill()
  },
  ukraine: (g) => stripes(g, ['#0057b7', '#ffd700'], false),
  canada: (g) => {
    // Red, a white centre square half the width, red; the maple leaf in the middle
    g.fillStyle = '#d80621'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#ffffff'
    g.fillRect(W / 4, 0, W / 2, H)
    g.fillStyle = '#d80621'
    mirrored(g, MAPLE_LEAF, W / 2, H * 0.48, H * 0.38)
  },
  brazil: (g) => {
    g.fillStyle = '#009c3b'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#ffdf00'
    g.beginPath()
    g.moveTo(W * 0.085, H / 2)
    g.lineTo(W / 2, H * 0.12)
    g.lineTo(W * 0.915, H / 2)
    g.lineTo(W / 2, H * 0.88)
    g.closePath()
    g.fill()
    // Blue globe crossed by a white band, with a scatter of stars under it
    g.fillStyle = '#002776'
    g.beginPath()
    g.arc(W / 2, H / 2, H * 0.25, 0, Math.PI * 2)
    g.fill()
    g.save()
    g.clip()
    g.strokeStyle = '#ffffff'
    g.lineWidth = H * 0.045
    g.beginPath()
    g.arc(W * 0.45, H * 1.25, H * 0.78, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#ffffff'
    for (const [x, y] of [
      [0.46, 0.58],
      [0.52, 0.62],
      [0.56, 0.56],
      [0.5, 0.68],
      [0.43, 0.65],
      [0.58, 0.66],
      [0.54, 0.71],
    ]) {
      star(g, W * x, H * y, H * 0.018)
    }
    g.restore()
  },
  turkey: (g) => {
    g.fillStyle = '#e30a17'
    g.fillRect(0, 0, W, H)
    // White crescent: a white disc with a slightly smaller red disc offset into it
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(W * 0.37, H / 2, H * 0.25, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#e30a17'
    g.beginPath()
    g.arc(W * 0.4, H / 2, H * 0.2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    star(g, W * 0.54, H / 2, H * 0.125, 5, 0.382, Math.PI)
  },
  china: (g) => {
    g.fillStyle = '#de2910'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#ffde00'
    const u = W / 30
    const v = H / 20
    star(g, 5 * u, 5 * v, 3 * v)
    // Four small stars, each with a point aimed at the centre of the big one
    for (const [x, y] of [
      [10, 2],
      [12, 4],
      [12, 7],
      [10, 9],
    ]) {
      star(g, x * u, y * v, v, 5, 0.382, Math.atan2((5 - y) * v, (5 - x) * u))
    }
  },
  belgium: (g) => stripes(g, ['#000000', '#fdda24', '#ef3340'], true),
  monaco: (g) => stripes(g, ['#ce1126', '#ffffff'], false),
  poland: (g) => stripes(g, ['#ffffff', '#dc143c'], false),
  bulgaria: (g) => stripes(g, ['#ffffff', '#00966e', '#d62612'], false),
  albania: (g) => {
    g.fillStyle = '#e41e20'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#000000'
    mirrored(g, EAGLE, W / 2, H * 0.52, H * 0.46)
  },
  greece: (g) => {
    // Nine blue and white stripes; a blue canton five stripes tall with a white cross
    stripes(g, Array.from({ length: 9 }, (_, i) => (i % 2 ? '#ffffff' : '#0d5eaf')), false)
    const c = (H * 5) / 9
    g.fillStyle = '#0d5eaf'
    g.fillRect(0, 0, c, c)
    cross(g, '#ffffff', H / 9, c / 2, c / 2, c, c)
  },
  portugal: (g) => {
    g.fillStyle = '#046a38'
    g.fillRect(0, 0, W * 0.4, H)
    g.fillStyle = '#da291c'
    g.fillRect(W * 0.4, 0, W * 0.6, H)
    // Simplified arms on the dividing line: a yellow armillary sphere behind a shield
    const cx = W * 0.4
    const cy = H / 2
    g.strokeStyle = '#ffe900'
    g.lineWidth = H * 0.03
    g.beginPath()
    g.arc(cx, cy, H * 0.2, 0, Math.PI * 2)
    g.stroke()
    g.lineWidth = H * 0.02
    g.beginPath()
    g.ellipse(cx, cy, H * 0.2, H * 0.07, 0, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#ffffff'
    g.strokeStyle = '#da291c'
    g.lineWidth = H * 0.03
    g.beginPath()
    g.moveTo(cx - H * 0.1, cy - H * 0.12)
    g.lineTo(cx + H * 0.1, cy - H * 0.12)
    g.lineTo(cx + H * 0.1, cy + H * 0.03)
    g.quadraticCurveTo(cx + H * 0.1, cy + H * 0.13, cx, cy + H * 0.14)
    g.quadraticCurveTo(cx - H * 0.1, cy + H * 0.13, cx - H * 0.1, cy + H * 0.03)
    g.closePath()
    g.fill()
    g.stroke()
    g.fillStyle = '#002d72'
    for (const [dx, dy] of [
      [0, -0.06],
      [-0.05, 0],
      [0, 0],
      [0.05, 0],
      [0, 0.06],
    ]) {
      g.fillRect(cx + dx * H - H * 0.018, cy + dy * H - H * 0.02, H * 0.036, H * 0.04)
    }
  },
  australia: (g) => {
    g.fillStyle = '#012169'
    g.fillRect(0, 0, W, H)
    unionJack(g, W / 2, H / 2)
    g.fillStyle = '#ffffff'
    star(g, W / 4, H * 0.75, H * 0.15, 7, 0.45) // Commonwealth Star
    // Southern Cross
    for (const [x, y] of [
      [0.75, 0.16],
      [0.62, 0.43],
      [0.87, 0.36],
      [0.75, 0.8],
    ]) {
      star(g, W * x, H * y, H * 0.065, 7, 0.45)
    }
    star(g, W * 0.81, H * 0.55, H * 0.035)
  },
}

const cache = new Map<FlagId, THREE.CanvasTexture>()

export function flagTexture(id: FlagId) {
  let tex = cache.get(id)
  if (!tex) {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    DRAW[id](canvas.getContext('2d')!)
    tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    cache.set(id, tex)
  }
  return tex
}
