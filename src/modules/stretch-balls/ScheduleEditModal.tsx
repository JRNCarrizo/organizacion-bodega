import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { StretchScheduleDay, StretchAssignment, Employee, DepotSettings } from '../../types'
import { getDepotName } from '../../utils/depot'

interface EditRow {
  date: string
  depot1EmployeeId: number
  depot2EmployeeId: number
  locked: boolean
}

interface Props {
  schedule: StretchScheduleDay[]
  assignments: StretchAssignment[]
  employees: Employee[]
  depotSettings: DepotSettings
  onClose: () => void
  onSaved: () => void | Promise<void>
}

type ActiveField = 'nav' | 'depot1' | 'depot2'
type OpenPicker = 1 | 2 | null

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function buildRows(schedule: StretchScheduleDay[], assignments: StretchAssignment[]): EditRow[] {
  const confirmedDates = new Set(
    assignments.filter(a => a.balls_count > 0).map(a => a.date)
  )

  return schedule.map(day => {
    const dayAssignments = assignments.filter(a => a.date === day.date)
    const depot1Assignment = dayAssignments.find(a => a.depot === 1)
    const depot2Assignment = dayAssignments.find(a => a.depot === 2)

    const depot1EmployeeId = depot1Assignment?.employee_id ?? day.depot1_employee_id
    let depot2EmployeeId = depot2Assignment?.employee_id ?? 0

    if (!depot2EmployeeId) {
      depot2EmployeeId = day.employee2_id || day.employee1_id
    }

    return {
      date: day.date,
      depot1EmployeeId,
      depot2EmployeeId,
      locked: confirmedDates.has(day.date)
    }
  })
}

