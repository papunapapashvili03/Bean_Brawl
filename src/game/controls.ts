import type { KeyboardControlsEntry } from '@react-three/drei'

export const Controls = {
  forward: 'forward',
  back: 'back',
  left: 'left',
  right: 'right',
  jump: 'jump',
  drop: 'drop',
  crouch: 'crouch',
  camLeft: 'camLeft',
  camRight: 'camRight',
} as const

export type ControlName = (typeof Controls)[keyof typeof Controls]

export const keyMap: KeyboardControlsEntry<ControlName>[] = [
  { name: Controls.forward, keys: ['KeyW', 'ArrowUp'] },
  { name: Controls.back, keys: ['KeyS', 'ArrowDown'] },
  { name: Controls.left, keys: ['KeyA', 'ArrowLeft'] },
  { name: Controls.right, keys: ['KeyD', 'ArrowRight'] },
  { name: Controls.jump, keys: ['Space'] },
  { name: Controls.drop, keys: ['ShiftLeft', 'ShiftRight'] }, // let go of a ledge or bar, or climb down over one
  { name: Controls.crouch, keys: ['KeyC'] }, // crouch / stand up; on the move, hold to roll
  { name: Controls.camLeft, keys: ['KeyQ'] },
  { name: Controls.camRight, keys: ['KeyE'] },
]
