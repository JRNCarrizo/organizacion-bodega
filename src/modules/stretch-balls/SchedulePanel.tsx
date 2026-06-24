import { useEffect, useState, useMemo, useRef } from 'react'
import type { StretchScheduleDay, StretchAssignment, Employee, DepotSettings } from '../../types'
import { getDepotName, getDepotWorkloadLabel } from '../../utils/depot'
import { format, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import ScheduleCalendarView from './ScheduleCalendarView'
import ScheduleEditModal from './ScheduleEditModal'
import ReplacementPickerModal from './ReplacementPickerModal'
import ScheduleRotationOverviewModal from './ScheduleRotationOverviewModal'

type ScheduleViewMode = 'list' | 'calendar'

interface Props {
  refreshKey: number
  onUpdate: () => void
}

interface ReplacingState {
  date: string
  absentEmployeeId: number
  absentEmployeeName: string
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
  const [lastExportPath, setLastExportPath] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [replacing, setReplacing] = useState<ReplacingState | null>(null)
  const [replacingBusy, setReplacingBusy] = useState(false)
  const [showPendingDays, setShowPendingDays] = useState(false)
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('list')
  const [holidays, setHolidays] = useState<string[]>([])
  const [holidayConfirmDate, setHolidayConfirmDate] = useState<string | null>(null)
  const [unmarkHolidayDate, setUnmarkHolidayDate] = useState<string | null>(null)
  const [markingHoliday, setMarkingHoliday] = useState(false)
  const [showRotationOverview, setShowRotationOverview] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false)
  const [showHelpBubble, setShowHelpBubble] = useState(false)
  const helpWrapRef = useRef<HTMLDivElement>(null)

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

  const hasConfirmedOnDay = (date: string): boolean =>
    assignments.some(a => a.date === date && (a.balls_count ?? 0) > 0)

  const regeneratePreview = useMemo(() => {
    if (schedule.length === 0) return null
    const kept = schedule.filter(day => hasConfirmedOnDay(day.date)).length
    const replaced = schedule.length - kept
    return { kept, replaced, total: schedule.length }
  }, [schedule, assignments])

  const visibleSchedule = useMemo(() => {
    if (!isCurrentMonth) return schedule
    return schedule.filter(day => day.date >= today)
  }, [schedule, isCurrentMonth, today])

  useEffect(() => {
    setShowPendingDays(false)
    setShowGenerateConfirm(false)
  }, [year, month])

  const load = async () => {
    try {
      const [sched, assigns, heavy, emps, monthHolidays] = await Promise.all([
        window.api.stretch.getSchedule(year, month),
        window.api.stretch.getAssignments(year, month),
        window.api.settings.getDepotSettings(),
        window.api.employees.getAll(),
        window.api.stretch.getHolidays(year, month)
      ])
      setSchedule(sched)
      setAssignments(assigns)
      setDepotSettings(heavy)
      setEmployees(emps.filter((e: Employee) => e.active === 1 && e.in_stretch === 1))
      setHolidays(monthHolidays)
    } catch (err) {
      console.error(err)
      setError('Error al cargar turnos. Reiniciá la app si acabás de actualizar.')
    }
  }

  useEffect(() => { load() }, [year, month, refreshKey])

  useEffect(() => {
    setLastExportPath(null)
  }, [year, month])

  useEffect(() => {
    if (!holidayConfirmDate) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !markingHoliday) {
        event.preventDefault()
        setHolidayConfirmDate(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [holidayConfirmDate, markingHoliday])

  useEffect(() => {
    if (!unmarkHolidayDate) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !markingHoliday) {
        event.preventDefault()
        setUnmarkHolidayDate(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [unmarkHolidayDate, markingHoliday])

  useEffect(() => {
    if (!showGenerateConfirm) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !generating) {
        event.preventDefault()
        setShowGenerateConfirm(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showGenerateConfirm, generating])

  useEffect(() => {
    if (!showHelpBubble) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowHelpBubble(false)
    }

    const onPointerDown = (event: MouseEvent) => {
      if (helpWrapRef.current && !helpWrapRef.current.contains(event.target as Node)) {
        setShowHelpBubble(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [showHelpBubble])

  const handleExportPdf = async () => {
    setExporting(true)
    setError('')
    setSuccess('')
    try {
      const result = await window.api.stretch.exportPdf(year, month)
      if (result.success) {
        setSuccess(result.message)
        if (result.filePath) setLastExportPath(result.filePath)
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

  const handleOpenExportFolder = async () => {
    if (!lastExportPath) return
    setError('')
    try {
      const result = await window.api.app.showItemInFolder(lastExportPath)
      if (!result.success) setError(result.message)
    } catch {
      setError('No se pudo abrir la carpeta del archivo exportado.')
    }
  }

  const runGenerate = async (isRegenerate: boolean) => {
    setGenerating(true)
    setError('')
    setSuccess('')
    try {
      const result = await window.api.stretch.generateSchedule(year, month)
      if (!result || result.length === 0) {
        setError('No se pudieron generar turnos. Verificá que haya al menos 2 empleados activos.')
      } else {
        setSuccess(
          isRegenerate
            ? 'Turnos regenerados. Los días confirmados se mantuvieron.'
            : 'Turnos del mes generados. La rotación continúa desde el mes anterior.'
        )
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

  const requestGenerate = () => {
    setError('')
    setSuccess('')
    if (schedule.length === 0) {
      void runGenerate(false)
      return
    }
    setShowGenerateConfirm(true)
  }

  const confirmGenerate = () => {
    setShowGenerateConfirm(false)
    void runGenerate(true)
  }

  const handleMarkComplete = async (
    date: string,
    employeeId: number,
    depot: number
  ) => {
    if (isCompleted(date, employeeId)) return
    if (date > today) {
      setError('Solo podés marcar turnos de hoy o días anteriores.')
      return
    }

    const ok = await window.api.stretch.recordBalls(date, employeeId, depot, 1)
    if (!ok) {
      setError('Este turno ya fue confirmado y no se puede desmarcar.')
      return
    }
    await load()
    onUpdate()
  }

  const handleReplaceConfirm = async (replacementId: number) => {
    if (!replacing) return
    setReplacingBusy(true)
    setError('')
    setSuccess('')

    try {
      const result = await window.api.stretch.replaceAbsent(
        replacing.date,
        replacing.absentEmployeeId,
        replacementId
      )

      if (result.success) {
        setSuccess(result.message)
        setReplacing(null)
        await load()
        onUpdate()
      } else {
        setError(result.message)
      }
    } finally {
      setReplacingBusy(false)
    }
  }

  const openReplace = (
    date: string,
    absentEmployeeId: number,
    absentEmployeeName: string,
    depot: number
  ) => {
    setSuccess('')
    setError('')
    setReplacing({ date, absentEmployeeId, absentEmployeeName, depot })
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
      month: format(date, 'MMM', { locale: es }),
      full: format(date, "EEEE d 'de' MMMM", { locale: es })
    }
  }

  const confirmMarkHoliday = async (date: string) => {
    setMarkingHoliday(true)
    setError('')
    setSuccess('')
    try {
      if (!window.api.stretch.markHoliday) {
        setError('Reiniciá la aplicación para activar la función de feriados.')
        return
      }
      const ok = await window.api.stretch.markHoliday(date)
      if (!ok) {
        setError('No se puede marcar feriado: ya hay confirmaciones en ese día.')
        return
      }
      setSuccess('Feriado registrado. Ese día no tendrá turno y los siguientes se reacomodaron.')
      setHolidayConfirmDate(null)
      await load()
      onUpdate()
    } catch (err) {
      console.error(err)
      setError('Error al marcar el feriado. Reiniciá la app e intentá de nuevo.')
    } finally {
      setMarkingHoliday(false)
    }
  }

  const requestMarkHoliday = (date: string) => {
    setError('')
    setSuccess('')
    setHolidayConfirmDate(date)
  }

  const requestUnmarkHoliday = (date: string) => {
    setError('')
    setSuccess('')
    setUnmarkHolidayDate(date)
  }

  const confirmUnmarkHoliday = async (date: string) => {
    setMarkingHoliday(true)
    setError('')
    setSuccess('')
    try {
      if (!window.api.stretch.unmarkHoliday) {
        setError('Reiniciá la aplicación para activar quitar feriados.')
        return
      }
      const ok = await window.api.stretch.unmarkHoliday(date)
      if (!ok) {
        setError('No se puede quitar el feriado: el día no es feriado o ya tiene confirmaciones.')
        return
      }
      setSuccess('Feriado quitado. Se reasignaron los turnos desde ese día.')
      setUnmarkHolidayDate(null)
      await load()
      onUpdate()
    } catch {
      setError('Error al quitar el feriado. Reiniciá la app e intentá de nuevo.')
    } finally {
      setMarkingHoliday(false)
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
    const isFuture = date > today
    const isReplacement = assignment?.is_replacement === 1

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
          <button
            type="button"
            className={`confirm-turn-btn ${
              completed
                ? 'confirm-turn-btn-done'
                : isFuture
                  ? 'confirm-turn-btn-future'
                  : 'confirm-turn-btn-ready'
            }`}
            disabled={completed || isFuture}
            onClick={() => handleMarkComplete(date, employeeId, depot)}
          >
            <span className="confirm-turn-btn-icon" aria-hidden="true">
              {completed ? '✓' : isFuture ? '◷' : '!'}
            </span>
            <span className="confirm-turn-btn-copy">
              <span className="confirm-turn-btn-label">
                {completed ? 'Turno confirmado' : isFuture ? 'Día futuro' : 'Confirmar turno'}
              </span>
              {!completed && !isFuture && (
                <span className="confirm-turn-btn-hint">Marcar como realizado</span>
              )}
            </span>
          </button>

          {!completed && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => openReplace(date, employeeId, employeeName, depot)}
            >
              Reemplazar
            </button>
          )}
        </div>
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
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => requestMarkHoliday(day.date)}
              >
                Marcar feriado
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
      <div className="schedule-toolbar">
        <div className="schedule-toolbar-month">
          <button
            type="button"
            className="schedule-toolbar-nav-btn"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            title="Mes anterior"
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <h3>{format(currentDate, 'MMMM yyyy', { locale: es })}</h3>
          <button
            type="button"
            className="schedule-toolbar-nav-btn"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            title="Mes siguiente"
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
        <div className="schedule-toolbar-actions">
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-primary"
            onClick={requestGenerate}
            disabled={generating}
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">✦</span>
            {generating ? 'Generando...' : schedule.length > 0 ? 'Regenerar turnos' : 'Generar turnos'}
          </button>
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-secondary"
            onClick={() => setShowRotationOverview(true)}
            disabled={schedule.length === 0}
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">#</span>
            Mapa rotación
          </button>
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-secondary"
            onClick={() => setShowEditModal(true)}
            disabled={schedule.length === 0}
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">✎</span>
            Editar turnos
          </button>
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-secondary"
            onClick={handleExportPdf}
            disabled={exporting || schedule.length === 0}
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">↓</span>
            {exporting ? 'Exportando...' : 'Exportar PDF'}
          </button>
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-ghost"
            onClick={handleOpenExportFolder}
            disabled={!lastExportPath}
            title={lastExportPath ? 'Abrir carpeta con el PDF exportado' : 'Exportá primero para abrir la carpeta'}
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">📁</span>
            Abrir carpeta
          </button>
        </div>
      </div>

      <div className="schedule-subnav">
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

        <div className="schedule-help-wrap" ref={helpWrapRef}>
          <button
            type="button"
            className={`schedule-help-btn ${showHelpBubble ? 'schedule-help-btn-open' : ''}`}
            onClick={() => setShowHelpBubble(open => !open)}
            aria-expanded={showHelpBubble}
            aria-label="Ayuda sobre turnos"
            title="Cómo funcionan los turnos"
          >
            !
          </button>

          {showHelpBubble && (
            <div className="schedule-help-bubble" role="dialog" aria-label="Ayuda sobre turnos">
              <p className="schedule-help-bubble-title">Cómo funcionan los turnos</p>
              <ul className="schedule-help-bubble-list">
                <li>
                  <strong>Generar turnos</strong> crea el calendario del mes siguiendo la rotación del mes anterior. Si ya hay turnos, <strong>Regenerar</strong> pide confirmación antes de recalcular.
                </li>
                <li>
                  Si alguien <strong>falta</strong>: el reemplazo cubre hoy; el ausente recupera en el próximo turno del reemplazo; los días siguientes se reacomodan solos.
                </li>
                <li>Los días con <strong>Hecho</strong> no se tocan.</li>
                <li>Solo podés confirmar <strong>hoy o días anteriores</strong> (no días futuros).</li>
                <li>
                  Para un <strong>feriado</strong> (ej. lunes no laborable), usá <strong>Marcar feriado</strong>: ese día queda sin turno y el resto se acomoda solo.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-warning">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {showRotationOverview && (
        <ScheduleRotationOverviewModal
          year={year}
          month={month}
          schedule={schedule}
          assignments={assignments}
          employees={employees}
          depotSettings={depotSettings}
          holidays={holidays}
          today={today}
          onClose={() => setShowRotationOverview(false)}
        />
      )}

      {showEditModal && (
        <ScheduleEditModal
          schedule={schedule}
          assignments={assignments}
          employees={employees}
          depotSettings={depotSettings}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => {
            setSuccess('Turnos actualizados manualmente.')
            await load()
            onUpdate()
          }}
        />
      )}

      {replacing && (
        <ReplacementPickerModal
          dateLabel={formatDateParts(replacing.date).full}
          absentEmployeeName={replacing.absentEmployeeName}
          depot={replacing.depot}
          depotSettings={depotSettings}
          candidates={getAvailableReplacements(replacing.date, replacing.absentEmployeeId)}
          busy={replacingBusy}
          onSelect={handleReplaceConfirm}
          onClose={() => !replacingBusy && setReplacing(null)}
        />
      )}

      {showGenerateConfirm && regeneratePreview && (
        <div
          className="meal-modal-overlay"
          onClick={() => !generating && setShowGenerateConfirm(false)}
        >
          <div
            className="meal-modal schedule-holiday-modal schedule-generate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="meal-modal-header">
              <div>
                <span className="meal-modal-label">Regenerar calendario</span>
                <h3 id="generate-modal-title">¿Volver a generar turnos?</h3>
                <p>Este mes ya tiene turnos cargados. Si continuás, el sistema los recalculará automáticamente.</p>
              </div>
              <button
                type="button"
                className="meal-modal-close"
                onClick={() => !generating && setShowGenerateConfirm(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="schedule-generate-confirm-body">
              <ul className="schedule-generate-confirm-list">
                <li>
                  <strong>{regeneratePreview.replaced}</strong> día{regeneratePreview.replaced === 1 ? '' : 's'} sin confirmar
                  {regeneratePreview.replaced === 1 ? ' se recalculará' : ' se recalcularán'} (incluye cambios manuales en esos días).
                </li>
                {regeneratePreview.kept > 0 && (
                  <li>
                    <strong>{regeneratePreview.kept}</strong> día{regeneratePreview.kept === 1 ? '' : 's'} con confirmaciones
                    {regeneratePreview.kept === 1 ? ' se mantiene' : ' se mantienen'} sin cambios.
                  </li>
                )}
                <li>La rotación sigue el historial guardado, incluido el mes anterior.</li>
              </ul>
            </div>

            <div className="schedule-holiday-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmGenerate}
                disabled={generating}
              >
                {generating ? 'Generando...' : 'Sí, regenerar turnos'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowGenerateConfirm(false)}
                disabled={generating}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {unmarkHolidayDate && (
        <div
          className="meal-modal-overlay"
          onClick={() => !markingHoliday && setUnmarkHolidayDate(null)}
        >
          <div
            className="meal-modal schedule-holiday-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unmark-holiday-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="meal-modal-header">
              <div>
                <span className="meal-modal-label">Quitar feriado</span>
                <h3 id="unmark-holiday-modal-title">{formatDateParts(unmarkHolidayDate).full}</h3>
                <p>
                  Ese día volverá a tener turno de Stretch. Los días siguientes se reacomodan solos.
                </p>
              </div>
              <button
                type="button"
                className="meal-modal-close"
                onClick={() => !markingHoliday && setUnmarkHolidayDate(null)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="schedule-holiday-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => confirmUnmarkHoliday(unmarkHolidayDate)}
                disabled={markingHoliday}
              >
                {markingHoliday ? 'Guardando...' : 'Sí, quitar feriado'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUnmarkHolidayDate(null)}
                disabled={markingHoliday}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {holidayConfirmDate && (
        <div
          className="meal-modal-overlay"
          onClick={() => !markingHoliday && setHolidayConfirmDate(null)}
        >
          <div
            className="meal-modal schedule-holiday-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="holiday-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="meal-modal-header">
              <div>
                <span className="meal-modal-label">Feriado / no laborable</span>
                <h3 id="holiday-modal-title">{formatDateParts(holidayConfirmDate).full}</h3>
                <p>Ese día no habrá turno de Stretch. Los días hábiles siguientes se reacomodan solos.</p>
              </div>
              <button
                type="button"
                className="meal-modal-close"
                onClick={() => !markingHoliday && setHolidayConfirmDate(null)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="schedule-holiday-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => confirmMarkHoliday(holidayConfirmDate)}
                disabled={markingHoliday}
              >
                {markingHoliday ? 'Guardando...' : 'Sí, marcar feriado'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setHolidayConfirmDate(null)}
                disabled={markingHoliday}
              >
                Cancelar
              </button>
            </div>
          </div>
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
          holidays={holidays}
          today={today}
          onUnmarkHoliday={requestUnmarkHoliday}
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
