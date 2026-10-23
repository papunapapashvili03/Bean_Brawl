import { type MouseEvent } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { devZoomScale, setDevZoom, useDevZoom } from './devZoom'
import { activePlayerPosition } from './playerContact'

// Dev zoom (./devZoom): the button that switches it on and off (showing how far out you are), and what it
// does to the view out past the usual distance: no fog, and the camera's far limit pushed out to see
// everything (its near limit too, to keep depth sharp that far out).

const ZOOMED = 1.01

// Whichever level's fog stays in place, but the scene draws without it while zoomed out
let stashedFog: THREE.Scene['fog'] = null
function hideFog(this: THREE.Scene) {
  if (devZoomScale() <= ZOOMED) return
  stashedFog = this.fog
  this.fog = null
}
function restoreFog(this: THREE.Scene) {
  if (stashedFog) this.fog = stashedFog
  stashedFog = null
}

export function DevZoomButton() {
  const { on, scale } = useDevZoom()
  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur()
    setDevZoom(!on)
  }
  return (
    <button className={`dev-zoom${on ? ' active' : ''}`} onClick={toggle} title="Dev: scroll the mouse wheel over the game to zoom out as far as you like">
      {on ? `Zoom ${scale < 10 ? scale.toFixed(1) : Math.round(scale)}×` : 'Dev zoom'}
    </button>
  )
}

export function DevZoomView() {
  useFrame(({ scene, camera }) => {
    scene.onBeforeRender = hideFog
    scene.onAfterRender = restoreFog
    const cam = camera as THREE.PerspectiveCamera
    let near = 0.1
    let far = 1000
    if (devZoomScale() > ZOOMED) {
      const p = activePlayerPosition()
      const out = p ? cam.position.distanceTo(p) : 0
      near = Math.max(0.1, out / 4000)
      far = Math.max(1000, out * 3 + 1000)
    }
    if (cam.near !== near || cam.far !== far) {
      cam.near = near
      cam.far = far
      cam.updateProjectionMatrix()
    }
  })
  return null
}
