import { useMemo } from 'react'
import type { StretchScheduleDay, StretchAssignment, DepotSettings } from '../../types'
import { getDepotName } from '../../utils/depot'

interface Props {
  year: number
  month: number
  schedule: StretchScheduleDay[]
  assignments: StretchAssignment[]
  depotSettings: DepotSettings
  holidays: string[]
  today: string
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

interface CalendarCell {
  date: string | null
  inMonth: boolean
}

interface DayPerson {
  id: number
  name: string
  depot: number
  completed: boolean
  isReplacement: boolean
}

function buildCalendarCells(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7
  const cells: CalendarCell[] = []

  for (let i = 0; i < startOffset; i++) {
    cells.push({ date: null, inMonth: false })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ date: dateStr, inMonth: true })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, inMonth: false })
  }

  return cells
}

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dayOfWeek = new Date(y, m - 1, d).getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return name
  const first = parts[0]
  return first.length > 11 ? `${first.slice(0, 10)}…` : first
}

function getDayPeople(
  day: StretchScheduleDay,
  assignments: StretchAssignment[]
): DayPerson[] {
  const depot1Person = day.depot1_employee_id
  const depot2Person = day.depot1_employee_id === day.employee1_id ? day.employee2_id : day.employee1_id
  const depot1Name = day.depot1_employee_id === day.employee1_id ? day.employee1_name : day.employee2_name
  const depot2Name = day.depot1_employee_id === day.employee1_id ? day.employee2_name : day.employee1_name

  const build = (id: number, name: string, depot: number): DayPerson => {
    const assignment = assignments.find(a => a.date === day.date && a.employee_id === id)
    return {
      id,
      name,
      depot,
      completed: (assignment?.balls_count ?? 0) > 0,
      isReplacement: assignment?.is_replacement === 1
    }
  }

  return [
    build(depot1Person, depot1Name, 1),
    build(depot2Person, depot2Name, 2)
  ]
}

function getStatusInfo(
  daySchedule: StretchScheduleDay | undefined,
  assignments: StretchAssignment[],
  isPast: boolean,
  isHoliday: boolean
): { label: string; className: string } | null {
  if (isHoliday) {
    return { label: 'Feriado', className: 'schedule-cal-status-holiday' }
  }

  if (!daySchedule) return null

  const people = getDayPeople(daySchedule, assignments)
  const allDone = people.every(person => person.completed)
  const someDone = people.some(person => person.completed)

  if (allDone) {
    return { label: 'Confirmado', className: 'schedule-cal-status-done' }
  }

  if (isPast) {
    return { label: 'Pendiente', className: 'schedule-cal-status-pending' }
  }

  if (someDone) {
    return { label: 'Parcial', className: 'schedule-cal-status-partial' }
  }

  return { label: 'Programado', className: 'schedule-cal-status-scheduled' }
}