function getInitialDayIndex(rows: EditRow[]): number {
  if (rows.length === 0) return 0

  const today = todayIso()
  const todayIdx = rows.findIndex(row => row.date === today)
  if (todayIdx >= 0) return todayIdx

  const nextIdx = rows.findIndex(row => row.date > today)
  if (nextIdx >= 0) return nextIdx

  return rows.length - 1
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return format(date, "EEEE d 'de' MMMM", { locale: es })
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const formatted = format(date, "EEE d MMM", { locale: es })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function getPickerOptions(
  employees: Employee[],
  depot: 1 | 2,
  row: EditRow
): Employee[] {
  const excludeId = depot === 1 ? row.depot2EmployeeId : row.depot1EmployeeId
  return employees.filter(emp => emp.id !== excludeId)
}

interface EmployeePickerFieldProps {
  label: string
  value: number
  employees: Employee[]
  options: Employee[]
  disabled: boolean
  isFocused: boolean
  isOpen: boolean
  focusedOptionIndex: number
  optionRefs: MutableRefObject<(HTMLButtonElement | null)[]>
  onOpen: () => void
  onSelect: (employeeId: number) => void
}

function EmployeePickerField({
  label,
  value,
  employees,
  options,
  disabled,
  isFocused,
  isOpen,
  focusedOptionIndex,
  optionRefs,
  onOpen,
  onSelect
}: EmployeePickerFieldProps) {
  const selectedName = employees.find(e => e.id === value)?.name ?? '—'

  return (
    <div
      className={[
        'schedule-edit-depot-field',
        isFocused ? 'schedule-edit-depot-field--focused' : ''
      ].filter(Boolean).join(' ')}
    >
      <span className="schedule-edit-depot-label">{label}</span>
      {disabled ? (
        <span className="schedule-edit-name">{selectedName}</span>
      ) : (
        <div className="schedule-edit-picker">
          <button
            type="button"
            className={[
              'schedule-edit-picker-trigger',
              isOpen ? 'schedule-edit-picker-trigger--open' : '',
              isFocused ? 'schedule-edit-picker-trigger--focused' : ''
            ].filter(Boolean).join(' ')}
            onClick={onOpen}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <span className="schedule-edit-picker-value">{selectedName}</span>
            <span className="schedule-edit-picker-chevron" aria-hidden="true">▾</span>
          </button>
          {isOpen && (
            <div className="schedule-edit-picker-list" role="listbox" aria-label={label}>
              {options.map((emp, index) => (
                <button
                  key={emp.id}
                  ref={el => { optionRefs.current[index] = el }}
                  type="button"
                  role="option"
                  aria-selected={emp.id === value}
                  className={[
                    'schedule-edit-picker-option',
                    index === focusedOptionIndex ? 'schedule-edit-picker-option--focused' : '',
                    emp.id === value ? 'schedule-edit-picker-option--selected' : ''
                  ].filter(Boolean).join(' ')}
                  onClick={() => onSelect(emp.id)}
                >
                  {emp.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ScheduleEditModal({
  schedule,
  assignments,
  employees,
  depotSettings,
  onClose,
  onSaved
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const initialRows = useMemo(() => buildRows(schedule, assignments), [schedule, assignments])
  const [rows, setRows] = useState<EditRow[]>(initialRows)
  const [dayIndex, setDayIndex] = useState(() => getInitialDayIndex(initialRows))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeField, setActiveField] = useState<ActiveField>('nav')
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null)
  const [pickerIndex, setPickerIndex] = useState(0)

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  useEffect(() => {
    modalRef.current?.focus()
  }, [])

  const row = rows[dayIndex]

  const closePicker = useCallback(() => {
    setOpenPicker(null)
  }, [])

  const openPickerFor = useCallback((depot: 1 | 2, currentRow: EditRow) => {
    const options = getPickerOptions(employees, depot, currentRow)
    const currentId = depot === 1 ? currentRow.depot1EmployeeId : currentRow.depot2EmployeeId
    const idx = Math.max(0, options.findIndex(emp => emp.id === currentId))
    optionRefs.current = []
    setPickerIndex(idx)
    setOpenPicker(depot)
    setActiveField(depot === 1 ? 'depot1' : 'depot2')
  }, [employees])

  useEffect(() => {
    closePicker()
  }, [dayIndex, closePicker])

  useEffect(() => {
    if (openPicker === null) return
    optionRefs.current[pickerIndex]?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [openPicker, pickerIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (saving || !row) return

      if (openPicker !== null) {
        const options = getPickerOptions(employees, openPicker, row)

        switch (event.key) {
          case 'Escape':
            event.preventDefault()
            closePicker()
            return
          case 'ArrowDown':
            event.preventDefault()
            setPickerIndex(i => (i < options.length - 1 ? i + 1 : i))
            return
          case 'ArrowUp':
            event.preventDefault()
            setPickerIndex(i => (i > 0 ? i - 1 : i))
            return
          case 'Enter':
            event.preventDefault()
            if (options[pickerIndex]) {
              updateDepotRef.current(row.date, openPicker, options[pickerIndex].id)
              closePicker()
            }
            return
        }
        return
      }

      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          onClose()
          return
        case 'ArrowLeft':
          event.preventDefault()
          goToDayRef.current(-1)
          setActiveField('nav')
          return
        case 'ArrowRight':
          event.preventDefault()
          goToDayRef.current(1)
          setActiveField('nav')
          return
        case 'ArrowDown':
          event.preventDefault()
          if (row.locked) return
          if (activeField === 'nav') setActiveField('depot1')
          else if (activeField === 'depot1') setActiveField('depot2')
          return
        case 'ArrowUp':
          event.preventDefault()
          if (activeField === 'depot2') setActiveField('depot1')
          else if (activeField === 'depot1') setActiveField('nav')
          return
        case 'Enter':
          if (row.locked) return
          if (activeField === 'depot1') {
            event.preventDefault()
            openPickerFor(1, row)
          } else if (activeField === 'depot2') {
            event.preventDefault()
            openPickerFor(2, row)
          }
          return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    saving,
    row,
    openPicker,
    pickerIndex,
    activeField,
    employees,
    closePicker,
    onClose,
    openPickerFor
  ])

  const depot1Label = getDepotName(1, depotSettings)
  const depot2Label = getDepotName(2, depotSettings)
  const isToday = row?.date === todayIso()
  const initialRow = initialRows[dayIndex]
  const currentDayDirty = row && initialRow && !row.locked && (
    row.depot1EmployeeId !== initialRow.depot1EmployeeId ||
    row.depot2EmployeeId !== initialRow.depot2EmployeeId
  )

  const hasChanges = rows.some((currentRow, index) => {
    const initial = initialRows[index]
    if (!initial || currentRow.locked) return false
    return (
      currentRow.depot1EmployeeId !== initial.depot1EmployeeId ||
      currentRow.depot2EmployeeId !== initial.depot2EmployeeId
    )
  })

  const updateDepot = (
    date: string,
    depot: 1 | 2,
    newEmployeeId: number
  ) => {
    setRows(current =>
      current.map(currentRow => {
        if (currentRow.date !== date || currentRow.locked) return currentRow

        if (depot === 1) {
          if (newEmployeeId === currentRow.depot1EmployeeId) return currentRow
          return { ...currentRow, depot1EmployeeId: newEmployeeId }
        }

        if (newEmployeeId === currentRow.depot2EmployeeId) return currentRow
        return { ...currentRow, depot2EmployeeId: newEmployeeId }
      })
    )
    setError('')
  }

  const updateDepotRef = useRef(updateDepot)
  updateDepotRef.current = updateDepot

  const swapDepots = (date: string) => {
    setRows(current =>
      current.map(currentRow => {
        if (currentRow.date !== date || currentRow.locked) return currentRow
        return {
          ...currentRow,
          depot1EmployeeId: currentRow.depot2EmployeeId,
          depot2EmployeeId: currentRow.depot1EmployeeId
        }
      })
    )
    setError('')
  }

  const goToDay = (offset: number) => {
    setDayIndex(current => {
      const next = current + offset
      if (next < 0 || next >= rows.length) return current
      return next
    })
    setError('')
  }

  const goToDayRef = useRef(goToDay)
  goToDayRef.current = goToDay

  const goToToday = () => {
    setDayIndex(getInitialDayIndex(rows))
    setActiveField('nav')
    setError('')
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      let savedCount = 0
      let failedCount = 0

      for (let i = 0; i < rows.length; i++) {
        const currentRow = rows[i]
        const initial = initialRows[i]
        if (!initial || currentRow.locked) continue

        const changed =
          currentRow.depot1EmployeeId !== initial.depot1EmployeeId ||
          currentRow.depot2EmployeeId !== initial.depot2EmployeeId

        if (!changed) continue

        if (currentRow.depot1EmployeeId === currentRow.depot2EmployeeId) {
          setError(`El ${formatDateShort(currentRow.date)} tiene la misma persona en ambos depósitos.`)
          setDayIndex(i)
          setActiveField('nav')
          setSaving(false)
          return
        }

        const ok = await window.api.stretch.saveScheduleDay(
          currentRow.date,
          currentRow.depot1EmployeeId,
          currentRow.depot2EmployeeId,
          currentRow.depot1EmployeeId
        )

        if (ok) savedCount++
        else failedCount++
      }

      if (failedCount > 0 && savedCount === 0) {
        setError('No se pudieron guardar los cambios. Los días con confirmaciones no se pueden editar.')
      } else if (failedCount > 0) {
        setError(`Se guardaron ${savedCount} turnos. ${failedCount} no se pudieron editar (confirmados).`)
        await onSaved()
      } else if (savedCount > 0) {
        await onSaved()
        onClose()
      } else {
        onClose()
      }
    } catch (err) {
      console.error(err)
      setError('Error al guardar los turnos. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const depot1Options = row ? getPickerOptions(employees, 1, row) : employees
  const depot2Options = row ? getPickerOptions(employees, 2, row) : employees

  return (
    <div className="meal-modal-overlay" onClick={() => !saving && onClose()}>
      <div
        ref={modalRef}
        className="meal-modal schedule-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-edit-title"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="meal-modal-header">
          <div>
            <span className="meal-modal-label">Edición manual</span>
            <h3 id="schedule-edit-title">Turnos por depósito</h3>
            <p>
              Elegí quién va a cada depósito y apretá <strong>Guardar cambios</strong> para aplicarlo en el calendario.
            </p>
            <p className="meal-modal-kbd-hint">
              ← → día · ↓ campos · Enter abrir lista · ↑↓ elegir · Esc cierra lista o modal
            </p>
          </div>
          <button
            type="button"
            className="meal-modal-close"
            onClick={() => !saving && onClose()}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {error && <div className="alert alert-warning schedule-edit-alert">{error}</div>}

        {rows.length === 0 ? (
          <div className="schedule-edit-empty">
            <p>No hay turnos para editar en este mes.</p>
          </div>
        ) : row && (
          <>
            <div
              className={[
                'schedule-edit-day-nav',
                activeField === 'nav' && openPicker === null ? 'schedule-edit-day-nav--focused' : ''
              ].filter(Boolean).join(' ')}
            >
              <button
                type="button"
                className="meal-lookup-nav-btn"
                onClick={() => {
                  goToDay(-1)
                  setActiveField('nav')
                }}
                disabled={saving || dayIndex <= 0}
                aria-label="Día anterior"
              >
                ‹
              </button>

              <div className="schedule-edit-day-info">
                <div className="schedule-edit-day-title-row">
                  <span className="schedule-edit-day-title">{formatDateLabel(row.date)}</span>
                  {isToday && <span className="meal-lookup-today-badge">Hoy</span>}
                </div>
                <span className="schedule-edit-day-meta">
                  Día {dayIndex + 1} de {rows.length}
                  {row.locked ? ' · Confirmado' : currentDayDirty ? ' · Sin guardar' : ' · Editable'}
                </span>
              </div>

              <button
                type="button"
                className="meal-lookup-nav-btn"
                onClick={() => {
                  goToDay(1)
                  setActiveField('nav')
                }}
                disabled={saving || dayIndex >= rows.length - 1}
                aria-label="Día siguiente"
              >
                ›
              </button>

              <button
                type="button"
                className={`meal-lookup-today-btn ${isToday ? 'meal-lookup-today-btn-active' : ''}`}
                onClick={goToToday}
                disabled={saving}
              >
                Hoy
              </button>
            </div>

            <div className={`schedule-edit-day-panel ${row.locked ? 'schedule-edit-day-panel-locked' : ''}`}>
              {row.locked ? (
                <p className="schedule-edit-locked-note">
                  Este día ya fue confirmado y no se puede modificar.
                </p>
              ) : null}

              <div className="schedule-edit-depot-row">
                <EmployeePickerField
                  label={depot1Label}
                  value={row.depot1EmployeeId}
                  employees={employees}
                  options={depot1Options}
                  disabled={row.locked}
                  isFocused={activeField === 'depot1' && openPicker === null}
                  isOpen={openPicker === 1}
                  focusedOptionIndex={pickerIndex}
                  optionRefs={optionRefs}
                  onOpen={() => {
                    setActiveField('depot1')
                    openPickerFor(1, row)
                  }}
                  onSelect={id => {
                    updateDepot(row.date, 1, id)
                    closePicker()
                  }}
                />

                {!row.locked && (
                  <button
                    type="button"
                    className="btn btn-secondary schedule-edit-swap-btn"
                    onClick={() => swapDepots(row.date)}
                    title="Intercambiar depósitos"
                    aria-label="Intercambiar depósitos"
                  >
                    ⇄
                  </button>
                )}

                <EmployeePickerField
                  label={depot2Label}
                  value={row.depot2EmployeeId}
                  employees={employees}
                  options={depot2Options}
                  disabled={row.locked}
                  isFocused={activeField === 'depot2' && openPicker === null}
                  isOpen={openPicker === 2}
                  focusedOptionIndex={pickerIndex}
                  optionRefs={optionRefs}
                  onOpen={() => {
                    setActiveField('depot2')
                    openPickerFor(2, row)
                  }}
                  onSelect={id => {
                    updateDepot(row.date, 2, id)
                    closePicker()
                  }}
                />
              </div>

              {row.locked && (
                <span className="schedule-edit-locked-badge" title="Día confirmado">🔒 Confirmado</span>
              )}
            </div>
          </>
        )}

        <div className="schedule-edit-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
