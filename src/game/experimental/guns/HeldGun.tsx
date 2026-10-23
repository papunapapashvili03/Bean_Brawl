import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { useAmmo } from './ammo'
import { GUNS } from './catalog'
import { inHand } from './inHand'

// What the character holds: the current gun's model (with its round showing while loaded), keeping track
// of where it is in the world so shots can leave from the muzzle
export function HeldGun() {
  const index = inHand.gun
  const { Model, HeldModel } = GUNS[index]
  const Item = HeldModel ?? Model
  const loaded = useAmmo().mag[index] > 0
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!group.current) return
    inHand.matrix.copy(group.current.matrixWorld)
    inHand.ready = true
  })
  return (
    <group ref={group}>
      <Item loaded={loaded} held />
    </group>
  )
}
