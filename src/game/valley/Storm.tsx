import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { activePlayerPosition } from '../playerContact'
import { height } from './ground'
import { newRound, setStormPlayer, storm, stormAt, stormDepth, tickStorm, type Circle } from './stormState'

// The storm in the world (./storm): its wall, a swirling purple curtain standing round the safe zone and
// closing in with it; a glowing band along the ground where the next zone will be; and, out in the storm,
// the light going purple and the air thick. It runs the round's clock too, starting a fresh round on arrival.

const WALL_BOTTOM = -60
const WALL_TOP = 260
const RING_HEIGHT = 3
const STORM_AIR = '#5a2a86'

const wallGeometry = new THREE.CylinderGeometry(1, 1, WALL_TOP - WALL_BOTTOM, 160, 1, true).translate(0, (WALL_TOP + WALL_BOTTOM) / 2, 0)

// uStrength: 1 seen from the safe side, less from out in the storm (so you can see your way back in)
const wallMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uStrength;
    varying vec3 vWorld;
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
    }
    float fbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.03 + 17.1;
        a *= 0.5;
      }
      return v;
    }
    void main() {
      // Cloud billowing upward and drifting round, with bright seams of lightning running through it
      vec3 p = vWorld * vec3(0.03, 0.02, 0.03) + vec3(0.0, -uTime * 0.15, uTime * 0.04);
      float n = fbm(p + 1.6 * fbm(p * 1.4 + vec3(uTime * 0.03)));
      float streaks = noise(vec3(vWorld.x * 0.08, vWorld.y * 0.004 - uTime * 0.25, vWorld.z * 0.08));
      n = mix(n, streaks, 0.3);
      vec3 col = mix(vec3(0.34, 0.11, 0.58), vec3(0.86, 0.56, 1.0), smoothstep(0.32, 0.8, n));
      float bolt = 1.0 - abs(noise(vec3(vWorld.x * 0.02, vWorld.y * 0.006 - uTime * 0.5, vWorld.z * 0.02)) * 2.0 - 1.0);
      bolt = pow(bolt, 22.0) * step(0.55, noise(vec3(uTime * 0.9, vWorld.x * 0.004, vWorld.z * 0.004)));
      col += bolt * vec3(0.75, 0.7, 1.0);
      float a = (0.62 + 0.38 * n) * uStrength + bolt * 0.4;
      a *= 1.0 - smoothstep(170.0, ${WALL_TOP.toFixed(1)}, vWorld.y);
      a *= mix(0.45, 1.0, smoothstep(2.0, 45.0, distance(cameraPosition, vWorld)));
      gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
    }`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
})

const ringMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      // vUv.x runs along the ring in metres, vUv.y up the band
      float fade = 1.0 - smoothstep(0.2, 1.0, vUv.y);
      float dash = 0.6 + 0.4 * step(0.5, fract(vUv.x / 5.0 - uTime * 0.5));
      float pulse = 0.85 + 0.15 * sin(uTime * 3.0);
      gl_FragColor = vec4(0.93, 0.98, 1.0, fade * dash * pulse * 0.85);
    }`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
})

const NO_RING = new THREE.BufferGeometry()

// A band standing along the ground round a circle, RING_HEIGHT tall
function ringGeometry(c: Circle) {
  const n = Math.max(72, Math.ceil((Math.PI * 2 * c.r) / 2.5))
  const position = new Float32Array((n + 1) * 6)
  const uv = new Float32Array((n + 1) * 4)
  const index: number[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = c.x + Math.cos(a) * c.r
    const z = c.z + Math.sin(a) * c.r
    const y = height(x, z)
    position.set([x, y - 0.6, z, x, y + RING_HEIGHT, z], i * 6)
    const along = a * c.r
    uv.set([along, 0, along, 1], i * 4)
    if (i < n) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(position, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}

export function Storm({ sky }: { sky: string }) {
  const wall = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringFor = useRef<Circle | null>(null)
  const haze = useRef(0)
  const air = useMemo(() => ({ clear: new THREE.Color(sky), storm: new THREE.Color(STORM_AIR) }), [sky])

  useEffect(() => {
    newRound()
  }, [])

  useFrame((state, delta) => {
    const p = activePlayerPosition()
    const at = p ? { x: p.x, z: p.z } : null
    setStormPlayer(at)
    tickStorm(Math.min(delta, 0.25), at)
    const s = stormAt(storm.time)
    const t = state.clock.elapsedTime
    wallMaterial.uniforms.uTime.value = t
    wallMaterial.uniforms.uStrength.value = 1 - haze.current * 0.45
    ringMaterial.uniforms.uTime.value = t

    const w = wall.current
    if (w) {
      w.visible = s.now.r > 0.05
      w.position.set(s.now.x, 0, s.now.z)
      w.scale.set(Math.max(s.now.r, 0.05), 1, Math.max(s.now.r, 0.05))
    }

    // The next zone's band, rebuilt whenever there's a new one
    const r = ring.current
    if (r) {
      if (s.next !== ringFor.current) {
        ringFor.current = s.next
        if (r.geometry !== NO_RING) r.geometry.dispose()
        r.geometry = s.next && s.next.r > 0 ? ringGeometry(s.next) : NO_RING
      }
      r.visible = !!s.next && s.next.r > 0
    }

    // Out in the storm the air thickens and goes purple
    const inStorm = at ? stormDepth(s.now, at.x, at.z) > 0 : false
    haze.current += ((inStorm ? 1 : 0) - haze.current) * Math.min(1, delta * 2.5)
    const k = haze.current
    const fog = state.scene.fog
    if (fog instanceof THREE.Fog) {
      fog.color.lerpColors(air.clear, air.storm, k)
      fog.near = THREE.MathUtils.lerp(240, 4, k)
      fog.far = THREE.MathUtils.lerp(950, 140, k)
    }
    const bg = state.scene.background
    if (bg instanceof THREE.Color) bg.lerpColors(air.clear, air.storm, k)
  })

  return (
    <>
      <mesh ref={wall} geometry={wallGeometry} material={wallMaterial} renderOrder={10} frustumCulled={false} />
      <mesh ref={ring} geometry={NO_RING} material={ringMaterial} renderOrder={9} frustumCulled={false} />
    </>
  )
}
