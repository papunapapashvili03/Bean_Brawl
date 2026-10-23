import * as THREE from 'three'

const materialCache = new Map<string, THREE.MeshStandardMaterial>()

// Shared flat-colour material per colour, so hundreds of course pieces don't each get their own
export function paint(color: string) {
  let m = materialCache.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
    materialCache.set(color, m)
  }
  return m
}

export function checkerTexture(cols: number, rows: number) {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = cols * size
  canvas.height = rows * size
  const g = canvas.getContext('2d')!
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      g.fillStyle = (i + j) % 2 ? '#1b1b1f' : '#ffffff'
      g.fillRect(i * size, j * size, size, size)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  return tex
}