export default function ScheduleCalendarView({
  year,
  month,
  schedule,
  assignments,
  depotSettings,
  holidays,
  today
}: Props) {
  const scheduleByDate = useMemo(() => {
    const map = new Map<string, StretchScheduleDay>()
    for (const day of schedule) map.set(day.date, day)
    return map
  }, [schedule])

  const holidaysSet = useMemo(() => new Set(holidays), [holidays])

  const cells = useMemo(() => buildCalendarCells(year, month), [year, month])

  const heavyDepot = depotSettings.heavyDepot
  const heavyName = getDepotName(heavyDepot, depotSettings)
  const lightName = getDepotName(heavyDepot === 1 ? 2 : 1, depotSettings)

  return (
    <div className="schedule-calendar-wrap">
      <div className="schedule-calendar">
        <div className="schedule-calendar-weekdays">
          {WEEKDAYS.map(label => (
            <div key={label} className="schedule-calendar-weekday">{label}</div>
          ))}
        </div>

        <div className="schedule-calendar-grid">
          {cells.map((cell, index) => {
            if (!cell.date) {
              return <div key={`pad-${index}`} className="schedule-cal-cell schedule-cal-cell--padding" />
            }

            const daySchedule = scheduleByDate.get(cell.date)
            const isHoliday = holidaysSet.has(cell.date)
            const weekend = isWeekend(cell.date)
            const isToday = cell.date === today
            const isPast = cell.date < today
            const statusInfo = getStatusInfo(daySchedule, assignments, isPast, isHoliday)

            let statusClass = ''
            if (daySchedule && !isHoliday) {
              const people = getDayPeople(daySchedule, assignments)
              const allDone = people.every(person => person.completed)
              const someDone = people.some(person => person.completed)
              if (allDone) statusClass = 'schedule-cal-cell--done'
              else if (isPast) statusClass = 'schedule-cal-cell--pending'
              else if (someDone) statusClass = 'schedule-cal-cell--partial'
              else statusClass = 'schedule-cal-cell--scheduled'
            }

            const cellClasses = [
              'schedule-cal-cell',
              weekend && !daySchedule && !isHoliday ? 'schedule-cal-cell--weekend' : '',
              isHoliday ? 'schedule-cal-cell--holiday' : '',
              isToday ? 'schedule-cal-cell--today' : '',
              daySchedule ? 'schedule-cal-cell--scheduled' : '',
              statusClass
            ].filter(Boolean).join(' ')

            const dayNum = Number(cell.date.split('-')[2])
            const people = daySchedule ? getDayPeople(daySchedule, assignments) : []

            return (
              <div
                key={cell.date}
                className={cellClasses}
                title={daySchedule ? cell.date : undefined}
              >
                <div className="schedule-cal-cell-header">
                  <span className={`schedule-cal-day-num ${isToday ? 'schedule-cal-day-num-today' : ''}`}>
                    {dayNum}
                  </span>
                  {statusInfo && (
                    <span className={`schedule-cal-status ${statusInfo.className}`}>
                      {statusInfo.label}
                    </span>
                  )}
                </div>

                {daySchedule ? (
                  <div className="schedule-cal-people">
                    {people.map(person => {
                      const isHeavy = person.depot === heavyDepot
                      return (
                        <div
                          key={person.id}
                          className={[
                            'schedule-cal-person',
                            isHeavy ? 'schedule-cal-person-heavy' : 'schedule-cal-person-light',
                            person.completed ? 'schedule-cal-person-done' : ''
                          ].join(' ')}
                          title={`${person.name} · ${getDepotName(person.depot, depotSettings)}${person.isReplacement ? ' (reemplazo)' : ''}`}
                        >
                          <span className="schedule-cal-depot-tag">
                            {isHeavy ? 'P' : 'L'}
                          </span>
                          <span className="schedule-cal-person-name">
                            {person.isReplacement && <span className="schedule-cal-replace">↳ </span>}
                            {shortName(person.name)}
                          </span>
                          {person.completed && (
                            <span className="schedule-cal-person-check" aria-hidden="true">✓</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : isHoliday ? (
                  <div className="schedule-cal-empty-state">
                    <span className="schedule-cal-holiday">Feriado</span>
                  </div>
                ) : weekend ? (
                  <div className="schedule-cal-empty-state">
                    <span className="schedule-cal-off">Fin de semana</span>
                  </div>
                ) : (
                  <div className="schedule-cal-empty-state">
                    <span className="schedule-cal-off">Sin turno</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="schedule-calendar-legend">
        <div className="schedule-legend-group">
          <span className="schedule-legend-group-title">Depósitos</span>
          <div className="schedule-legend-group-items">
            <span className="schedule-legend-item">
              <span className="schedule-legend-chip schedule-legend-chip-heavy" />
              {heavyName} · pesado
            </span>
            <span className="schedule-legend-item">
              <span className="schedule-legend-chip schedule-legend-chip-light" />
              {lightName} · liviano
            </span>
            <span className="schedule-legend-item">
              <span className="schedule-legend-tag schedule-legend-tag-heavy">P</span>
              Pesado
            </span>
            <span className="schedule-legend-item">
              <span className="schedule-legend-tag schedule-legend-tag-light">L</span>
              Liviano
            </span>
          </div>
        </div>

        <div className="schedule-legend-group">
          <span className="schedule-legend-group-title">Estados del día</span>
          <div className="schedule-legend-group-items">
            <span className="schedule-legend-item">
              <span className="schedule-legend-stripe schedule-legend-stripe-done" />
              Confirmado
            </span>
            <span className="schedule-legend-item">
              <span className="schedule-legend-stripe schedule-legend-stripe-partial" />
              Parcial
            </span>
            <span className="schedule-legend-item">
              <span className="schedule-legend-stripe schedule-legend-stripe-pending" />
              Pendiente
            </span>
            <span className="schedule-legend-item">
              <span className="schedule-legend-stripe schedule-legend-stripe-scheduled" />
              Programado
            </span>
            <span className="schedule-legend-item">
              <span className="schedule-legend-stripe schedule-legend-stripe-holiday" />
              Feriado
            </span>
            <span className="schedule-legend-item">
              <span className="schedule-legend-ring" />
              Hoy
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
