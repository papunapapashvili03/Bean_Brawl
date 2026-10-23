import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './icons'

// A dialog over the page: closes with its × button, Escape, or a click outside it. The page behind
// stops scrolling while it's open.

type Props = { onClose: () => void; labelledBy: string; className?: string; children: ReactNode }

export function Modal({ onClose, labelledBy, className, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <CloseIcon size={18} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
