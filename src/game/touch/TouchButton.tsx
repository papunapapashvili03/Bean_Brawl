import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react'

// A button for the on-screen controls: held down for as long as the finger that pressed it stays on the
// screen (it keeps hold of that finger, so sliding off it doesn't let go), whatever other fingers are doing
// on other buttons. `onDrag` hears how far the finger moves while it's down (e.g. to turn the camera while
// shooting). Taken away while it's held, it lets go.
export function TouchButton({
  className,
  children,
  active = false,
  label,
  onDown,
  onUp,
  onDrag,
}: {
  className: string
  children: ReactNode
  active?: boolean
  label?: string
  onDown?: () => void
  onUp?: () => void
  onDrag?: (dx: number, dy: number) => void
}) {
  const finger = useRef<{ id: number; x: number; y: number } | null>(null)
  const lift = useRef(onUp)
  useEffect(() => {
    lift.current = onUp
  })
  useEffect(
    () => () => {
      if (finger.current) lift.current?.()
    },
    [],
  )
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (finger.current?.id !== e.pointerId) return
    finger.current = null
    e.currentTarget.classList.remove('down')
    onUp?.()
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={`touch-button ${className}${active ? ' active' : ''}`}
      onPointerDown={(e) => {
        if (finger.current) return
        e.preventDefault() // (no focus, no text selection)
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.classList.add('down')
        finger.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        onDown?.()
      }}
      onPointerMove={(e) => {
        const f = finger.current
        if (f?.id !== e.pointerId) return
        onDrag?.(e.clientX - f.x, e.clientY - f.y)
        f.x = e.clientX
        f.y = e.clientY
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}
