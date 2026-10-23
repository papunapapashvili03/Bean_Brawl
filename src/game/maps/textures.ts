import * as THREE from 'three'

// The gunfight maps' surfaces, drawn on canvases: weathered concrete, white stucco, brick, timber cladding, asphalt,
// stone paving, gravel, grass, roofing. Grounded colours, stains and wear: it should read as a real place.
// Every material expects texture coordinates in metres (see worldUV in ./kit) and repeats once per `tile`.

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

type Paint = (g: CanvasRenderingContext2D, size: number, rand: () => number) => void

function canvasTexture(size: number, seed: number, paint: Paint) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  paint(g, size, seeded(seed))
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

// Speckles and blotches over a base colour
function grain(g: CanvasRenderingContext2D, size: number, rand: () => number, dark: string, light: string, count: number, blot = 0) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = rand() < 0.5 ? dark : light
    const s = 1 + rand() * 2
    g.fillRect(rand() * size, rand() * size, s, s)
  }
  for (let i = 0; i < blot; i++) {
    const r = size * (0.05 + rand() * 0.15)
    const x = rand() * size
    const y = rand() * size
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, rand() < 0.6 ? 'rgba(40, 36, 30, 0.12)' : 'rgba(255, 255, 250, 0.1)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
}
// Streaks of grime running down from the top
function streaks(g: CanvasRenderingContext2D, size: number, rand: () => number, n: number, alpha = 0.08) {
  for (let i = 0; i < n; i++) {
    const x = rand() * size
    const w = 2 + rand() * 8
    const h = size * (0.2 + rand() * 0.6)
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, `rgba(50, 45, 38, ${alpha})`)
    grad.addColorStop(1, 'rgba(50, 45, 38, 0)')
    g.fillStyle = grad
    g.fillRect(x, 0, w, h)
  }
}

