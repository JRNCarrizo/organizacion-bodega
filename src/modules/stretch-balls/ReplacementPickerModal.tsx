import { useEffect, useRef, useState } from 'react'
import type { Employee, DepotSettings } from '../../types'
import { getDepotName, getDepotWorkloadLabel } from '../../utils/depot'

interface Props {
  dateLabel: string
  absentEmployeeName: string
  depot: number
  depotSettings: DepotSettings
  candidates: Employee[]
  busy: boolean
  onSelect: (employeeId: number) => void
  onClose: () => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

export default function ReplacementPickerModal({
  dateLabel,
  absentEmployeeName,
  depot,
  depotSettings,
  candidates,
  busy,
  onSelect,
  onClose
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const keyboardNavRef = useRef(true)
  const [focusedIndex, setFocusedIndex] = useState(0)

  useEffect(() => {
    modalRef.current?.focus()
    setFocusedIndex(0)
  }, [])

  useEffect(() => {
    if (!keyboardNavRef.current) return
    optionRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [focusedIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (busy) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (candidates.length === 0) return

      keyboardNavRef.current = true

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setFocusedIndex(i => (i < candidates.length - 1 ? i + 1 : i))
          break
        case 'ArrowUp':
          event.preventDefault()
          setFocusedIndex(i => (i > 0 ? i - 1 : i))
          break
        case 'Enter':
          event.preventDefault()
          onSelect(candidates[focusedIndex].id)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, candidates, focusedIndex, onClose, onSelect])

  const isHeavy = depot === depotSettings.heavyDepot
  const depotName = getDepotName(depot, depotSettings)

  return (
    <div className="meal-modal-overlay" onClick={() => !busy && onClose()}>
      <div
        ref={modalRef}
        className="meal-modal replacement-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Elegir reemplazo"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="meal-modal-header">
          <div>
            <span className="meal-modal-label">Reemplazo de turno</span>
            <h3>{dateLabel}</h3>
            <p>
              Quién cubre a <strong>{absentEmployeeName}</strong> en{' '}
              <span className={`depot-badge ${isHeavy ? 'depot-heavy' : 'depot-light'}`}>
                {depotName} · {getDepotWorkloadLabel(depot, depotSettings)}
              </span>
            </p>
            {candidates.length > 0 && (
              <p className="meal-modal-kbd-hint">↑↓ navegar · Enter elegir · Esc cancelar</p>
            )}
          </div>
          <button
            type="button"
            className="meal-modal-close"
            onClick={() => !busy && onClose()}
            aria-label="Cerrar"
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <div
          ref={listRef}
          className="replacement-picker-list"
          onMouseMove={() => { keyboardNavRef.current = false }}
        >
          {candidates.length === 0 ? (
            <p className="replacement-picker-empty">
              No hay empleados disponibles para reemplazar en este turno.
            </p>
          ) : (
            candidates.map((emp, index) => {
              const isFocused = index === focusedIndex
              return (
                <button
                  key={emp.id}
                  ref={el => { optionRefs.current[index] = el }}
                  type="button"
                  className={[
                    'meal-modal-option',
                    'replacement-picker-option',
                    isFocused ? 'meal-modal-option-focused' : ''
                  ].filter(Boolean).join(' ')}
                  onClick={() => onSelect(emp.id)}
                  disabled={busy}
                >
                  <span className="replacement-picker-avatar" aria-hidden="true">
                    {getInitials(emp.name)}
                  </span>
                  <span className="meal-modal-option-text replacement-picker-name">{emp.name}</span>
                  {isFocused && (
                    <span className="replacement-picker-enter-hint">Enter para confirmar</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {candidates.length > 0 && (
          <div className="replacement-picker-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSelect(candidates[focusedIndex].id)}
              disabled={busy}
            >
              {busy ? 'Aplicando...' : `Confirmar: ${candidates[focusedIndex]?.name ?? ''}`}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
