import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { activePlayerMotion } from '../playerContact'
import { touch, useTouchMode } from './touch'
import { TouchButton } from './TouchButton'

// The on-screen controls for phones and tablets (in touch mode, ./touch): on the left a stick to run with
// (put a thumb down anywhere on the lower left and it comes to it); on the right Jump, and Roll (crouch,
// standing still), which turns into Let go while hanging from something. Dragging anywhere else turns the
// camera (../Player). A held gun adds its own Aim, Shoot and Reload (../experimental/guns/TouchFire), and a
// gun stand its Pick button.

const RADIUS = 52 // how far (px) the knob goes from the middle of the stick
const DEAD = 0.12 // pushed less than this (of RADIUS) does nothing
const FULL = 0.7 // pushed this far is a run; less, a walk

function Stick() {
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const finger = useRef<{ id: number; x: number; y: number } | null>(null)

  const push = (dx: number, dy: number) => {
    const length = Math.hypot(dx, dy)
    const reach = Math.min(length, RADIUS)
    const k = length > 0 ? reach / length : 0
    knob.current!.style.transform = `translate(${dx * k}px, ${dy * k}px)`
    const amount = reach / RADIUS
    const speed = amount < DEAD ? 0 : Math.min(1, (amount - DEAD) / (FULL - DEAD))
    touch.x = length > 0 ? (dx / length) * speed : 0
    touch.y = length > 0 ? (-dy / length) * speed : 0
  }
  const letGo = () => {
    finger.current = null
    const b = base.current!
    b.classList.remove('held')
    b.style.left = b.style.top = ''
    knob.current!.style.transform = ''
    touch.x = touch.y = 0
  }
  useEffect(() => () => void (touch.x = touch.y = 0), [])

  return (
    <div
      className="touch-stick-zone"
      onPointerDown={(e) => {
        if (finger.current) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        finger.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        // The stick comes to the thumb
        const b = base.current!
        b.classList.add('held')
        b.style.left = `${e.clientX}px`
        b.style.top = `${e.clientY}px`
        push(0, 0)
      }}
      onPointerMove={(e: PointerEvent) => {
        const f = finger.current
        if (f?.id === e.pointerId) push(e.clientX - f.x, e.clientY - f.y)
      }}
      onPointerUp={(e) => finger.current?.id === e.pointerId && letGo()}
      onPointerCancel={(e) => finger.current?.id === e.pointerId && letGo()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={base} className="touch-stick">
        <div ref={knob} className="touch-knob" />
      </div>
    </div>
  )
}

// Whether the player's hanging from something (looked at a few times a second)
function useHanging() {
  const [hanging, setHanging] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => setHanging(!!activePlayerMotion()?.hang), 100)
    return () => window.clearInterval(id)
  }, [])
  return hanging
}

export function TouchControls() {
  const on = useTouchMode()
  const hanging = useHanging()
  // (Nothing left held down when the controls go)
  useEffect(
    () => () => {
      touch.jump = touch.crouchHeld = touch.drop = false
    },
    [],
  )
  if (!on) return null
  return (
    <div className="touch-controls">
      <Stick />
      <TouchButton className="touch-jump" onDown={() => (touch.jump = true)} onUp={() => (touch.jump = false)}>
        Jump
      </TouchButton>
      {hanging ? (
        <TouchButton key="drop" className="touch-roll" onDown={() => (touch.drop = true)} onUp={() => (touch.drop = false)}>
          Let go
        </TouchButton>
      ) : (
        <TouchButton
          key="roll"
          className="touch-roll"
          onDown={() => {
            touch.crouchHeld = true
            touch.crouchPressed = true
          }}
          onUp={() => (touch.crouchHeld = false)}
        >
          Roll
        </TouchButton>
      )}
      <div className="touch-turn">Turn your phone sideways to play</div>
    </div>
  )
}
