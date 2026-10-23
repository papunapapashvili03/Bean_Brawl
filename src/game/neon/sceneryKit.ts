import * as THREE from 'three'

// The neon city's canvas textures and shared clock (see ./scenery)

export const SKY_COLOR = '#1a0f3d'

// Seeded random so the city and circuit look the same every load
export function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

// A circuit board: traces with 45° jogs, solder pads and a few chips
export function circuitTexture() {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  g.fillStyle = '#0b0824'
  g.fillRect(0, 0, size, size)
  const rand = seeded(42)
  const colors = ['#3de8ff', '#6c5cff', '#ff4fd8', '#3b6fd9']
  g.lineCap = 'round'
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = colors[i % colors.length]
    g.lineWidth = 2 + rand() * 3
    let x = rand() * size
    let y = rand() * size
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 4; s++) {
      const len = 40 + rand() * 160
      const dir = Math.floor(rand() * 4)
      const diag = rand() < 0.35
      const dx = [1, 0, -1, 0][dir] * len
      const dy = [0, 1, 0, -1][dir] * len
      x += dx + (diag ? dy * 0.5 : 0)
      y += dy + (diag ? dx * 0.5 : 0)
      g.lineTo(x, y)
    }
    g.stroke()
    g.fillStyle = g.strokeStyle
    g.beginPath()
    g.arc(x, y, 6, 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 12; i++) {
    const w = 40 + rand() * 60
    const h = 30 + rand() * 50
    const x = rand() * (size - w)
    const y = rand() * (size - h)
    g.fillStyle = '#16123a'
    g.fillRect(x, y, w, h)
    g.strokeStyle = '#6c5cff'
    g.lineWidth = 2
    g.strokeRect(x, y, w, h)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

// Shared clock for the floor's light rings, advanced once per frame by <CircuitClock>
export const circuitTime = { value: 0 }
export function windowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const g = canvas.getContext('2d')!
  g.fillStyle = '#140f2e'
  g.fillRect(0, 0, 64, 256)
  const rand = seeded(9)
  const lit = ['#ffe14d', '#3de8ff', '#ff4fd8', '#ffb547']
  for (let y = 6; y < 250; y += 10) {
    for (let x = 5; x < 60; x += 10) {
      if (rand() < 0.45) continue
      g.fillStyle = lit[Math.floor(rand() * lit.length)]
      g.fillRect(x, y, 6, 5)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function billboardTexture(lines: string[] = ['NEON', 'CIRCUIT']) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const g = canvas.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 512, 256)
  grad.addColorStop(0, '#ff4fd8')
  grad.addColorStop(1, '#3de8ff')
  g.fillStyle = '#120d2e'
  g.fillRect(0, 0, 512, 256)
  g.strokeStyle = grad
  g.lineWidth = 14
  g.strokeRect(10, 10, 492, 236)
  g.fillStyle = grad
  g.font = 'bold 78px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText(lines[0], 256, 118)
  g.fillText(lines[1] ?? '', 256, 200)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
