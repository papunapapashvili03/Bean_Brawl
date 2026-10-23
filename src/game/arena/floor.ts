import * as THREE from 'three'
import { OUTLINE, TEAM_COLOURS } from './layout'

// The island's floor, painted once onto a canvas spanning it: each base in its team's pale colour, a mint
// middle with a centre ring and halfway line, a faint grid, and candy stripes round the rim. Canvas x is
// world x, canvas y is world z (not flipped).

const PX = 20 // pixels per metre
const xs = OUTLINE.map((p) => p[0])
const zs = OUTLINE.map((p) => p[1])
export const BOUNDS = { x0: Math.min(...xs) - 1, x1: Math.max(...xs) + 1, z0: Math.min(...zs) - 1, z1: Math.max(...zs) + 1 }
const W = BOUNDS.x1 - BOUNDS.x0
const H = BOUNDS.z1 - BOUNDS.z0
const cx = (x: number) => (x - BOUNDS.x0) * PX
const cz = (z: number) => (z - BOUNDS.z0) * PX

const pale = (c: string, k: number) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString()

function draw() {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(W * PX)
  canvas.height = Math.ceil(H * PX)
  const g = canvas.getContext('2d')!
  const outline = () => {
    g.beginPath()
    OUTLINE.forEach(([x, z], i) => (i ? g.lineTo(cx(x), cz(z)) : g.moveTo(cx(x), cz(z))))
    g.closePath()
  }
  outline()
  g.save()
  g.clip()

  // Bases and the middle, blending into each other
  const grad = g.createLinearGradient(0, cz(-38), 0, cz(38))
  grad.addColorStop(0, pale(TEAM_COLOURS.south, 0.62))
  grad.addColorStop(0.22, pale(TEAM_COLOURS.south, 0.72))
  grad.addColorStop(0.36, '#d6f6e7')
  grad.addColorStop(0.64, '#d6f6e7')
  grad.addColorStop(0.78, pale(TEAM_COLOURS.north, 0.72))
  grad.addColorStop(1, pale(TEAM_COLOURS.north, 0.62))
  g.fillStyle = grad
  g.fillRect(0, 0, canvas.width, canvas.height)

  // Grid
  g.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  g.lineWidth = 2
  for (let m = Math.ceil(BOUNDS.x0 / 2) * 2; m < BOUNDS.x1; m += 2) {
    g.beginPath()
    g.moveTo(cx(m), 0)
    g.lineTo(cx(m), canvas.height)
    g.stroke()
  }
  for (let m = Math.ceil(BOUNDS.z0 / 2) * 2; m < BOUNDS.z1; m += 2) {
    g.beginPath()
    g.moveTo(0, cz(m))
    g.lineTo(canvas.width, cz(m))
    g.stroke()
  }

  // Centre ring and halfway line
  g.strokeStyle = '#ffffff'
  g.lineWidth = 0.35 * PX
  g.beginPath()
  g.arc(cx(0), cz(0), 5 * PX, 0, Math.PI * 2)
  g.stroke()
  g.setLineDash([1.2 * PX, 0.8 * PX])
  g.beginPath()
  g.moveTo(0, cz(0))
  g.lineTo(canvas.width, cz(0))
  g.stroke()
  g.setLineDash([])

  // Base lines: where each team's ground starts
  for (const [z, colour] of [
    [18, TEAM_COLOURS.north],
    [-18, TEAM_COLOURS.south],
  ] as const) {
    g.strokeStyle = colour
    g.lineWidth = 0.3 * PX
    g.beginPath()
    g.moveTo(0, cz(z))
    g.lineTo(canvas.width, cz(z))
    g.stroke()
  }
  g.restore()

  // Candy stripes round the rim
  const colours = ['#ff5a5f', '#ffd23f', '#4dd4ac', '#3fa9f5', '#9b7bff', '#ff8fc8']
  g.lineWidth = 0.7 * PX
  g.lineJoin = 'round'
  let along = 0
  for (let i = 0; i < OUTLINE.length; i++) {
    const [x0, z0] = OUTLINE[i]
    const [x1, z1] = OUTLINE[(i + 1) % OUTLINE.length]
    g.strokeStyle = colours[Math.floor(along / 1.6) % colours.length]
    g.beginPath()
    g.moveTo(cx(x0), cz(z0))
    g.lineTo(cx(x1), cz(z1))
    g.stroke()
    along += Math.hypot(x1 - x0, z1 - z0)
  }
  return canvas
}

let texture: THREE.CanvasTexture | null = null
export function floorMap() {
  if (!texture) {
    texture = new THREE.CanvasTexture(draw())
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false
    texture.anisotropy = 8
  }
  return texture
}
export const floorUV = (x: number, z: number): [number, number] => [(x - BOUNDS.x0) / W, (z - BOUNDS.z0) / H]
