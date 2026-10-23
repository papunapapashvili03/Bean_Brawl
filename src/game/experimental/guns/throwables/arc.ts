import * as THREE from 'three'

// What <AimArc /> draws: where something thrown or lobbed leaves from, how fast which way, and how big what
// it does is (the ring where it lands). Its owner fills it in every frame; `show: false` hides it.
export type ArcAim = { show: boolean; from: THREE.Vector3; vel: THREE.Vector3; reach: number }
export const newArcAim = (): ArcAim => ({ show: false, from: new THREE.Vector3(), vel: new THREE.Vector3(), reach: 1 })
