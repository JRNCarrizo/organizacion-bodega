import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { StretchScheduleDay, StretchAssignment, Employee, DepotSettings } from '../../types'
import { getDepotName } from '../../utils/depot'

interface Props {
  year: number
  month: number
  schedule: StretchScheduleDay[]
  assignments: StretchAssignment[]
  employees: Employee[]
  depotSettings: DepotSettings
  holidays: string[]
  today: string
  onClose: () => void
}

interface DaySlot {
  employeeId: number
  number: number
  depot: number
  isHeavy: boolean
  isReplacement: boolean
  confirmed: boolean
}

interface TimelineDay {
  date: string
  dayNum: number
  weekday: string
  kind: 'holiday' | 'scheduled' | 'empty'
  slots: [DaySlot, DaySlot] | null
}

const EMPLOYEE_HUES = [210, 160, 280, 25, 340, 190, 45, 300, 120, 0, 260, 200]

function getWorkingDaysInMonth(year: number, month: number): string[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const result: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const dow = date.getDay()
    if (dow !== 0 && dow !== 6) {
      result.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }
  return result
}

function sortRotationOrder(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) => a.id - b.id)
}

function employeeColor(index: number): string {
  const hue = EMPLOYEE_HUES[index % EMPLOYEE_HUES.length]
  return `hsl(${hue} 68% 52%)`
}

function buildSlot(
  employeeId: number,
  number: number,
  depot: number,
  date: string,
  heavyDepot: number,
  assignments: StretchAssignment[]
): DaySlot {
  const assignment = assignments.find(a => a.date === date && a.employee_id === employeeId)
  return {
    employeeId,
    number,
    depot,
    isHeavy: depot === heavyDepot,
    isReplacement: assignment?.is_replacement === 1,
    confirmed: (assignment?.balls_count ?? 0) > 0
  }
}

function getDaySlots(
  day: StretchScheduleDay,
  numberById: Map<number, number>,
  heavyDepot: number,
  assignments: StretchAssignment[]
): [DaySlot, DaySlot] {
  const emp1Depot = day.depot1_employee_id === day.employee1_id ? 1 : 2
  const emp2Depot = day.depot1_employee_id === day.employee2_id ? 1 : 2
  return [
    buildSlot(day.employee1_id, numberById.get(day.employee1_id) ?? 0, emp1Depot, day.date, heavyDepot, assignments),
    buildSlot(day.employee2_id, numberById.get(day.employee2_id) ?? 0, emp2Depot, day.date, heavyDepot, assignments)
  ]
}

function workingDaysBetween(allWorkingDays: string[], from: string, to: string): number {
  const fromIdx = allWorkingDays.indexOf(from)
  const toIdx = allWorkingDays.indexOf(to)
  if (fromIdx === -1 || toIdx === -1) return 0
  return Math.max(0, toIdx - fromIdx - 1)
}

