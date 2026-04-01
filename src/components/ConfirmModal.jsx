import React from 'react'

const DIALOG_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const DIALOG_BACKDROP_STYLE = {
  position: 'fixed',
  inset: 0,
  zIndex: 99999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.45)',
  backdropFilter: 'blur(4px)',
  cursor: 'default',
}

const DIALOG_CARD_STYLE = {
  background: 'var(--color-surface-primary, #fff)',
  color: 'var(--color-on-surface, #1b1b1f)',
  borderRadius: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
  padding: '32px 28px 24px',
  minWidth: 340,
  maxWidth: 420,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const DIALOG_TITLE_STYLE = { fontSize: 22, fontWeight: 700, marginBottom: 4 }
const DIALOG_BODY_STYLE = { fontSize: 15, opacity: 0.75, marginBottom: 16, lineHeight: 1.5 }
const DIALOG_ACTIONS_ROW_STYLE = { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }

export const DIALOG_BTN_SECONDARY = {
  padding: '8px 18px',
  borderRadius: 8,
  border: '1px solid var(--color-border, #d0d0d8)',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
  color: 'inherit',
}

export const DIALOG_BTN_DANGER = {
  padding: '8px 18px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-danger, #e03131)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
}

export const DIALOG_BTN_PRIMARY = {
  padding: '8px 18px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-brand, #5c7cfa)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
}

export function ConfirmModal({ open, title, children, actions, onRequestClose }) {
  const titleId = React.useId()
  const panelRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return

    const getFocusable = () => {
      const root = panelRef.current
      if (!root) return []
      return [...root.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)].filter(
        (el) => el.offsetParent !== null || el.getClientRects().length > 0,
      )
    }

    const previousActive = document.activeElement

    const focusFirst = () => {
      const list = getFocusable()
      const target = list[0]
      if (target) target.focus()
    }

    const id = requestAnimationFrame(focusFirst)

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onRequestClose()
        return
      }
      if (e.key !== 'Tab') return

      const list = getFocusable()
      if (list.length === 0) return

      const first = list[0]
      const last = list[list.length - 1]
      const panel = panelRef.current
      const active = document.activeElement
      const inside = panel && active && panel.contains(active)

      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (!inside || active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('keydown', onKeyDown, true)
      if (
        previousActive &&
        typeof previousActive.focus === 'function' &&
        document.body.contains(previousActive)
      ) {
        previousActive.focus()
      }
    }
  }, [open, onRequestClose])

  if (!open) return null

  return (
    <div
      style={DIALOG_BACKDROP_STYLE}
      role="presentation"
      onClick={onRequestClose}
    >
      <div
        ref={panelRef}
        style={DIALOG_CARD_STYLE}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div id={titleId} style={DIALOG_TITLE_STYLE}>{title}</div>
        <div style={DIALOG_BODY_STYLE}>{children}</div>
        <div style={DIALOG_ACTIONS_ROW_STYLE}>{actions}</div>
      </div>
    </div>
  )
}