const concrete: Paint = (g, size, rand) => {
  g.fillStyle = '#b3b0a8'
  g.fillRect(0, 0, size, size)
  grain(g, size, rand, 'rgba(70, 66, 60, 0.18)', 'rgba(255, 255, 250, 0.14)', size * 30, 14)
  // Formwork: panel joints and tie holes
  g.strokeStyle = 'rgba(80, 76, 70, 0.35)'
  g.lineWidth = 2
  g.strokeRect(1, 1, size - 2, size / 2 - 2)
  g.strokeRect(1, size / 2 + 1, size - 2, size / 2 - 2)
  g.fillStyle = 'rgba(60, 56, 50, 0.45)'
  for (const x of [0.25, 0.75]) for (const y of [0.25, 0.75]) {
    g.beginPath()
    g.arc(x * size, y * size, 3, 0, Math.PI * 2)
    g.fill()
  }
  streaks(g, size, rand, 10)
}
const concreteDark: Paint = (g, size, rand) => {
  g.fillStyle = '#7d7b76'
  g.fillRect(0, 0, size, size)
  grain(g, size, rand, 'rgba(40, 38, 34, 0.25)', 'rgba(200, 200, 195, 0.12)', size * 30, 12)
  streaks(g, size, rand, 8, 0.12)
}
const stucco: Paint = (g, size, rand) => {
  g.fillStyle = '#e4ddd0'
  g.fillRect(0, 0, size, size)
  grain(g, size, rand, 'rgba(120, 110, 95, 0.12)', 'rgba(255, 255, 255, 0.2)', size * 40, 10)
  streaks(g, size, rand, 6, 0.06)
}
const brick: Paint = (g, size, rand) => {
  g.fillStyle = '#a79b88'
  g.fillRect(0, 0, size, size)
  const rows = 16
  const cols = 4
  const bh = size / rows
  const bw = size / cols
  const tones = ['#7c4a36', '#8a5540', '#6f4232', '#94604a', '#7a5140', '#65402f']
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0
    for (let c = -1; c <= cols; c++) {
      g.fillStyle = tones[Math.floor(rand() * tones.length)]
      g.fillRect(c * bw + off + 1.5, r * bh + 1.5, bw - 3, bh - 3)
    }
  }
  grain(g, size, rand, 'rgba(30, 20, 15, 0.2)', 'rgba(220, 200, 180, 0.1)', size * 20, 8)
  streaks(g, size, rand, 6, 0.1)
}
const wood: Paint = (g, size, rand) => {
  const planks = 8
  const ph = size / planks
  for (let i = 0; i < planks; i++) {
    const tone = 70 + rand() * 25
    g.fillStyle = `rgb(${tone + 30}, ${tone}, ${tone - 20})`
    g.fillRect(0, i * ph, size, ph)
    g.strokeStyle = 'rgba(30, 20, 12, 0.18)'
    for (let k = 0; k < 6; k++) {
      g.beginPath()
      const y = i * ph + rand() * ph
      g.moveTo(0, y)
      g.bezierCurveTo(size / 3, y + (rand() - 0.5) * 6, (size * 2) / 3, y + (rand() - 0.5) * 6, size, y)
      g.stroke()
    }
    g.fillStyle = 'rgba(20, 12, 8, 0.6)'
    g.fillRect(0, i * ph, size, 2)
  }
}
const asphalt: Paint = (g, size, rand) => {
  g.fillStyle = '#44464a'
  g.fillRect(0, 0, size, size)
  grain(g, size, rand, 'rgba(20, 20, 22, 0.35)', 'rgba(170, 170, 165, 0.25)', size * 60, 16)
  g.strokeStyle = 'rgba(25, 25, 27, 0.6)'
  g.lineWidth = 1.5
  for (let i = 0; i < 4; i++) {
    let x = rand() * size
    let y = rand() * size
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 12; k++) {
      x += (rand() - 0.5) * 30
      y += (rand() - 0.5) * 30
      g.lineTo(x, y)
    }
    g.stroke()
  }
}
const paving: Paint = (g, size, rand) => {
  g.fillStyle = '#8f8a80'
  g.fillRect(0, 0, size, size)
  const n = 4
  const t = size / n
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const tone = 160 + rand() * 25
      g.fillStyle = `rgb(${tone}, ${tone - 4}, ${tone - 12})`
      g.fillRect(c * t + 2, r * t + 2, t - 4, t - 4)
    }
  }
  grain(g, size, rand, 'rgba(60, 55, 48, 0.16)', 'rgba(255, 255, 250, 0.12)', size * 25, 12)
}
const gravel: Paint = (g, size, rand) => {
  g.fillStyle = '#9a9285'
  g.fillRect(0, 0, size, size)
  for (let i = 0; i < size * 12; i++) {
    const tone = 110 + rand() * 110
    g.fillStyle = `rgb(${tone}, ${tone - 6}, ${tone - 16})`
    g.beginPath()
    g.arc(rand() * size, rand() * size, 1 + rand() * 2.2, 0, Math.PI * 2)
    g.fill()
  }
}
const grass: Paint = (g, size, rand) => {
  g.fillStyle = '#5f7338'
  g.fillRect(0, 0, size, size)
  for (let i = 0; i < size * 40; i++) {
    const tone = rand()
    g.fillStyle = tone < 0.4 ? 'rgba(40, 60, 20, 0.5)' : tone < 0.8 ? 'rgba(120, 140, 70, 0.45)' : 'rgba(150, 130, 80, 0.35)'
    g.fillRect(rand() * size, rand() * size, 1, 2 + rand() * 3)
  }
  grain(g, size, rand, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 0, 10)
}
const roofTile: Paint = (g, size, rand) => {
  g.fillStyle = '#3b3836'
  g.fillRect(0, 0, size, size)
  const rows = 10
  const rh = size / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 8; c++) {
      const tone = 55 + rand() * 25
      g.fillStyle = `rgb(${tone + 6}, ${tone}, ${tone - 4})`
      const off = r % 2 ? size / 16 : 0
      g.fillRect(c * (size / 8) + off + 1, r * rh + 1, size / 8 - 2, rh - 2)
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.fillRect(0, r * rh + rh - 3, size, 3)
  }
}
const roofGravel: Paint = (g, size, rand) => {
  g.fillStyle = '#8c8578'
  g.fillRect(0, 0, size, size)
  for (let i = 0; i < size * 10; i++) {
    const tone = 100 + rand() * 90
    g.fillStyle = `rgb(${tone}, ${tone - 5}, ${tone - 14})`
    g.fillRect(rand() * size, rand() * size, 2, 2)
  }
}
const metal: Paint = (g, size, rand) => {
  g.fillStyle = '#5d6166'
  g.fillRect(0, 0, size, size)
  for (let x = 0; x < size; x += size / 8) {
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(x, 0, 3, size)
  }
  grain(g, size, rand, 'rgba(30,30,30,0.2)', 'rgba(200,200,200,0.1)', size * 10, 6)
  streaks(g, size, rand, 10, 0.18)
}
const stone: Paint = (g, size, rand) => {
  g.fillStyle = '#9d968a'
  g.fillRect(0, 0, size, size)
  const rows = 5
  const rh = size / rows
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.6 : 0
    while (x < size) {
      const w = rh * (1 + rand() * 1.2)
      const tone = 140 + rand() * 40
      g.fillStyle = `rgb(${tone}, ${tone - 5}, ${tone - 14})`
      g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4)
      x += w
    }
  }
  grain(g, size, rand, 'rgba(50,45,40,0.2)', 'rgba(255,255,250,0.1)', size * 20, 10)
}

