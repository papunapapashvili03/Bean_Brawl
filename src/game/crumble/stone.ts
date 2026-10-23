import * as THREE from 'three'

// Weathered stone for the tower, drawn on canvases: blocks with mortar lines, speckles and hairline
// cracks, and a glowing crack pattern for floors that are about to give way

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// A crooked line wandering from (x, y) in roughly the given direction, sometimes branching
function crack(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, dir: number, length: number, depth = 0) {
  g.beginPath()
  g.moveTo(x, y)
  let a = dir
  for (let i = 0; i < length; i += 6) {
    a += (rand() - 0.5) * 0.9
    x += Math.cos(a) * 6
    y += Math.sin(a) * 6
    g.lineTo(x, y)
    if (depth < 2 && rand() < 0.08) {
      g.stroke()
      crack(g, rand, x, y, a + (rand() < 0.5 ? 0.9 : -0.9), length * 0.45, depth + 1)
      g.beginPath()
      g.moveTo(x, y)
    }
  }
  g.stroke()
}

function stoneCanvas(width: number, height: number, blocksAcross: number, blocksDown: number, seed: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')!
  const rand = seeded(seed)
  const bw = width / blocksAcross
  const bh = height / blocksDown
  const tones = ['#c9bfae', '#bdb2a0', '#b3a893', '#c4b9a6', '#aea38f']
  for (let row = 0; row < blocksDown; row++) {
    const offset = row % 2 ? bw / 2 : 0
    for (let col = -1; col <= blocksAcross; col++) {
      g.fillStyle = tones[Math.floor(rand() * tones.length)]
      g.fillRect(col * bw + offset, row * bh, bw, bh)
    }
  }
  // Speckles
  for (let i = 0; i < width * height * 0.01; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(90, 80, 70, 0.25)' : 'rgba(255, 250, 240, 0.2)'
    g.fillRect(rand() * width, rand() * height, 2, 2)
  }
  // Mortar
  g.strokeStyle = '#7d7366'
  g.lineWidth = 3
  for (let row = 0; row <= blocksDown; row++) {
    g.beginPath()
    g.moveTo(0, row * bh)
    g.lineTo(width, row * bh)
    g.stroke()
    const offset = row % 2 ? bw / 2 : 0
    for (let col = 0; col <= blocksAcross; col++) {
      g.beginPath()
      g.moveTo(col * bw + offset, row * bh)
      g.lineTo(col * bw + offset, (row + 1) * bh)
      g.stroke()
    }
  }
  // Hairline cracks
  g.strokeStyle = 'rgba(60, 52, 44, 0.75)'
  g.lineWidth = 1.5
  for (let i = 0; i < 3; i++) crack(g, rand, rand() * width, rand() * height, rand() * Math.PI * 2, 70 + rand() * 60)
  return canvas
}

function texture(canvas: HTMLCanvasElement, repeat: number) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = 4
  return tex
}

const floorCanvas = stoneCanvas(256, 256, 4, 4, 7)
// Floors whose UVs are in metres (extruded shapes): one texture every 4 m
export const stoneFloorWorld = new THREE.MeshStandardMaterial({ map: texture(floorCanvas, 0.25), roughness: 0.9 })
// Boxes (UVs 0..1 on each face)
export const stoneBlock = new THREE.MeshStandardMaterial({ map: texture(floorCanvas, 1), roughness: 0.9 })
// Tower walls, whose UVs are in metres (extruded shapes): blocks 1 m long and 0.4 m high
export const stoneWall = new THREE.MeshStandardMaterial({ map: texture(stoneCanvas(128, 256, 2, 5, 3), 0.5), roughness: 0.92 })
export const stoneDark = new THREE.MeshStandardMaterial({ color: '#8c8272', map: texture(floorCanvas, 1), roughness: 0.95 })

// Glowing cracks spreading over a floor about to give way (drawn on top, transparent)
function crackCanvas() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const rand = seeded(19)
  g.lineCap = 'round'
  g.shadowColor = '#ff8a2a'
  g.shadowBlur = 8
  g.strokeStyle = '#2a1408'
  g.lineWidth = 5
  for (let i = 0; i < 5; i++) crack(g, rand, size / 2 + (rand() - 0.5) * 60, size / 2 + (rand() - 0.5) * 60, rand() * Math.PI * 2, 150)
  g.shadowBlur = 0
  g.strokeStyle = '#ffb347'
  g.lineWidth = 1.5
  const again = seeded(19)
  for (let i = 0; i < 5; i++) crack(g, again, size / 2 + (again() - 0.5) * 60, size / 2 + (again() - 0.5) * 60, again() * Math.PI * 2, 150)
  return canvas
}
export const crackTexture = texture(crackCanvas(), 0.2)
