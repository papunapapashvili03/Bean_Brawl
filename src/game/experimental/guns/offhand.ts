import * as THREE from 'three'

// Where the second gun of a pair (dual pistols) sits, relative to the first one in the right hand.
// Written every frame by the holding code, read by the held pair.
export const offhand = {
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
}