// Suburb: a yellow stucco house, a teal one in lap siding, orange-stained decks, fences of upright boards,
// shingle roofs, dry desert grass and dirt
const stuccoYellow: Paint = (g, size, rand) => {
  g.fillStyle = '#e0b24e'
  g.fillRect(0, 0, size, size)
  grain(g, size, rand, 'rgba(120, 80, 20, 0.14)', 'rgba(255, 245, 210, 0.22)', size * 40, 10)
  streaks(g, size, rand, 6, 0.07)
}
// Overlapping horizontal boards, each with a shadow along its lower edge
const siding: Paint = (g, size, rand) => {
  const boards = 12
  const bh = size / boards
  for (let i = 0; i < boards; i++) {
    const tone = rand() * 12
    g.fillStyle = `rgb(${70 + tone}, ${148 + tone}, ${140 + tone})`
    g.fillRect(0, i * bh, size, bh)
    const grad = g.createLinearGradient(0, i * bh, 0, (i + 1) * bh)
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.14)')
    grad.addColorStop(0.75, 'rgba(0, 0, 0, 0)')
    grad.addColorStop(1, 'rgba(10, 30, 30, 0.4)')
    g.fillStyle = grad
    g.fillRect(0, i * bh, size, bh)
  }
  grain(g, size, rand, 'rgba(20, 40, 40, 0.12)', 'rgba(255, 255, 255, 0.1)', size * 16, 6)
  streaks(g, size, rand, 5, 0.06)
}
// Planks of orange-stained timber
const deckWood: Paint = (g, size, rand) => {
  const planks = 8
  const ph = size / planks
  for (let i = 0; i < planks; i++) {
    const tone = rand() * 28
    g.fillStyle = `rgb(${196 + tone * 0.6}, ${104 + tone * 0.5}, ${48 + tone * 0.3})`
    g.fillRect(0, i * ph, size, ph)
    g.strokeStyle = 'rgba(90, 40, 10, 0.2)'
    for (let k = 0; k < 5; k++) {
      g.beginPath()
      const y = i * ph + rand() * ph
      g.moveTo(0, y)
      g.bezierCurveTo(size / 3, y + (rand() - 0.5) * 6, (size * 2) / 3, y + (rand() - 0.5) * 6, size, y)
      g.stroke()
    }
    g.fillStyle = 'rgba(60, 25, 8, 0.55)'
    g.fillRect(0, i * ph, size, 2)
  }
}
// Weathered fence boards standing upright, with gaps between
const fence: Paint = (g, size, rand) => {
  g.fillStyle = '#3d3125'
  g.fillRect(0, 0, size, size)
  const boards = 8
  const bw = size / boards
  for (let i = 0; i < boards; i++) {
    const tone = 120 + rand() * 30
    g.fillStyle = `rgb(${tone}, ${tone * 0.86}, ${tone * 0.68})`
    g.fillRect(i * bw + 1.5, 0, bw - 3, size)
    g.strokeStyle = 'rgba(60, 45, 30, 0.25)'
    for (let k = 0; k < 4; k++) {
      const x = i * bw + 3 + rand() * (bw - 6)
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + (rand() - 0.5) * 4, size)
      g.stroke()
    }
  }
  grain(g, size, rand, 'rgba(40, 30, 20, 0.2)', 'rgba(255, 240, 220, 0.1)', size * 12, 6)
}
const shingle: Paint = (g, size, rand) => {
  g.fillStyle = '#4a4440'
  g.fillRect(0, 0, size, size)
  const rows = 12
  const rh = size / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 6; c++) {
      const tone = 68 + rand() * 26
      g.fillStyle = `rgb(${tone + 8}, ${tone}, ${tone - 6})`
      const off = r % 2 ? size / 12 : 0
      g.fillRect(c * (size / 6) + off + 1, r * rh + 1, size / 6 - 2, rh - 2)
    }
    g.fillStyle = 'rgba(0, 0, 0, 0.3)'
    g.fillRect(0, r * rh + rh - 2, size, 2)
  }
  grain(g, size, rand, 'rgba(0, 0, 0, 0.15)', 'rgba(255, 255, 255, 0.06)', size * 20, 0)
}
const dryGrass: Paint = (g, size, rand) => {
  g.fillStyle = '#8c8650'
  g.fillRect(0, 0, size, size)
  for (let i = 0; i < size * 40; i++) {
    const tone = rand()
    g.fillStyle = tone < 0.35 ? 'rgba(90, 90, 40, 0.5)' : tone < 0.75 ? 'rgba(170, 160, 95, 0.45)' : 'rgba(190, 165, 110, 0.4)'
    g.fillRect(rand() * size, rand() * size, 1, 2 + rand() * 3)
  }
  grain(g, size, rand, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 0, 12)
}
const dirt: Paint = (g, size, rand) => {
  g.fillStyle = '#b39a70'
  g.fillRect(0, 0, size, size)
  grain(g, size, rand, 'rgba(110, 85, 55, 0.3)', 'rgba(230, 215, 180, 0.25)', size * 50, 16)
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(120, 105, 85, 0.6)'
    const r = 1 + rand() * 2.5
    g.beginPath()
    g.arc(rand() * size, rand() * size, r, 0, Math.PI * 2)
    g.fill()
  }
}

