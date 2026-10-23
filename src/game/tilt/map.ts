import * as THREE from 'three'
import { ISLAND, RADIUS, ROAD, SIDEWALK } from './course'

// The town seen from above, painted once onto a canvas that spans the whole disc: pale paving, two crossing
// streets meeting at a roundabout round a grassy island, zebra crossings, lane markings, flower beds in the
// corners, and a red-and-white hazard band round the rim. Tiles map it by their position (x, z) on the disc.

const SIZE = 2048
const PX = SIZE / (RADIUS * 2) // pixels per metre
const px = (m: number) => (m + RADIUS) * PX

function draw() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const g = canvas.getContext('2d')!
  const circle = (r: number) => {
    g.beginPath()
    g.arc(px(0), px(0), r * PX, 0, Math.PI * 2)
  }
  const rect = (x0: number, z0: number, x1: number, z1: number) => g.fillRect(px(x0), px(z0), (x1 - x0) * PX, (z1 - z0) * PX)

  // Paving, with a faint grid of slabs
  g.fillStyle = '#e7dcc6'
  g.fillRect(0, 0, SIZE, SIZE)
  g.strokeStyle = 'rgba(150, 130, 100, 0.25)'
  g.lineWidth = 2
  for (let m = -RADIUS; m <= RADIUS; m += 1.5) {
    g.beginPath()
    g.moveTo(px(m), 0)
    g.lineTo(px(m), SIZE)
    g.moveTo(0, px(m))
    g.lineTo(SIZE, px(m))
    g.stroke()
  }

  // Flower beds in the four corners of town
  const beds = [
    [13, 17],
    [-13, 17],
    [-17, -13],
    [17, -13],
  ]
  for (const [x, z] of beds) {
    g.fillStyle = '#7cc46a'
    g.beginPath()
    g.ellipse(px(x), px(z), 2.6 * PX, 1.6 * PX, Math.atan2(z, x) + Math.PI / 2, 0, Math.PI * 2)
    g.fill()
    for (let i = 0; i < 26; i++) {
      g.fillStyle = ['#ff6fa3', '#ffd23f', '#ffffff', '#b07cff'][i % 4]
      g.beginPath()
      g.arc(px(x + (Math.sin(i * 12.9) * 2)), px(z + Math.cos(i * 7.3) * 1.1), 5, 0, Math.PI * 2)
      g.fill()
    }
  }

  // Kerbs and asphalt: the streets, and the roundabout
  const kerb = 0.25
  g.fillStyle = '#b9b3a6'
  rect(-RADIUS, -ROAD - kerb, RADIUS, ROAD + kerb)
  rect(-ROAD - kerb, -RADIUS, ROAD + kerb, RADIUS)
  circle(6.5 + kerb)
  g.fill()
  g.fillStyle = '#4a4e57'
  rect(-RADIUS, -ROAD, RADIUS, ROAD)
  rect(-ROAD, -RADIUS, ROAD, RADIUS)
  circle(6.5)
  g.fill()

  // Lane markings: dashed centre lines up each street, a dashed ring round the roundabout
  g.strokeStyle = '#f4f1e8'
  g.lineWidth = 0.14 * PX
  g.setLineDash([1.6 * PX, 1.2 * PX])
  g.beginPath()
  g.moveTo(px(7.5), px(0))
  g.lineTo(px(RADIUS), px(0))
  g.moveTo(px(-7.5), px(0))
  g.lineTo(px(-RADIUS), px(0))
  g.moveTo(px(0), px(7.5))
  g.lineTo(px(0), px(RADIUS))
  g.moveTo(px(0), px(-7.5))
  g.lineTo(px(0), px(-RADIUS))
  g.stroke()
  g.beginPath()
  g.arc(px(0), px(0), 4.8 * PX, 0, Math.PI * 2)
  g.stroke()
  g.setLineDash([])

  // Zebra crossings on each street, just out from the roundabout
  g.fillStyle = '#f4f1e8'
  for (let k = 0; k < 4; k++) {
    for (let s = -ROAD + 0.3; s < ROAD - 0.2; s += 0.9) {
      const [x0, z0, x1, z1] = [8, s, 9.8, s + 0.5]
      if (k === 0) rect(x0, z0, x1, z1)
      if (k === 1) rect(-x1, z0, -x0, z1)
      if (k === 2) rect(z0, x0, z1, x1)
      if (k === 3) rect(z0, -x1, z1, -x0)
    }
  }

  // The roundabout's grassy island
  g.fillStyle = '#b9b3a6'
  circle(ISLAND + 0.2)
  g.fill()
  g.fillStyle = '#6fbf5c'
  circle(ISLAND)
  g.fill()

  // Pavement edges along the streets (a darker line where the sidewalk ends)
  g.strokeStyle = 'rgba(120, 110, 95, 0.5)'
  g.lineWidth = 3
  const w = ROAD + SIDEWALK
  for (const s of [-1, 1]) {
    g.beginPath()
    g.moveTo(px(-RADIUS), px(s * w))
    g.lineTo(px(RADIUS), px(s * w))
    g.moveTo(px(s * w), px(-RADIUS))
    g.lineTo(px(s * w), px(RADIUS))
    g.stroke()
  }

  // Hazard band round the rim
  const segs = 64
  for (let i = 0; i < segs; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#e23b4e'
    g.beginPath()
    g.arc(px(0), px(0), RADIUS * PX, (i / segs) * Math.PI * 2, ((i + 1) / segs) * Math.PI * 2)
    g.arc(px(0), px(0), (RADIUS - 0.6) * PX, ((i + 1) / segs) * Math.PI * 2, (i / segs) * Math.PI * 2, true)
    g.closePath()
    g.fill()
  }
  return canvas
}

let texture: THREE.CanvasTexture | null = null
// The map (made on first use). Canvas y is world z; not flipped, so v = (z + R) / 2R.
export function townMap() {
  if (!texture) {
    texture = new THREE.CanvasTexture(draw())
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false
    texture.anisotropy = 8
  }
  return texture
}

// Texture coordinates for a point (x, z) on the disc
export const mapUV = (x: number, z: number): [number, number] => [(x + RADIUS) / (RADIUS * 2), (z + RADIUS) / (RADIUS * 2)]
