import { useEffect, useState, useMemo } from 'react'
import type { StretchScheduleDay, StretchAssignment, Employee, DepotSettings } from '../../types'
import { getDepotName, getDepotWorkloadLabel } from '../../utils/depot'
import { format, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import ScheduleCalendarView from './ScheduleCalendarView'

type ScheduleViewMode = 'list' | 'calendar'

interface Props {
  refreshKey: number
  onUpdate: () => void
}

interface ReplacingState {
  date: string
  absentEmployeeId: number
  depot: number
}

function getTodayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function SchedulePanel({ refreshKey, onUpdate }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [schedule, setSchedule] = useState<StretchScheduleDay[]>([])
  const [assignments, setAssignments] = useState<StretchAssignment[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [depotSettings, setDepotSettings] = useState<DepotSettings>({
    heavyDepot: 1,
    depot1Name: 'Depósito 1',
    depot2Name: 'Depósito 2'
  })
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [replacing, setReplacing] = useState<ReplacingState | null>(null)
  const [selectedReplacement, setSelectedReplacement] = useState<number>(0)
  const [showPendingDays, setShowPendingDays] = useState(false)
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('list')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const today = getTodayString()
  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth() + 1

  const isCompleted = (date: string, employeeId: number): boolean => {
    const a = assignments.find(x => x.date === date && x.employee_id === employeeId)
    return (a?.balls_count ?? 0) > 0
  }

  const isDayFullyConfirmed = (day: StretchScheduleDay): boolean => {
    const depot2Person = day.depot1_employee_id === day.employee1_id ? day.employee2_id : day.employee1_id
    return isCompleted(day.date, day.depot1_employee_id) && isCompleted(day.date, depot2Person)
  }

  const pendingPastSchedule = useMemo(() => {
    if (!isCurrentMonth) return []
    return schedule.filter(day => day.date < today && !isDayFullyConfirmed(day))
  }, [schedule, isCurrentMonth, today, assignments])

  const pendingPastDays = pendingPastSchedule.length

  const visibleSchedule = useMemo(() => {
    if (!isCurrentMonth) return schedule
    return schedule.filter(day => day.date >= today)
  }, [schedule, isCurrentMonth, today])

  useEffect(() => {
    setShowPendingDays(false)
  }, [year, month])

  const load = async () => {
    const [sched, assigns, heavy, emps] = await Promise.all([
      window.api.stretch.getSchedule(year, month),
      window.api.stretch.getAssignments(year, month),
      window.api.settings.getDepotSettings(),
      window.api.employees.getAll()
    ])
    setSchedule(sched)
    setAssignments(assigns)
    setDepotSettings(heavy)
    setEmployees(emps.filter((e: Employee) => e.active === 1 && e.in_stretch === 1))
  }

  useEffect(() => { load() }, [year, month, refreshKey])

  const handleExportPdf = async () => {
    setExporting(true)
    setError('')
    setSuccess('')
    try {
      const result = await window.api.stretch.exportPdf(year, month)
      if (result.success) {
        setSuccess(result.message)
      } else if (result.message !== 'Exportación cancelada.') {
        setError(result.message)
      }
    } catch (err) {
      setError('Error al generar el PDF.')
      console.error(err)
    } finally {
      setExporting(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    setSuccess('')
    try {
      const result = await window.api.stretch.generateSchedule(year, month)
      if (!result || result.length === 0) {
        setError('No se pudieron generar turnos. Verificá que haya al menos 2 empleados activos.')
      } else {
        setSuccess('Turnos del mes generados. La rotación continúa desde el mes anterior.')
      }
      await load()
      onUpdate()
    } catch (err) {
      setError('Error al generar turnos. Intentá de nuevo.')
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  const handleMarkComplete = async (
    date: string,
    employeeId: number,
    depot: number
  ) => {
    if (isCompleted(date, employeeId)) return

    const ok = await window.api.stretch.recordBalls(date, employeeId, depot, 1)
    if (!ok) {
      setError('Este turno ya fue confirmado y no se puede desmarcar.')
      return
    }
    await load()
    onUpdate()
  }

  const handleReplace = async () => {
    if (!replacing || !selectedReplacement) return
    setError('')
    setSuccess('')

    const result = await window.api.stretch.replaceAbsent(
      replacing.date,
      replacing.absentEmployeeId,
      selectedReplacement
    )

    if (result.success) {
      setSuccess(result.message)
      setReplacing(null)
      setSelectedReplacement(0)
      await load()
      onUpdate()
    } else {
      setError(result.message)
    }
  }

  const hasConfirmedOnDay = (date: string): boolean => {
    return assignments.some(a => a.date === date && a.balls_count > 0)
  }

  const getAssignment = (date: string, employeeId: number): StretchAssignment | undefined => {
    return assignments.find(x => x.date === date && x.employee_id === employeeId)
  }

  const getAvailableReplacements = (date: string, absentId: number): Employee[] => {
    const onDay = assignments.filter(a => a.date === date).map(a => a.employee_id)
    return employees.filter(e => e.id !== absentId && !onDay.includes(e.id))
  }

  const formatDateParts = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return {
      weekday: format(date, 'EEE', { locale: es }),
      day: format(date, 'd'),
      month: format(date, 'MMM', { locale: es })
    }
  }

  const depotLabel = (depot: number) => {
    const isHeavy = depot === depotSettings.heavyDepot
    return (
      <span className={`depot-badge ${isHeavy ? 'depot-heavy' : 'depot-light'}`}>
        {getDepotName(depot, depotSettings)} · {getDepotWorkloadLabel(depot, depotSettings)}
      </span>
    )
  }

  const renderPerson = (
    date: string,
    employeeId: number,
    employeeName: string,
    depot: number
  ) => {
    const assignment = getAssignment(date, employeeId)
    const completed = isCompleted(date, employeeId)
    const isReplacement = assignment?.is_replacement === 1
    const available = getAvailableReplacements(date, employeeId)
    const isReplacingThis = replacing?.date === date && replacing?.absentEmployeeId === employeeId

    return (
      <div className={`person-card ${completed ? 'person-card-done' : ''}`}>
        <div className="person-card-header">
          {depotLabel(depot)}
        </div>

        <div className="person-card-body">
          <span className="schedule-employee-name">{employeeName}</span>
          {isReplacement && assignment?.original_employee_name && (
            <span className="replacement-badge">
              Cubre a {assignment.original_employee_name}
            </span>
          )}
        </div>

        <div className="person-card-footer">
          <label className={`confirm-check ${completed ? 'confirm-check-locked' : ''}`}>
            <input
              type="checkbox"
              checked={completed}
              disabled={completed}
              onChange={() => handleMarkComplete(date, employeeId, depot)}
            />
            <span>{completed ? '✓ Confirmado' : 'Marcar hecho'}</span>
          </label>

          {!isReplacement && !completed && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setReplacing({ date, absentEmployeeId: employeeId, depot })
                setSelectedReplacement(0)
                setSuccess('')
                setError('')
              }}
            >
              Faltó
            </button>
          )}
        </div>

        {isReplacingThis && (
          <div className="replace-panel">
            <span className="replace-panel-label">Elegir reemplazo:</span>
            <select
              className="select"
              value={selectedReplacement}
              onChange={e => setSelectedReplacement(Number(e.target.value))}
            >
              <option value={0}>Seleccionar...</option>
              {available.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            <button
              className="btn btn-primary btn-sm"
              disabled={!selectedReplacement}
              onClick={handleReplace}
            >
              Confirmar
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setReplacing(null)}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderDayCard = (day: StretchScheduleDay) => {
    const depot1Person = day.depot1_employee_id
    const depot2Person = day.depot1_employee_id === day.employee1_id ? day.employee2_id : day.employee1_id
    const depot1Name = day.depot1_employee_id === day.employee1_id ? day.employee1_name : day.employee2_name
    const depot2Name = day.depot1_employee_id === day.employee1_id ? day.employee2_name : day.employee1_name
    const isToday = day.date === today
    const isPast = day.date < today
    const isPendingPast = isPast && !isDayFullyConfirmed(day)
    const dateParts = formatDateParts(day.date)

    return (
      <div
        key={day.date}
        className={`schedule-day-card ${isToday ? 'schedule-day-today' : ''} ${isPast ? 'schedule-day-past' : ''} ${isPendingPast ? 'schedule-day-pending' : ''}`}
      >
        <div className="schedule-day-header">
          <div className="schedule-date-block">
            <span className="schedule-weekday">{dateParts.weekday}</span>
            <span className="schedule-day-num">{dateParts.day}</span>
            <span className="schedule-month">{dateParts.month}</span>
            {isToday && <span className="today-badge">Hoy</span>}
            {isPendingPast && <span className="pending-badge">Sin confirmar</span>}
          </div>

          <div className="schedule-day-actions">
            {!hasConfirmedOnDay(day.date) ? (
              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (confirm('¿Eliminar este día? Se reacomodarán los turnos siguientes.')) {
                    const ok = await window.api.stretch.deleteDay(day.date)
                    if (!ok) {
                      setError('No se puede eliminar: ya hay al menos una confirmación en este día.')
                      return
                    }
                    setSuccess('Día eliminado. Los turnos siguientes se reacomodaron automáticamente.')
                    load()
                    onUpdate()
                  }
                }}
              >
                Eliminar día
              </button>
            ) : (
              <span className="day-locked" title="Hay confirmaciones en este día">🔒 Bloqueado</span>
            )}
          </div>
        </div>

        <div className="schedule-day-grid">
          {renderPerson(day.date, depot1Person, depot1Name, 1)}
          {renderPerson(day.date, depot2Person, depot2Name, 2)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="month-nav">
        <div className="month-nav-picker">
          <button className="btn btn-secondary btn-icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))} title="Mes anterior">
            ←
          </button>
          <h3>{format(currentDate, 'MMMM yyyy', { locale: es })}</h3>
          <button className="btn btn-secondary btn-icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))} title="Mes siguiente">
            →
          </button>
        </div>
        <div className="month-nav-actions">
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generando...' : 'Generar turnos'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExportPdf}
            disabled={exporting || schedule.length === 0}
          >
            {exporting ? 'Exportando...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      <div className="schedule-view-toggle">
        <button
          type="button"
          className={`schedule-view-btn ${viewMode === 'list' ? 'schedule-view-btn-active' : ''}`}
          onClick={() => setViewMode('list')}
        >
          Detalle
        </button>
        <button
          type="button"
          className={`schedule-view-btn ${viewMode === 'calendar' ? 'schedule-view-btn-active' : ''}`}
          onClick={() => setViewMode('calendar')}
        >
          Calendario
        </button>
      </div>

      {error && <div className="alert alert-warning">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {viewMode === 'list' && (
        <div className="alert alert-info">
          <strong>Generar turnos</strong> crea el calendario del mes siguiendo la rotación del mes anterior.
          Si alguien <strong>falta</strong>: 1) el reemplazo cubre hoy, 2) el ausente recupera en el próximo turno del reemplazo,
          3) los días siguientes se reacomodan solos. Los días con <strong>Hecho</strong> no se tocan.
          Podés confirmar turnos de <strong>días anteriores</strong> cuando no tuviste tiempo de cargarlos.
        </div>
      )}

      {viewMode === 'list' && pendingPastDays > 0 && (
        <div className={`pending-days-panel ${showPendingDays ? 'pending-days-panel-open' : ''}`}>
          <button
            type="button"
            className="pending-days-toggle"
            onClick={() => setShowPendingDays(open => !open)}
          >
            <span className="pending-days-toggle-text">
              Tenés <strong>{pendingPastDays}</strong> {pendingPastDays === 1 ? 'día anterior' : 'días anteriores'} sin confirmar.
              {showPendingDays ? ' Ocultar días pendientes.' : ' Tocá acá para verlos y marcarlos.'}
            </span>
            <span className="pending-days-toggle-icon">{showPendingDays ? '▲' : '▼'}</span>
          </button>

          {showPendingDays && (
            <div className="pending-days-section">
              <div className="pending-days-section-title">Días pendientes de confirmar</div>
              {pendingPastSchedule.map(renderDayCard)}
            </div>
          )}
        </div>
      )}

      {schedule.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No hay turnos asignados para este mes.</p>
            <p>Agregá empleados y presioná "Generar turnos".</p>
          </div>
        </div>
      ) : viewMode === 'calendar' ? (
        <ScheduleCalendarView
          year={year}
          month={month}
          schedule={schedule}
          assignments={assignments}
          depotSettings={depotSettings}
          today={today}
        />
      ) : (
        <div className="schedule-list">
          {visibleSchedule.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <p>No hay turnos asignados desde hoy.</p>
              </div>
            </div>
          ) : (
            visibleSchedule.map(renderDayCard)
          )}
        </div>
      )}
    </div>
  )
}
