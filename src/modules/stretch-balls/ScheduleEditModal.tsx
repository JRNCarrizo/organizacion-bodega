import { useEffect, useMemo, useState } from 'react'
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
  onSaved: () => void
}

function getDepotPersonIds(day: StretchScheduleDay): { depot1Id: number; depot2Id: number } {
  const depot1Id = day.depot1_employee_id
  const depot2Id = day.depot1_employee_id === day.employee1_id ? day.employee2_id : day.employee1_id
  return { depot1Id, depot2Id }
}

function buildRows(schedule: StretchScheduleDay[], assignments: StretchAssignment[]): EditRow[] {
  const confirmedDates = new Set(
    assignments.filter(a => a.balls_count > 0).map(a => a.date)
  )

  return schedule.map(day => {
    const { depot1Id, depot2Id } = getDepotPersonIds(day)
    return {
      date: day.date,
      depot1EmployeeId: depot1Id,
      depot2EmployeeId: depot2Id,
      locked: confirmedDates.has(day.date)
    }
  })
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return format(date, "EEE d MMM", { locale: es })
}

export default function ScheduleEditModal({
  schedule,
  assignments,
  employees,
  depotSettings,
  onClose,
  onSaved
}: Props) {
  const initialRows = useMemo(() => buildRows(schedule, assignments), [schedule, assignments])
  const [rows, setRows] = useState<EditRow[]>(initialRows)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  const depot1Label = getDepotName(1, depotSettings)
  const depot2Label = getDepotName(2, depotSettings)

  const hasChanges = rows.some((row, index) => {
    const initial = initialRows[index]
    if (!initial || row.locked) return false
    return (
      row.depot1EmployeeId !== initial.depot1EmployeeId ||
      row.depot2EmployeeId !== initial.depot2EmployeeId
    )
  })

  const updateRow = (date: string, patch: Partial<Pick<EditRow, 'depot1EmployeeId' | 'depot2EmployeeId'>>) => {
    setRows(current =>
      current.map(row => (row.date === date ? { ...row, ...patch } : row))
    )
    setError('')
  }

  const swapDepots = (date: string) => {
    setRows(current =>
      current.map(row => {
        if (row.date !== date || row.locked) return row
        return {
          ...row,
          depot1EmployeeId: row.depot2EmployeeId,
          depot2EmployeeId: row.depot1EmployeeId
        }
      })
    )
    setError('')
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      let savedCount = 0
      let failedCount = 0

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const initial = initialRows[i]
        if (!initial || row.locked) continue

        const changed =
          row.depot1EmployeeId !== initial.depot1EmployeeId ||
          row.depot2EmployeeId !== initial.depot2EmployeeId

        if (!changed) continue

        if (row.depot1EmployeeId === row.depot2EmployeeId) {
          setError(`El ${formatDateLabel(row.date)} tiene la misma persona en ambos depósitos.`)
          setSaving(false)
          return
        }

        const ok = await window.api.stretch.saveScheduleDay(
          row.date,
          row.depot1EmployeeId,
          row.depot2EmployeeId,
          row.depot1EmployeeId
        )

        if (ok) savedCount++
        else failedCount++
      }

      if (failedCount > 0 && savedCount === 0) {
        setError('No se pudieron guardar los cambios. Los días con confirmaciones no se pueden editar.')
      } else if (failedCount > 0) {
        setError(`Se guardaron ${savedCount} turnos. ${failedCount} no se pudieron editar (confirmados).`)
        onSaved()
      } else if (savedCount > 0) {
        onSaved()
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

  return (
    <div className="meal-modal-overlay" onClick={() => !saving && onClose()}>
      <div
        className="meal-modal schedule-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-edit-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="meal-modal-header">
          <div>
            <span className="meal-modal-label">Edición manual</span>
            <h3 id="schedule-edit-title">Turnos por depósito</h3>
            <p>
              Cambiá quién va a cada depósito. Los días con confirmaciones están bloqueados.
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
        ) : (
          <div className="schedule-edit-table-wrap">
            <table className="schedule-edit-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>{depot1Label}</th>
                  <th aria-label="Intercambiar" />
                  <th>{depot2Label}</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.date} className={row.locked ? 'schedule-edit-row-locked' : ''}>
                    <td className="schedule-edit-date">{formatDateLabel(row.date)}</td>
                    <td>
                      {row.locked ? (
                        <span className="schedule-edit-name">
                          {employees.find(e => e.id === row.depot1EmployeeId)?.name ?? '—'}
                        </span>
                      ) : (
                        <select
                          className="select schedule-edit-select"
                          value={row.depot1EmployeeId}
                          onChange={e =>
                            updateRow(row.date, { depot1EmployeeId: Number(e.target.value) })
                          }
                        >
                          {employees.map(emp => (
                            <option
                              key={emp.id}
                              value={emp.id}
                              disabled={emp.id === row.depot2EmployeeId}
                            >
                              {emp.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="schedule-edit-swap-cell">
                      {!row.locked && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm schedule-edit-swap-btn"
                          onClick={() => swapDepots(row.date)}
                          title="Intercambiar depósitos"
                        >
                          ⇄
                        </button>
                      )}
                    </td>
                    <td>
                      {row.locked ? (
                        <span className="schedule-edit-name">
                          {employees.find(e => e.id === row.depot2EmployeeId)?.name ?? '—'}
                        </span>
                      ) : (
                        <select
                          className="select schedule-edit-select"
                          value={row.depot2EmployeeId}
                          onChange={e =>
                            updateRow(row.date, { depot2EmployeeId: Number(e.target.value) })
                          }
                        >
                          {employees.map(emp => (
                            <option
                              key={emp.id}
                              value={emp.id}
                              disabled={emp.id === row.depot1EmployeeId}
                            >
                              {emp.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {row.locked ? (
                        <span className="schedule-edit-locked" title="Día confirmado">🔒</span>
                      ) : (
                        <span className="schedule-edit-editable">Editable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