type Look = { paint?: Paint; seed?: number; size?: number; tile?: number; color?: string; roughness?: number; metalness?: number; extra?: THREE.MeshStandardMaterialParameters }
const LOOKS = {
  concrete: { paint: concrete, seed: 3, tile: 2.4 },
  concreteDark: { paint: concreteDark, seed: 5, tile: 2 },
  stucco: { paint: stucco, seed: 7, tile: 3 },
  brick: { paint: brick, seed: 9, tile: 1.6 },
  wood: { paint: wood, seed: 11, tile: 1.6 },
  asphalt: { paint: asphalt, seed: 13, tile: 4 },
  paving: { paint: paving, seed: 15, tile: 2.4 },
  gravel: { paint: gravel, seed: 17, tile: 1.5 },
  grass: { paint: grass, seed: 19, tile: 3 },
  roofTile: { paint: roofTile, seed: 21, tile: 2 },
  roofGravel: { paint: roofGravel, seed: 23, tile: 2 },
  metal: { paint: metal, seed: 25, tile: 1.5, metalness: 0.4, roughness: 0.6 },
  stone: { paint: stone, seed: 27, tile: 1.8 },
  frame: { color: '#d9d6cf', roughness: 0.6 },
  darkFrame: { color: '#2e2f31', roughness: 0.5 },
  glass: { color: '#2a3a44', roughness: 0.08, metalness: 0.6 },
  redSteel: { color: '#7a2a1c', roughness: 0.75, metalness: 0.3 },
  water: { color: '#3f7f8f', roughness: 0.05, metalness: 0.2, extra: { transparent: true, opacity: 0.85 } },
  hedge: { color: '#3f5a2a', roughness: 1 },
  fabric: { color: '#5f646b', roughness: 1 },
  wire: { color: '#1e1e20', roughness: 0.8 },
  lamp: { color: '#fff2c8', extra: { emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 0.4 } },
  stuccoYellow: { paint: stuccoYellow, seed: 29, tile: 3 },
  siding: { paint: siding, seed: 31, tile: 2.4 },
  deckWood: { paint: deckWood, seed: 33, tile: 1.6 },
  fence: { paint: fence, seed: 35, tile: 1.6 },
  shingle: { paint: shingle, seed: 37, tile: 2 },
  dryGrass: { paint: dryGrass, seed: 39, tile: 3 },
  dirt: { paint: dirt, seed: 41, tile: 2.5 },
  trim: { color: '#efece4', roughness: 0.7 },
  // Flat paint: crushed cars, containers, planes, signs, a red barn
  paintRed: { color: '#b8352d', roughness: 0.7 },
  paintBlue: { color: '#2f62a8', roughness: 0.7 },
  paintYellow: { color: '#e0b22e', roughness: 0.7 },
  paintGreen: { color: '#4f8a3c', roughness: 0.7 },
  paintWhite: { color: '#ecebe6', roughness: 0.6 },
  rust: { color: '#8a4b2c', roughness: 0.95 },
  rubber: { color: '#232326', roughness: 0.95 },
} satisfies Record<string, Look>
export type MatKey = keyof typeof LOOKS

const materials = new Map<MatKey, THREE.MeshStandardMaterial>()
export function material(key: MatKey) {
  let m = materials.get(key)
  if (!m) {
    const look: Look = LOOKS[key]
    const params: THREE.MeshStandardMaterialParameters = {
      color: look.color ?? '#ffffff',
      roughness: look.roughness ?? 0.9,
      metalness: look.metalness ?? 0,
      ...look.extra,
    }
    if (look.paint) {
      const tex = canvasTexture(look.size ?? 256, look.seed ?? 1, look.paint)
      tex.repeat.set(1 / (look.tile ?? 2), 1 / (look.tile ?? 2))
      params.map = tex
    }
    m = new THREE.MeshStandardMaterial(params)
    materials.set(key, m)
  }
  return m
}
