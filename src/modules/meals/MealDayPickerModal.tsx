import { useEffect, useMemo, useRef, useState } from 'react'
import type { MealDayView } from '../../types'

const CATEGORY_LABELS: Record<string, string> = {
  CARNE: 'Carne',
  POLLO: 'Pollo',
  VEGGIE: 'Veggie',
  ENSALADA: 'Ensalada',
  PASTAS: 'Pastas',
  TARTA: 'Tarta',
  OMELETTE: 'Omelette'
}

const CATEGORY_ORDER = ['CARNE', 'POLLO', 'VEGGIE', 'ENSALADA', 'PASTAS', 'TARTA', 'OMELETTE']

interface Props {
  day: MealDayView
  employeeName: string
  selectedOptionId: number
  onSelect: (optionId: number) => void
  onClose: () => void
}

function formatDayTitle(day: MealDayView): string {
  const [, , d] = day.date.split('-')
  const name = day.weekday.charAt(0) + day.weekday.slice(1).toLowerCase()
  return `${name} ${d}`
}

export default function MealDayPickerModal({
  day,
  employeeName,
  selectedOptionId,
  onSelect,
  onClose
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const focusedIndexRef = useRef(0)
  const keyboardNavRef = useRef(true)

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, MealDayView['options']>()
    for (const opt of day.options) {
      const list = groups.get(opt.category) ?? []
      list.push(opt)
      groups.set(opt.category, list)
    }

    return CATEGORY_ORDER
      .filter(category => groups.has(category))
      .map(category => ({
        category,
        options: (groups.get(category) ?? []).sort((a, b) => a.option_index - b.option_index)
      }))
  }, [day.options])

  const flatOptions = useMemo(
    () => groupedOptions.flatMap(group => group.options),
    [groupedOptions]
  )

  const initialIndex = useMemo(() => {
    const idx = flatOptions.findIndex(opt => opt.id === selectedOptionId)
    return idx >= 0 ? idx : 0
  }, [flatOptions, selectedOptionId])

  const [focusedIndex, setFocusedIndex] = useState(initialIndex)

  useEffect(() => {
    focusedIndexRef.current = focusedIndex
  }, [focusedIndex])

  useEffect(() => {
    setFocusedIndex(initialIndex)
    focusedIndexRef.current = initialIndex
  }, [day.id, initialIndex])

  useEffect(() => {
    keyboardNavRef.current = true
    modalRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!keyboardNavRef.current) return
    optionRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [focusedIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (flatOptions.length === 0) return

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          keyboardNavRef.current = true
          setFocusedIndex(i => (i < flatOptions.length - 1 ? i + 1 : i))
          break
        case 'ArrowUp':
          event.preventDefault()
          keyboardNavRef.current = true
          setFocusedIndex(i => (i > 0 ? i - 1 : i))
          break
        case 'Enter':
          event.preventDefault()
          onSelect(flatOptions[focusedIndexRef.current].id)
          break
        case 'Escape':
          event.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [flatOptions, onSelect, onClose])

  let flatIndex = 0

  return (
    <div className="meal-modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="meal-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Elegir comida para ${formatDayTitle(day)}`}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="meal-modal-header">
          <div>
            <span className="meal-modal-label">Elegir comida</span>
            <h3>{formatDayTitle(day)}</h3>
            <p>{employeeName}</p>
            <p className="meal-modal-kbd-hint">↑↓ navegar · Enter elegir · Esc cerrar</p>
          </div>
          <button type="button" className="meal-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div
          className="meal-modal-options"
          onMouseMove={() => { keyboardNavRef.current = false }}
        >
          {groupedOptions.map(group => (
            <div key={group.category} className="meal-modal-group">
              <div className="meal-modal-group-title">
                <span className={`meal-cat meal-cat-${group.category.toLowerCase()}`}>
                  {CATEGORY_LABELS[group.category] ?? group.category}
                </span>
                {group.options.length > 1 && (
                  <span className="meal-modal-group-hint">{group.options.length} opciones</span>
                )}
              </div>

              <div className="meal-modal-group-list">
                {group.options.map(opt => {
                  const isSelected = selectedOptionId === opt.id
                  const currentIndex = flatIndex
                  flatIndex += 1
                  const isFocused = currentIndex === focusedIndex

                  return (
                    <button
                      key={opt.id}
                      ref={el => { optionRefs.current[currentIndex] = el }}
                      type="button"
                      className={[
                        'meal-modal-option',
                        isSelected ? 'meal-modal-option-selected' : '',
                        isFocused ? 'meal-modal-option-focused' : ''
                      ].filter(Boolean).join(' ')}
                      onClick={() => onSelect(opt.id)}
                    >
                      {group.options.length > 1 && (
                        <span className="meal-modal-option-index">Opción {opt.option_index}</span>
                      )}
                      <span className="meal-modal-option-text">{opt.description}</span>
                      {isSelected && <span className="meal-modal-option-check">✓ Elegido</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
