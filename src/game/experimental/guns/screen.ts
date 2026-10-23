import type * as THREE from 'three'

// Screen overlays (HUD, aim dot) are drawn through drei's <Html>, which would place them relative to where
// their parent sits in the scene; pinning the anchor to the screen centre keeps a fullscreen one in place
export const pinToScreen = (_: THREE.Object3D, __: THREE.Camera, size: { width: number; height: number }) => [
  size.width / 2,
  size.height / 2,
]
