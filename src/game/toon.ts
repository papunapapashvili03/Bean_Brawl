import * as THREE from 'three'

// Shared look and shape of the character, so accessories match it: cel shading, ink outline, bean body.

export const INK = '#1b1b1f'
const OUTLINE_WIDTH = 0.022

// Three-band cel shading, like the flat cartoon reference
const gradientMap = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat)
gradientMap.minFilter = THREE.NearestFilter
gradientMap.magFilter = THREE.NearestFilter
gradientMap.needsUpdate = true

const toonCache = new Map<string, THREE.MeshToonMaterial>()
export function toon(color: string, side: THREE.Side = THREE.FrontSide) {
  const key = `${color}:${side}`
  let m = toonCache.get(key)
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap, side })
    toonCache.set(key, m)
  }
  return m
}

const mapCache = new Map<THREE.Texture, THREE.MeshToonMaterial>()
export function toonMap(map: THREE.Texture) {
  let m = mapCache.get(map)
  if (!m) {
    m = new THREE.MeshToonMaterial({ map, gradientMap })
    mapCache.set(map, m)
  }
  return m
}

export const ink = new THREE.MeshBasicMaterial({ color: INK })

// Cartoon outline: an inverted hull pushed out along the normals, drawn back faces only
export const outline = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })
outline.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>\ntransformed += normal * ${OUTLINE_WIDTH.toFixed(3)};`,
  )
}

// Bean body: a lathe profile with a wider bottom arc, a gently tapering middle and a narrower top dome.
// The model fits the physics capsule, which spans y = -1 (feet) to +1. The face is on the +z side.
export const BOTTOM = { y: -0.3, rx: 0.48, ry: 0.38 }
export const TOP = { y: 0.38, rx: 0.42, ry: 0.54 }

export function bodyRadiusAt(y: number) {
  if (y <= BOTTOM.y) return BOTTOM.rx * Math.cos(Math.asin(THREE.MathUtils.clamp((y - BOTTOM.y) / BOTTOM.ry, -1, 1)))
  if (y >= TOP.y) return TOP.rx * Math.cos(Math.asin(THREE.MathUtils.clamp((y - TOP.y) / TOP.ry, -1, 1)))
  return THREE.MathUtils.lerp(BOTTOM.rx, TOP.rx, (y - BOTTOM.y) / (TOP.y - BOTTOM.y))
}

// Place a feature on the front (+z) of the body at (x, y), turned to follow the curve.
// A negative inset lifts it off the surface.
export function onFace(x: number, y: number, inset = 0.012) {
  const r = bodyRadiusAt(y)
  return {
    position: [x, y, Math.sqrt(Math.max(r * r - x * x, 0)) - inset] as [number, number, number],
    yaw: Math.asin(x / r),
  }
}

// Point on the body surface at angle `a` around it (0 = front, +a towards +x) and height y, lifted by `offset`
export function aroundBody(a: number, y: number, offset = 0, out = new THREE.Vector3()) {
  const r = bodyRadiusAt(y) + offset
  return out.set(r * Math.sin(a), y, r * Math.cos(a))
}

// The body profile (radius, height) from y0 up to y1, pushed out by `offset` so a skin-tight layer
// (a mask) sits just off the surface. Samples the middle by height and the top dome by angle.
export function profileBand(y0: number, y1: number, offset: number, steps = 10) {
  const points: { r: number; y: number }[] = []
  const midTop = Math.min(y1, TOP.y)
  if (y0 < midTop) {
    for (let i = 0; i <= steps; i++) {
      const y = THREE.MathUtils.lerp(y0, midTop, i / steps)
      points.push({ r: bodyRadiusAt(y) + offset, y })
    }
  }
  if (y1 > TOP.y) {
    const t0 = Math.asin(THREE.MathUtils.clamp((Math.max(y0, TOP.y) - TOP.y) / TOP.ry, 0, 1))
    const t1 = Math.asin(THREE.MathUtils.clamp((y1 - TOP.y) / TOP.ry, 0, 1))
    for (let i = points.length ? 1 : 0; i <= steps; i++) {
      const t = THREE.MathUtils.lerp(t0, t1, i / steps)
      points.push({ r: Math.max((TOP.rx + offset) * Math.cos(t), 0.0001), y: TOP.y + (TOP.ry + offset) * Math.sin(t) })
    }
  }
  return points
}
