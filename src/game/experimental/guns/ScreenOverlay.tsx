import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { pinToScreen } from './screen'

// A fullscreen overlay (the HUD, the reticle, the on-screen buttons) drawn through drei's <Html>: pinned to
// the screen (./screen), and anchored just in front of the camera, as drei hides an overlay whose anchor is
// behind the camera (so one anchored where its parent sits would vanish whenever you looked away from there)

const ahead = new THREE.Vector3()

export function ScreenOverlay({
  zIndexRange,
  wrapperClass,
  children,
}: {
  zIndexRange: [number, number]
  wrapperClass?: string
  children: ReactNode
}) {
  const anchor = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    const a = anchor.current
    if (!a) return
    camera.getWorldDirection(ahead)
    camera.getWorldPosition(a.position).add(ahead)
    a.parent?.worldToLocal(a.position)
  })
  return (
    <group ref={anchor}>
      <Html fullscreen calculatePosition={pinToScreen} zIndexRange={zIndexRange} wrapperClass={wrapperClass} style={{ pointerEvents: 'none' }}>
        {children}
      </Html>
    </group>
  )
}
