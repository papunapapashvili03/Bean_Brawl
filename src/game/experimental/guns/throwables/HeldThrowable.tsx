import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { THROWABLES } from './catalog'
import { throwInHand } from './pouch'

// What the character holds: the current throwable, growing into the hand as it comes out of the pouch,
// keeping track of where it is in the world so a throw leaves from the hand
export function HeldThrowable() {
  const { Model } = THROWABLES[throwInHand.kind]
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = group.current
    if (!g) return
    g.scale.setScalar(Math.max(throwInHand.show, 0.001))
    g.visible = throwInHand.show > 0.01
    throwInHand.matrix.copy(g.matrixWorld)
    throwInHand.ready = true
  })
  return (
    <group ref={group}>
      <Model live={throwInHand.live} />
    </group>
  )
}
