import { useEffect, useRef } from 'react'

// Accessible dialog: focus trap, Esc to close, click-outside, scroll lock.
export default function Modal({ title, onClose, children, footer, labelId = 'modal-title' }) {
  const panelRef = useRef(null)
  const lastActive = useRef(null)

  useEffect(() => {
    lastActive.current = document.activeElement
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    // focus first focusable element in the panel
    const focusables = () =>
      panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    const first = focusables()[0]
    first?.focus()

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const els = Array.from(focusables()).filter((el) => !el.disabled)
        if (!els.length) return
        const firstEl = els[0]
        const lastEl = els[els.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      lastActive.current?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel card" role="dialog" aria-modal="true" aria-labelledby={labelId} ref={panelRef}>
        <header className="modal-head">
          <h2 id={labelId}>{title}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}
