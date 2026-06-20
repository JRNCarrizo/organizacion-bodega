import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  title: string
  ariaLabel: string
  children: ReactNode
}

export default function SettingsInfoButton({ title, ariaLabel, children }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  return (
    <div className="schedule-help-wrap app-settings-help-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`schedule-help-btn ${open ? 'schedule-help-btn-open' : ''}`}
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        !
      </button>
      {open && (
        <div className="schedule-help-bubble stretch-settings-help-bubble" role="dialog" aria-label={ariaLabel}>
          <p className="schedule-help-bubble-title">{title}</p>
          <div className="app-settings-help-content">{children}</div>
        </div>
      )}
    </div>
  )
}
