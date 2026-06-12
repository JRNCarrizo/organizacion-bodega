import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Employee, MealDayView, MealMenuSummary, MealSelectionView } from '../../types'
import { format, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAppRefresh } from '../../hooks/useAppRefresh'
import MealDayPickerModal from './MealDayPickerModal'

const CATEGORY_LABELS: Record<string, string> = {
  CARNE: 'Carne',
  POLLO: 'Pollo',
  VEGGIE: 'Veggie',
  ENSALADA: 'Ensalada',
  PASTAS: 'Pastas',
  TARTA: 'Tarta',
  OMELETTE: 'Omelette'
}

function capitalizeMonth(date: Date): string {
  const formatted = format(date, 'MMMM yyyy', { locale: es })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function formatDayHeader(day: MealDayView): string {
  const [, , d] = day.date.split('-')
  const shortDay = day.weekday.slice(0, 3).toLowerCase()
  return `${shortDay} ${d}`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

export default function MealsPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [menu, setMenu] = useState<MealMenuSummary | null>(null)
  const [days, setDays] = useState<MealDayView[]>([])
  const [selections, setSelections] = useState<MealSelectionView[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(0)
  const [pickerDay, setPickerDay] = useState<MealDayView | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [focusedDayIndex, setFocusedDayIndex] = useState(0)
  const [gridColumns, setGridColumns] = useState(1)
  const dayGridRef = useRef<HTMLDivElement>(null)
  const dayCardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const keyboardNavRef = useRef(true)
  const { refreshKey } = useAppRefresh()

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const load = async () => {
    const [menuData, daysData, selectionsData, emps] = await Promise.all([
      window.api.meals.getMenu(year, month),
      window.api.meals.getDays(year, month),
      window.api.meals.getSelections(year, month),
      window.api.employees.getAll()
    ])
    setMenu(menuData)
    setDays(daysData)
    setSelections(selectionsData)
    const active = emps.filter((e: Employee) => e.active === 1 && e.in_meals === 1)
    setEmployees(active)
    if (active.length > 0 && !active.some((e: Employee) => e.id === selectedEmployeeId)) {
      setSelectedEmployeeId(active[0].id)
    }
  }

  useEffect(() => { load() }, [year, month, refreshKey])

  const selectionMap = useMemo(() => {
    const map = new Map<string, MealSelectionView>()
    for (const sel of selections) {
      map.set(`${sel.employee_id}-${sel.date}`, sel)
    }
    return map
  }, [selections])

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId)

  const getEmployeeProgress = (employeeId: number) => {
    const filled = days.filter(d => selectionMap.has(`${employeeId}-${d.date}`)).length
    return { filled, total: days.length }
  }

  const selectedProgress = selectedEmployee
    ? getEmployeeProgress(selectedEmployee.id)
    : { filled: 0, total: 0 }

  const filledCount = selections.length
  const totalCells = employees.length * days.length
  const progressPct = totalCells > 0 ? Math.round((filledCount / totalCells) * 100) : 0

  const handleImport = async () => {
    setImporting(true)
    setError('')
    setMessage('')
    try {
      const result = await window.api.meals.importPdf(year, month)
      if (result.success) {
        setMessage(result.message)
        await load()
      } else if (result.message !== 'Importación cancelada.') {
        setError(result.message)
      }
    } catch {
      setError('Error al importar el PDF.')
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async (type: 'pdf' | 'excel') => {
    setExporting(type)
    setError('')
    setMessage('')
    try {
      const result = type === 'pdf'
        ? await window.api.meals.exportPdf(year, month)
        : await window.api.meals.exportExcel(year, month)
      if (result.success) {
        setMessage(result.message)
      } else if (result.message !== 'Exportación cancelada.') {
        setError(result.message)
      }
    } catch {
      setError('Error al exportar.')
    } finally {
      setExporting(null)
    }
  }

  const measureGridColumns = useCallback(() => {
    const grid = dayGridRef.current
    if (!grid || days.length === 0) {
      setGridColumns(1)
      return
    }
    const children = Array.from(grid.children) as HTMLElement[]
    if (children.length < 2) {
      setGridColumns(1)
      return
    }
    const firstTop = children[0].offsetTop
    let cols = 1
    for (let i = 1; i < children.length; i++) {
      if (children[i].offsetTop === firstTop) cols++
      else break
    }
    setGridColumns(cols)
  }, [days.length])

  useEffect(() => {
    setFocusedDayIndex(0)
  }, [selectedEmployeeId, year, month])

  useEffect(() => {
    measureGridColumns()
    window.addEventListener('resize', measureGridColumns)
    return () => window.removeEventListener('resize', measureGridColumns)
  }, [measureGridColumns, days])

  useEffect(() => {
    if (pickerDay || !keyboardNavRef.current) return
    dayCardRefs.current[focusedDayIndex]?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [focusedDayIndex, pickerDay])

  useEffect(() => {
    if (pickerDay || !selectedEmployee || days.length === 0) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

      keyboardNavRef.current = true

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault()
          setFocusedDayIndex(i => (i < days.length - 1 ? i + 1 : i))
          break
        case 'ArrowLeft':
          event.preventDefault()
          setFocusedDayIndex(i => (i > 0 ? i - 1 : i))
          break
        case 'ArrowDown': {
          event.preventDefault()
          setFocusedDayIndex(i => {
            const next = i + gridColumns
            return next < days.length ? next : i
          })
          break
        }
        case 'ArrowUp': {
          event.preventDefault()
          setFocusedDayIndex(i => {
            const next = i - gridColumns
            return next >= 0 ? next : i
          })
          break
        }
        case 'Enter':
          event.preventDefault()
          setPickerDay(days[focusedDayIndex])
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pickerDay, selectedEmployee, days, focusedDayIndex, gridColumns])

  const handleSelection = async (employeeId: number, date: string, mealOptionId: number) => {
    const dayIndex = days.findIndex(d => d.date === date)
    await window.api.meals.setSelection(year, month, employeeId, date, mealOptionId)
    await load()
    setPickerDay(null)
    if (dayIndex >= 0 && dayIndex < days.length - 1) {
      setFocusedDayIndex(dayIndex + 1)
    }
  }

  const openDayPicker = (day: MealDayView, index: number) => {
    setFocusedDayIndex(index)
    setPickerDay(day)
  }

  return (
    <div className="meals-page">
      <div className="page-header">
        <h2>Menú de Comidas</h2>
        <p>Cada empleado arma su menú del mes. Tocá un día para ver las opciones y elegir.</p>
      </div>

      <div className="meals-toolbar">
        <div className="meals-month-card">
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            aria-label="Mes anterior"
          >
            ←
          </button>
          <div className="meals-month-info">
            <span className="meals-month-label">Mes del pedido</span>
            <h3>{capitalizeMonth(currentDate)}</h3>
          </div>
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>

        <div className="meals-actions">
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? 'Importando...' : 'Importar PDF'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleExport('excel')}
            disabled={!menu || exporting !== null}
          >
            {exporting === 'excel' ? 'Exportando...' : 'Exportar Excel'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleExport('pdf')}
            disabled={!menu || exporting !== null}
          >
            {exporting === 'pdf' ? 'Exportando...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-warning">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {!menu ? (
        <div className="meals-empty">
          <span className="meals-empty-icon">🍽️</span>
          <p>Sin menú cargado para {capitalizeMonth(currentDate)}</p>
          <span>Importá el PDF que envía el catering para empezar</span>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? 'Importando...' : 'Importar PDF del catering'}
          </button>
        </div>
      ) : (
        <>
          <div className="meals-summary">
            <div className="meals-summary-card">
              <span className="meals-summary-value">{menu.day_count}</span>
              <span className="meals-summary-label">Días con menú</span>
            </div>
            <div className="meals-summary-card">
              <span className="meals-summary-value">{employees.length}</span>
              <span className="meals-summary-label">Empleados</span>
            </div>
            <div className="meals-summary-card meals-summary-progress">
              <span className="meals-summary-value">{progressPct}%</span>
              <span className="meals-summary-label">Equipo completo</span>
            </div>
            <div className="meals-summary-card">
              <span className="meals-summary-value meals-summary-file">{menu.source_filename ?? '—'}</span>
              <span className="meals-summary-label">PDF importado</span>
            </div>
          </div>

          {employees.length === 0 ? (
            <div className="alert alert-warning">
              No hay empleados activos. Cargalos en la sección Empleados del menú lateral.
            </div>
          ) : (
            <div className="meals-employee-workspace">
              <div className="meals-employee-picker">
                <span className="meals-employee-picker-label">Elegí empleado</span>
                <div className="meals-employee-list">
                  {employees.map(emp => {
                    const progress = getEmployeeProgress(emp.id)
                    const isActive = emp.id === selectedEmployeeId
                    const isComplete = progress.total > 0 && progress.filled === progress.total
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        className={`meals-employee-chip ${isActive ? 'meals-employee-chip-active' : ''} ${isComplete ? 'meals-employee-chip-done' : ''}`}
                        onClick={() => setSelectedEmployeeId(emp.id)}
                      >
                        <span className="meals-employee-chip-avatar">
                          {isComplete ? '✓' : getInitials(emp.name)}
                        </span>
                        <span className="meals-employee-chip-name">{emp.name}</span>
                        {!isComplete && (
                          <span className="meals-employee-chip-progress">
                            {progress.filled}/{progress.total}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedEmployee && (
                <div className="meals-selection-section">
                  <div className="meals-employee-panel-header">
                    <div className="meals-employee-panel-identity">
                      <span className="meals-employee-panel-avatar">{getInitials(selectedEmployee.name)}</span>
                      <div>
                        <h3>
                          Menú de {selectedEmployee.name}
                          {selectedProgress.total > 0 && selectedProgress.filled === selectedProgress.total && (
                            <span className="meals-panel-complete-badge">✓ Completo</span>
                          )}
                        </h3>
                        <p>
                          {selectedProgress.filled} de {selectedProgress.total} días elegidos
                        </p>
                      </div>
                    </div>
                    <div className="meals-employee-panel-bar">
                      <div
                        className="meals-employee-panel-bar-fill"
                        style={{
                          width: selectedProgress.total > 0
                            ? `${(selectedProgress.filled / selectedProgress.total) * 100}%`
                            : '0%'
                        }}
                      />
                    </div>
                  </div>

                  <p className="meals-kbd-hint">Flechas para moverte · Enter para elegir el día</p>

                  <div
                    className="meals-day-grid"
                    ref={dayGridRef}
                    onMouseMove={() => { keyboardNavRef.current = false }}
                  >
                    {days.map((day, index) => {
                      const selection = selectionMap.get(`${selectedEmployee.id}-${day.date}`)
                      const isFocused = index === focusedDayIndex && !pickerDay
                      return (
                        <button
                          key={day.id}
                          ref={el => { dayCardRefs.current[index] = el }}
                          type="button"
                          className={[
                            'meals-day-card',
                            'meals-day-card-clickable',
                            selection ? 'meals-day-card-done' : '',
                            isFocused ? 'meals-day-card-focused' : ''
                          ].filter(Boolean).join(' ')}
                          onClick={() => openDayPicker(day, index)}
                        >
                          <div className="meals-day-card-header">
                            <span className="meals-day-name">{formatDayHeader(day)}</span>
                            {selection ? (
                              <span className={`meal-cat meal-cat-${selection.category.toLowerCase()}`}>
                                {CATEGORY_LABELS[selection.category] ?? selection.category}
                              </span>
                            ) : (
                              <span className="meals-day-pending">Sin elegir</span>
                            )}
                          </div>
                          {selection?.description ? (
                            <p className="meals-day-dish">{selection.description}</p>
                          ) : (
                            <p className="meals-day-placeholder">Tocá para ver el menú del día</p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {pickerDay && selectedEmployee && (
        <MealDayPickerModal
          day={pickerDay}
          employeeName={selectedEmployee.name}
          selectedOptionId={selectionMap.get(`${selectedEmployee.id}-${pickerDay.date}`)?.meal_option_id ?? 0}
          onSelect={optionId => handleSelection(selectedEmployee.id, pickerDay.date, optionId)}
          onClose={() => setPickerDay(null)}
        />
      )}
    </div>
  )
}
