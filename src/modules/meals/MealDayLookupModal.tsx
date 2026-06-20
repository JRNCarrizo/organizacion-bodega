import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Employee, MealDayView, MealMenuSummary, MealSelectionView } from '../../types'

const CATEGORY_LABELS: Record<string, string> = {
  CARNE: 'Carne',
  POLLO: 'Pollo',
  VEGGIE: 'Veggie',
  ENSALADA: 'Ensalada',
  PASTAS: 'Pastas',
  TARTA: 'Tarta',
  OMELETTE: 'Omelette'
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatDayTitle(date: string): string {
  const formatted = format(parseISO(date), "EEEE d 'de' MMMM", { locale: es })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function shiftCalendarDay(date: string, direction: -1 | 1): string {
  const parsed = parseISO(date)
  const next = direction === 1 ? addDays(parsed, 1) : subDays(parsed, 1)
  return format(next, 'yyyy-MM-dd')
}

interface Props {
  onClose: () => void
  initialDate?: string
}

export default function MealDayLookupModal({ onClose, initialDate }: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [selectedDate, setSelectedDate] = useState(initialDate ?? todayIso())
  const [menu, setMenu] = useState<MealMenuSummary | null>(null)
  const [days, setDays] = useState<MealDayView[]>([])
  const [selections, setSelections] = useState<MealSelectionView[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const year = parseISO(selectedDate).getFullYear()
  const month = parseISO(selectedDate).getMonth() + 1
  const isToday = selectedDate === todayIso()

  useEffect(() => {
    modalRef.current?.focus()
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const [menuData, daysData, selectionsData, emps] = await Promise.all([
          window.api.meals.getMenu(year, month),
          window.api.meals.getDays(year, month),
          window.api.meals.getSelections(year, month),
          window.api.employees.getAll()
        ])
        if (cancelled) return
        setMenu(menuData)
        setDays(daysData)
        setSelections(selectionsData)
        setEmployees(emps.filter((e: Employee) => e.active === 1 && e.in_meals === 1))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [year, month])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const selectedDay = days.find(day => day.date === selectedDate)

  const selectionByEmployee = useMemo(() => {
    const map = new Map<number, MealSelectionView>()
    for (const sel of selections) {
      if (sel.date === selectedDate) {
        map.set(sel.employee_id, sel)
      }
    }
    return map
  }, [selections, selectedDate])

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return employees
    return employees.filter(emp => emp.name.toLowerCase().includes(query))
  }, [employees, search])

  const chosenCount = employees.filter(emp => selectionByEmployee.has(emp.id)).length

  const goToDay = (direction: -1 | 1) => {
    setSelectedDate(current => shiftCalendarDay(current, direction))
  }

  const dayMeta = loading
    ? 'Cargando...'
    : !menu
      ? 'Sin menú importado este mes'
      : !selectedDay
        ? 'Sin menú este día'
        : `${chosenCount}/${employees.length} con pedido`

  return (
    <div className="meal-modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="meal-modal meal-lookup-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Consulta de comidas del día"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="meal-modal-header meal-lookup-header">
          <div>
            <span className="meal-modal-label">Consulta rápida</span>
            <h3>¿Qué comemos?</h3>
            <p>Platos elegidos por empleado para un día del menú.</p>
          </div>
          <button type="button" className="meal-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="meal-lookup-controls">
          <div className="meal-lookup-day-nav">
            <button
              type="button"
              className="meal-lookup-nav-btn"
              onClick={() => goToDay(-1)}
              disabled={loading}
              aria-label="Día anterior"
            >
              ‹
            </button>

            <div className="meal-lookup-day-info">
              <div className="meal-lookup-day-title-row">
                <span className="meal-lookup-day-title">{formatDayTitle(selectedDate)}</span>
                {isToday && <span className="meal-lookup-today-badge">Hoy</span>}
              </div>
              <span className={`meal-lookup-day-meta ${menu && selectedDay && !loading ? 'meal-lookup-day-meta-count' : ''}`}>
                {dayMeta}
              </span>
            </div>

            <button
              type="button"
              className="meal-lookup-nav-btn"
              onClick={() => goToDay(1)}
              disabled={loading}
              aria-label="Día siguiente"
            >
              ›
            </button>

            <button
              type="button"
              className={`meal-lookup-today-btn ${isToday ? 'meal-lookup-today-btn-active' : ''}`}
              onClick={() => setSelectedDate(todayIso())}
              disabled={loading}
            >
              Hoy
            </button>
          </div>

          <label className="meal-lookup-search-wrap">
            <span className="meal-lookup-search-icon" aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              type="search"
              className="meal-lookup-search"
              placeholder="Buscar empleado..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Buscar empleado"
            />
          </label>
        </div>

        <div className="meal-lookup-list">
          {loading ? (
            <p className="meal-lookup-empty">Cargando pedidos...</p>
          ) : employees.length === 0 ? (
            <p className="meal-lookup-empty">No hay empleados activos en el módulo de comidas.</p>
          ) : !menu ? (
            <p className="meal-lookup-empty">Importá el PDF del catering para consultar los pedidos del mes.</p>
          ) : filteredEmployees.length === 0 ? (
            <p className="meal-lookup-empty">Ningún empleado coincide con «{search}».</p>
          ) : (
            filteredEmployees.map(emp => {
              const selection = selectionByEmployee.get(emp.id)
              return (
                <div
                  key={emp.id}
                  className={`meal-lookup-row ${selection ? 'meal-lookup-row-done' : 'meal-lookup-row-pending'}`}
                >
                  <span className="meal-lookup-avatar" aria-hidden="true">
                    {getInitials(emp.name)}
                  </span>
                  <div className="meal-lookup-row-main">
                    <span className="meal-lookup-name">{emp.name}</span>
                    {selection ? (
                      <>
                        <span className={`meal-cat meal-cat-${selection.category.toLowerCase()}`}>
                          {CATEGORY_LABELS[selection.category] ?? selection.category}
                        </span>
                        {selection.description && (
                          <p className="meal-lookup-dish">{selection.description}</p>
                        )}
                      </>
                    ) : (
                      <span className="meal-lookup-pending">Sin elegir</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