export default function ScheduleRotationOverviewModal({
  year,
  month,
  schedule,
  assignments,
  employees,
  depotSettings,
  holidays,
  today,
  onClose
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)

  const orderedEmployees = useMemo(() => sortRotationOrder(employees), [employees])

  const numberById = useMemo(() => {
    const map = new Map<number, number>()
    orderedEmployees.forEach((emp, index) => map.set(emp.id, index + 1))
    return map
  }, [orderedEmployees])

  const colorById = useMemo(() => {
    const map = new Map<number, string>()
    orderedEmployees.forEach((emp, index) => map.set(emp.id, employeeColor(index)))
    return map
  }, [orderedEmployees])

  const scheduleByDate = useMemo(() => {
    const map = new Map<string, StretchScheduleDay>()
    for (const day of schedule) map.set(day.date, day)
    return map
  }, [schedule])

  const holidaysSet = useMemo(() => new Set(holidays), [holidays])
  const workingDays = useMemo(() => getWorkingDaysInMonth(year, month), [year, month])

  const timeline = useMemo((): TimelineDay[] => {
    return workingDays.map(date => {
      const [y, m, d] = date.split('-').map(Number)
      const parsed = new Date(y, m - 1, d)
      const dayNum = d
      const weekday = format(parsed, 'EEE', { locale: es })

      if (holidaysSet.has(date)) {
        return { date, dayNum, weekday, kind: 'holiday', slots: null }
      }

      const daySchedule = scheduleByDate.get(date)
      if (!daySchedule) {
        return { date, dayNum, weekday, kind: 'empty', slots: null }
      }

      return {
        date,
        dayNum,
        weekday,
        kind: 'scheduled',
        slots: getDaySlots(daySchedule, numberById, depotSettings.heavyDepot, assignments)
      }
    })
  }, [workingDays, holidaysSet, scheduleByDate, numberById, depotSettings.heavyDepot, assignments])

  const selectedStats = useMemo(() => {
    if (selectedEmployeeId === null) return null

    const dates = timeline
      .filter(day => day.kind === 'scheduled' && day.slots?.some(slot => slot.employeeId === selectedEmployeeId))
      .map(day => day.date)

    const gaps: number[] = []
    for (let i = 1; i < dates.length; i++) {
      gaps.push(workingDaysBetween(workingDays, dates[i - 1], dates[i]))
    }

    let heavy = 0
    let light = 0
    let replacements = 0
    for (const day of timeline) {
      if (day.kind !== 'scheduled' || !day.slots) continue
      for (const slot of day.slots) {
        if (slot.employeeId !== selectedEmployeeId) continue
        if (slot.isHeavy) heavy += 1
        else light += 1
        if (slot.isReplacement) replacements += 1
      }
    }

    const emp = orderedEmployees.find(e => e.id === selectedEmployeeId)
    const number = numberById.get(selectedEmployeeId) ?? 0

    return {
      name: emp?.name ?? '',
      number,
      shiftCount: dates.length,
      dates,
      gaps,
      heavy,
      light,
      replacements
    }
  }, [selectedEmployeeId, timeline, workingDays, orderedEmployees, numberById])

  useEffect(() => {
    modalRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const monthLabel = format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: es })
  const heavyName = getDepotName(depotSettings.heavyDepot, depotSettings)
  const lightName = getDepotName(depotSettings.heavyDepot === 1 ? 2 : 1, depotSettings)
  const hasSelection = selectedEmployeeId !== null

  const slotMatchesSelection = (slot: DaySlot) =>
    hasSelection && slot.employeeId === selectedEmployeeId

  const dayHasSelection = (day: TimelineDay) =>
    day.kind === 'scheduled' && day.slots?.some(slot => slotMatchesSelection(slot))

  return (
    <div className="meal-modal-overlay rotation-overview-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="meal-modal rotation-overview-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Mapa de rotación de turnos"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="meal-modal-header rotation-overview-header">
          <div>
            <span className="meal-modal-label">Vista general</span>
            <h3>Mapa de rotación · {monthLabel}</h3>
            <p>
              Cada persona tiene un número fijo según el orden de rotación del sistema (por alta).
              Tocá una persona para resaltar todos sus turnos y ver los intervalos.
            </p>
            <p className="meal-modal-kbd-hint">P = {heavyName} (pesado) · L = {lightName} (liviano) · Esc cerrar</p>
          </div>
          <button type="button" className="meal-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className={`rotation-overview-body ${hasSelection ? 'rotation-overview-body--filtered' : ''}`}>
          <section className="rotation-overview-roster" aria-label="Personas en rotación">
            <div className="rotation-overview-roster-head">
              <span className="rotation-overview-section-title">Orden de rotación</span>
              {hasSelection && (
                <button
                  type="button"
                  className="rotation-overview-clear-btn"
                  onClick={() => setSelectedEmployeeId(null)}
                >
                  Limpiar selección
                </button>
              )}
            </div>
            <div className="rotation-overview-roster-list">
              {orderedEmployees.map((emp, index) => {
                const number = index + 1
                const isSelected = selectedEmployeeId === emp.id
                const shiftCount = timeline.filter(
                  day => day.kind === 'scheduled' && day.slots?.some(s => s.employeeId === emp.id)
                ).length
                return (
                  <button
                    key={emp.id}
                    type="button"
                    className={[
                      'rotation-roster-chip',
                      isSelected ? 'rotation-roster-chip--selected' : ''
                    ].filter(Boolean).join(' ')}
                    style={{ '--chip-color': colorById.get(emp.id) } as CSSProperties}
                    onClick={() => setSelectedEmployeeId(isSelected ? null : emp.id)}
                    title={`${number}. ${emp.name} · ${shiftCount} turnos`}
                  >
                    <span className="rotation-roster-num">{number}</span>
                    <span className="rotation-roster-name">{emp.name}</span>
                    <span className="rotation-roster-count">{shiftCount}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {selectedStats && (
            <section className="rotation-overview-stats" aria-live="polite">
              <div
                className="rotation-overview-stats-badge"
                style={{ '--chip-color': colorById.get(selectedEmployeeId!) } as CSSProperties}
              >
                #{selectedStats.number}
              </div>
              <div className="rotation-overview-stats-copy">
                <strong>{selectedStats.name}</strong>
                <span>
                  {selectedStats.shiftCount} {selectedStats.shiftCount === 1 ? 'turno' : 'turnos'} ·
                  {' '}Pesado {selectedStats.heavy} · Liviano {selectedStats.light}
                  {selectedStats.replacements > 0 && ` · ${selectedStats.replacements} reemplazo(s)`}
                </span>
                {selectedStats.gaps.length > 0 && (
                  <span className="rotation-overview-stats-gaps">
                    Días hábiles entre turnos: {selectedStats.gaps.join(', ')}
                  </span>
                )}
              </div>
            </section>
          )}

          <section className="rotation-overview-timeline-wrap" aria-label="Turnos del mes">
            <span className="rotation-overview-section-title">Días hábiles del mes</span>
            <div className="rotation-overview-timeline-scroll">
              <div className="rotation-overview-timeline">
                {timeline.map(day => {
                  const isToday = day.date === today
                  const highlighted = dayHasSelection(day)
                  const dimmed = hasSelection && day.kind === 'scheduled' && !highlighted

                  if (day.kind === 'holiday') {
                    return (
                      <div
                        key={day.date}
                        className={[
                          'rotation-timeline-col',
                          'rotation-timeline-col--holiday',
                          isToday ? 'rotation-timeline-col--today' : ''
                        ].filter(Boolean).join(' ')}
                        title={`${day.date} · Feriado`}
                      >
                        <span className="rotation-timeline-weekday">{day.weekday}</span>
                        <span className="rotation-timeline-daynum">{day.dayNum}</span>
                        <span className="rotation-timeline-holiday">F</span>
                      </div>
                    )
                  }

                  if (day.kind === 'empty') {
                    return (
                      <div
                        key={day.date}
                        className={[
                          'rotation-timeline-col',
                          'rotation-timeline-col--empty',
                          isToday ? 'rotation-timeline-col--today' : ''
                        ].filter(Boolean).join(' ')}
                        title={`${day.date} · Sin turno`}
                      >
                        <span className="rotation-timeline-weekday">{day.weekday}</span>
                        <span className="rotation-timeline-daynum">{day.dayNum}</span>
                        <span className="rotation-timeline-empty">—</span>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={day.date}
                      className={[
                        'rotation-timeline-col',
                        'rotation-timeline-col--scheduled',
                        highlighted ? 'rotation-timeline-col--highlight' : '',
                        dimmed ? 'rotation-timeline-col--dimmed' : '',
                        isToday ? 'rotation-timeline-col--today' : ''
                      ].filter(Boolean).join(' ')}
                      title={day.date}
                    >
                      <span className="rotation-timeline-weekday">{day.weekday}</span>
                      <span className="rotation-timeline-daynum">{day.dayNum}</span>
                      <div className="rotation-timeline-slots">
                        {day.slots!.map((slot, slotIndex) => {
                          const isMatch = slotMatchesSelection(slot)
                          const isDimmed = hasSelection && !isMatch
                          return (
                            <span
                              key={`${day.date}-${slotIndex}`}
                              className={[
                                'rotation-slot-badge',
                                slot.isHeavy ? 'rotation-slot-badge--heavy' : 'rotation-slot-badge--light',
                                slot.isReplacement ? 'rotation-slot-badge--replacement' : '',
                                slot.confirmed ? 'rotation-slot-badge--confirmed' : '',
                                isMatch ? 'rotation-slot-badge--selected' : '',
                                isDimmed ? 'rotation-slot-badge--dimmed' : ''
                              ].filter(Boolean).join(' ')}
                              style={{ '--chip-color': colorById.get(slot.employeeId) } as CSSProperties}
                            >
                              <span className="rotation-slot-num">{slot.number}</span>
                              <span className="rotation-slot-depot">{slot.isHeavy ? 'P' : 'L'}</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="rotation-overview-table-wrap" aria-label="Detalle por día">
            <span className="rotation-overview-section-title">Detalle por día</span>
            <div className="rotation-overview-table-scroll">
              <table className="rotation-overview-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Turno</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.filter(day => day.kind === 'scheduled').map(day => {
                    const highlighted = dayHasSelection(day)
                    const dimmed = hasSelection && !highlighted
                    const dateLabel = format(
                      new Date(Number(day.date.slice(0, 4)), Number(day.date.slice(5, 7)) - 1, Number(day.date.slice(8, 10))),
                      "EEE d MMM",
                      { locale: es }
                    )
                    return (
                      <tr
                        key={day.date}
                        className={[
                          highlighted ? 'rotation-table-row--highlight' : '',
                          dimmed ? 'rotation-table-row--dimmed' : '',
                          day.date === today ? 'rotation-table-row--today' : ''
                        ].filter(Boolean).join(' ')}
                      >
                        <td>{dateLabel}</td>
                        <td>
                          <div className="rotation-table-slots">
                            {day.slots!.map((slot, slotIndex) => {
                              const isMatch = slotMatchesSelection(slot)
                              const isDimmed = hasSelection && !isMatch
                              return (
                                <span
                                  key={slotIndex}
                                  className={[
                                    'rotation-table-slot',
                                    isMatch ? 'rotation-table-slot--selected' : '',
                                    isDimmed ? 'rotation-table-slot--dimmed' : ''
                                  ].filter(Boolean).join(' ')}
                                  style={{ '--chip-color': colorById.get(slot.employeeId) } as CSSProperties}
                                >
                                  <span className="rotation-table-slot-num">#{slot.number}</span>
                                  {orderedEmployees.find(e => e.id === slot.employeeId)?.name}
                                  <span className="rotation-table-slot-meta">
                                    {slot.isHeavy ? 'P' : 'L'}
                                    {slot.isReplacement ? ' · reemplazo' : ''}
                                    {slot.confirmed ? ' · ✓' : ''}
                                  </span>
                                </span>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="rotation-overview-footer">
          <span className="rotation-overview-legend">
            <span className="rotation-legend-item"><span className="rotation-legend-swatch rotation-legend-swatch--heavy" />P pesado</span>
            <span className="rotation-legend-item"><span className="rotation-legend-swatch rotation-legend-swatch--light" />L liviano</span>
            <span className="rotation-legend-item"><span className="rotation-legend-swatch rotation-legend-swatch--replacement" />borde punteado = reemplazo</span>
            <span className="rotation-legend-item"><span className="rotation-legend-swatch rotation-legend-swatch--confirmed" />✓ confirmado</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
