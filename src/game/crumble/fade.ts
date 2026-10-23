import type * as THREE from 'three'

// Pieces of the tower that fade out of the camera's way. Every <Crumble /> registers its body (by handle) with
// its own material; <FadeBlockers /> casts a ray from the player to the camera each frame and fades whatever
// it passes through.

export const fadeBodies = new Map<number, THREE.MeshStandardMaterial>()
