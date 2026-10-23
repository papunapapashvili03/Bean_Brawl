import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGrabEdges } from '../grab'
import { TapedRod } from '../GripTape'
import { Slab } from '../race/parts'
import { CLIMB, COLORS, HALF, HOLD_COLUMNS, HOLD_HALF, RAMP, TOP_1 } from './course'
import { climbEdges, holdSpots, type Hold } from './holds'

// 2. The Climb: a ramp up the middle to the fan deck, yellow chevrons up it; and either side, the deck's purple
// front face is a climbing wall: holds up it (hop hold to hold with Space, steer with A/D), and its taped top
// edge a ledge to pull yourself up over. The ramp's quicker for the first few, then it jams.

type P3 = [number, number, number]

const HOLDS = holdSpots(CLIMB.rows, HOLD_COLUMNS)
const LEDGES: { a: P3; b: P3 }[] = [
  { a: [-HALF, TOP_1, CLIMB.face], b: [-RAMP.half - 0.1, TOP_1, CLIMB.face] },
  { a: [RAMP.half + 0.1, TOP_1, CLIMB.face], b: [HALF, TOP_1, CLIMB.face] },
]

const EDGES = climbEdges(HOLDS, LEDGES, CLIMB.face)

const holdGeometry = new THREE.SphereGeometry(1, 14, 10)
const holdMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 })

// A face's holds, drawn
export function Holds({ holds, face }: { holds: readonly Hold[]; face: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current!
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    holds.forEach((h, i) => {
      dummy.position.set(h.x, h.y - 0.05, face + 0.02)
      dummy.scale.set(HOLD_HALF + 0.06, 0.11, 0.17)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, color.set(h.color))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [holds, face])
  return <instancedMesh ref={mesh} args={[holdGeometry, holdMaterial, holds.length]} castShadow />
}

// Yellow chevrons pointing up the ramp
function chevrons() {
  const w = 128
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.fillStyle = '#fff1b8'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#ffc21a'
  g.beginPath()
  g.moveTo(0, h * 0.75)
  g.lineTo(w / 2, h * 0.25)
  g.lineTo(w, h * 0.75)
  g.lineTo(w, h)
  g.lineTo(w / 2, h * 0.5)
  g.lineTo(0, h)
  g.closePath()
  g.fill()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

export function Climb() {
  useGrabEdges(EDGES)
  const rampTop = useMemo(() => {
    const map = chevrons()
    const length = Math.hypot(RAMP.z0 - RAMP.z1, TOP_1)
    map.repeat.set(1, length / (RAMP.half * 2))
    return new THREE.MeshStandardMaterial({ map, roughness: 0.75 })
  }, [])
  return (
    <group>
      <Slab z0={RAMP.z0} y0={0} z1={RAMP.z1} y1={TOP_1} width={RAMP.half * 2} thickness={0.6} side={COLORS.trim} topMaterial={rampTop} />
      <Holds holds={HOLDS} face={CLIMB.face} />
      {LEDGES.map((l, i) => (
        <TapedRod key={i} a={l.a} b={l.b} />
      ))}
    </group>
  )
}
