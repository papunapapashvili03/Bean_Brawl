import * as THREE from 'three'

// EXPERIMENTAL: guns. Everything for this feature lives in this folder; the rest of the game only mounts
// <GunDisplay /> in the playground. Delete that line and this folder to remove it.

// Every gun is built at its real-ish shape and then made chunkier, toy-like: a little longer and taller and
// much thicker, so bodies, grips and handguards are big enough for the character's mitten hands to wrap
// round rather than hide. Grip points given in model space are scaled by the same amount.
export const GUN_SCALE: [number, number, number] = [1.2, 1.3, 1.6]

// Shapes for gun parts, described as small plain objects so they can be cached and reused
export type Shape =
  | { box: [number, number, number] }
  | { rod: [number, number] } // [radius, length], lying along x
  | { cone: [number, number, number] } // [radius at the back, radius at the front, length], lying along x
  | { disc: [number, number] } // [radius, thickness], facing the sides (a drum magazine)
  | { post: [number, number] } // [radius, length], standing along y
  | { ring: [number, number, number?] } // [radius, tube, arc], in the xy plane
  | { sphere: number }
  | { profile: [number, number][]; hole?: [number, number][]; depth: number } // side outline, extruded along z

const geometryCache = new Map<string, THREE.BufferGeometry>()

function build(shape: Shape): THREE.BufferGeometry {
  if ('box' in shape) return new THREE.BoxGeometry(...shape.box)
  if ('rod' in shape) return new THREE.CylinderGeometry(shape.rod[0], shape.rod[0], shape.rod[1], 18).rotateZ(Math.PI / 2)
  // Along x with the front (+x) end as the cylinder's top: texture v runs from the back (0) to the tip (1),
  // and u = 0 is the +z side
  if ('cone' in shape) {
    const [back, front, length] = shape.cone
    return new THREE.CylinderGeometry(front, back, length, 24).rotateZ(-Math.PI / 2)
  }
  if ('disc' in shape) return new THREE.CylinderGeometry(shape.disc[0], shape.disc[0], shape.disc[1], 28).rotateX(Math.PI / 2)
  if ('post' in shape) return new THREE.CylinderGeometry(shape.post[0], shape.post[0], shape.post[1], 14)
  if ('ring' in shape) return new THREE.TorusGeometry(shape.ring[0], shape.ring[1], 8, 24, shape.ring[2] ?? Math.PI * 2)
  if ('sphere' in shape) return new THREE.SphereGeometry(shape.sphere, 12, 8)
  const outline = new THREE.Shape(shape.profile.map(([x, y]) => new THREE.Vector2(x, y)))
  if (shape.hole) outline.holes.push(new THREE.Path(shape.hole.map(([x, y]) => new THREE.Vector2(x, y))))
  const g = new THREE.ExtrudeGeometry(outline, {
    depth: shape.depth,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 1,
  })
  return g.translate(0, 0, -shape.depth / 2)
}

export function shapeGeometry(shape: Shape) {
  const key = JSON.stringify(shape)
  let g = geometryCache.get(key)
  if (!g) {
    g = build(shape)
    geometryCache.set(key, g)
  }
  return g
}

// A thinner ink outline than the character's: gun parts are small, and a thick one would swallow them
export const thinOutline = new THREE.MeshBasicMaterial({ color: '#1b1b1f', side: THREE.BackSide })
thinOutline.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\ntransformed += normal * 0.007;',
  )
}

// Grey camouflage for the shotgun stock and forend
function camoTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  g.fillStyle = '#5e646b'
  g.fillRect(0, 0, size, size)
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (const color of ['#474c52', '#737a82', '#3a3e43']) {
    g.fillStyle = color
    for (let i = 0; i < 14; i++) {
      g.beginPath()
      g.ellipse(rand() * size, rand() * size, 6 + rand() * 14, 4 + rand() * 9, rand() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 3) // extruded parts use their side outline (in metres) as UVs
  return tex
}
export const camo = camoTexture()

// The rocket's warhead: olive paint with a shark mouth (and eye) on each side, for the front cone.
// The cone's u runs round it from the +z side (0) and v from the back (0) to the tip (1).
function sharkTexture() {
  const w = 512
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.fillStyle = '#6b7a2a'
  g.fillRect(0, 0, w, h)
  // Draw one face centred at u = 0 (wrapping over the edge) and one at u = 0.5. The tip (v = 1) is at the
  // top of the canvas: the grin points towards it and opens up towards the back.
  for (const cu of [0, 0.5, 1]) {
    const cx = cu * w
    g.save()
    g.translate(cx, 0)
    // Mouth: a long pointed grin opening towards the back, red inside, white rim
    const mouth = () => {
      g.beginPath()
      g.moveTo(0, 60)
      g.quadraticCurveTo(52, 120, 44, 200)
      g.quadraticCurveTo(0, 176, -44, 200)
      g.quadraticCurveTo(-52, 120, 0, 60)
      g.closePath()
    }
    g.fillStyle = '#ffffff'
    mouth()
    g.fill()
    g.save()
    g.scale(0.82, 0.9)
    g.translate(0, 18)
    g.fillStyle = '#b0282a'
    mouth()
    g.fill()
    g.restore()
    // Teeth along both edges of the grin
    g.fillStyle = '#ffffff'
    for (let i = 0; i < 6; i++) {
      const y = 92 + i * 17
      for (const s of [-1, 1]) {
        const x = s * (14 + i * 4.2)
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + s * 9, y + 6)
        g.lineTo(x - s * 3, y + 14)
        g.closePath()
        g.fill()
      }
    }
    g.strokeStyle = '#1b1b1f'
    g.lineWidth = 4
    mouth()
    g.stroke()
    // Eye, further back
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.ellipse(-58, 214, 16, 11, -0.3, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#1b1b1f'
    g.beginPath()
    g.ellipse(-54, 216, 7, 7, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex // the default flipY puts the top of the canvas at v = 1: the tip
}
export const shark = sharkTexture()
