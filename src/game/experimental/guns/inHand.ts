import * as THREE from 'three'

// The gun in the character's hands right now: which one (catalog index), and where it is in the world
// (the held model's world matrix, refreshed every frame), so shots can leave from its muzzle
export const inHand = {
  gun: 0,
  matrix: new THREE.Matrix4(),
  ready: false, // false until the held model has been drawn once
  boltPull: 0, // a bolt being worked by hand after a shot: 0 home .. 1 pulled all the way back
}
