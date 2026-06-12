import { useMemo } from 'react'
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

  return (
    <div className="meal-modal-overlay" onClick={onClose}>
      <div className="meal-modal" onClick={e => e.stopPropagation()}>
        <div className="meal-modal-header">
          <div>
            <span className="meal-modal-label">Elegir comida</span>
            <h3>{formatDayTitle(day)}</h3>
            <p>{employeeName}</p>
          </div>
          <button type="button" className="meal-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="meal-modal-options">
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
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`meal-modal-option ${isSelected ? 'meal-modal-option-selected' : ''}`}
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
