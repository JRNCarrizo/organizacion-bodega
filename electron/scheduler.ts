import {
  Employee,
  getTotalAssignmentsBefore,
  getLastDepotForEmployee,
  saveScheduleDay,
  getScheduleForMonth,
  deleteAssignmentForDate,
  hasConfirmedAssignments,
  getStretchHolidaysForMonth,
  isStretchHoliday,
  markStretchHoliday,
  unmarkStretchHoliday
} from './database'

export interface ScheduleSuggestion {
  date: string
  employee1_id: number
  employee1_name: string
  employee2_id: number
  employee2_name: string
  depot1_employee_id: number
}

function getTodayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function getWorkingDaysInMonth(year: number, month: number, fromDate?: string): string[] {
  const days: string[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (fromDate && dateStr < fromDate) continue

    const date = new Date(year, month - 1, d)
    const dayOfWeek = date.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(dateStr)
    }
  }
  return days
}

export function getSchedulableDaysInMonth(year: number, month: number, fromDate?: string): string[] {
  const holidays = new Set(getStretchHolidaysForMonth(year, month))
  return getWorkingDaysInMonth(year, month, fromDate).filter(date => !holidays.has(date))
}

function sortEmployees(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) => a.id - b.id)
}

function pickRotatingPair(
  employees: Employee[],
  rotationPointer: number,
  lastAssigned: Set<number>
): [Employee, Employee] | null {
  const sorted = sortEmployees(employees)
  const n = sorted.length
  if (n < 2) return null

  for (let attempt = 0; attempt < n; attempt++) {
    const idx = (rotationPointer + attempt * 2) % n
    const emp1 = sorted[idx]
    const emp2 = sorted[(idx + 1) % n]

    const hasRecent = lastAssigned.has(emp1.id) || lastAssigned.has(emp2.id)
    if (!hasRecent || attempt === n - 1) {
      return [emp1, emp2]
    }
  }

  const idx = rotationPointer % n
  return [sorted[idx], sorted[(idx + 1) % n]]
}

function assignDepots(
  emp1: Employee,
  emp2: Employee,
  date: string
): { depot1EmployeeId: number } {
  const lastDepot1 = getLastDepotForEmployee(emp1.id, date)
  const lastDepot2 = getLastDepotForEmployee(emp2.id, date)

  if (lastDepot1 === null && lastDepot2 === null) {
    return { depot1EmployeeId: emp1.id }
  }

  if (lastDepot1 === null) {
    return { depot1EmployeeId: lastDepot2 === 1 ? emp1.id : emp2.id }
  }

  if (lastDepot2 === null) {
    return { depot1EmployeeId: lastDepot1 === 1 ? emp2.id : emp1.id }
  }

  if (lastDepot1 === lastDepot2) {
    return { depot1EmployeeId: lastDepot1 === 1 ? emp2.id : emp1.id }
  }

  return { depot1EmployeeId: lastDepot1 === 2 ? emp1.id : emp2.id }
}

function fillScheduleDay(
  activeEmployees: Employee[],
  date: string,
  rotationPointer: number,
  lastAssigned: Set<number>
): { result: ScheduleSuggestion; nextPointer: number } | null {
  const pair = pickRotatingPair(activeEmployees, rotationPointer, lastAssigned)
  if (!pair) return null

  const [emp1, emp2] = pair
  const { depot1EmployeeId } = assignDepots(emp1, emp2, date)

  saveScheduleDay(date, emp1.id, emp2.id, depot1EmployeeId)

  return {
    result: {
      date,
      employee1_id: emp1.id,
      employee1_name: emp1.name,
      employee2_id: emp2.id,
      employee2_name: emp2.name,
      depot1_employee_id: depot1EmployeeId
    },
    nextPointer: rotationPointer + 2
  }
}

function dayToSuggestion(day: {
  date: string
  employee1_id: number
  employee1_name: string
  employee2_id: number
  employee2_name: string
  depot1_employee_id: number
}): ScheduleSuggestion {
  return {
    date: day.date,
    employee1_id: day.employee1_id,
    employee1_name: day.employee1_name,
    employee2_id: day.employee2_id,
    employee2_name: day.employee2_name,
    depot1_employee_id: day.depot1_employee_id
  }
}

export function generateMonthlySchedule(
  employees: Employee[],
  year: number,
  month: number
): ScheduleSuggestion[] {
  const activeEmployees = employees.filter(e => e.active === 1 && e.in_stretch === 1)
  if (activeEmployees.length < 2) return []

  const existing = getScheduleForMonth(year, month)
  const workingDays = getSchedulableDaysInMonth(year, month)
  if (workingDays.length === 0) return []

  const suggestions: ScheduleSuggestion[] = []
  let rotationPointer = getTotalAssignmentsBefore(workingDays[0])
  let lastAssigned = new Set<number>()

  for (const date of workingDays) {
    if (hasConfirmedAssignments(date)) {
      const day = existing.find(e => e.date === date)
      if (day) {
        suggestions.push(dayToSuggestion(day))
        lastAssigned = new Set([day.employee1_id, day.employee2_id])
        rotationPointer += 2
      }
      continue
    }

    deleteAssignmentForDate(date)

    const filled = fillScheduleDay(activeEmployees, date, rotationPointer, lastAssigned)
    if (!filled) continue

    suggestions.push(filled.result)
    rotationPointer = filled.nextPointer
    lastAssigned = new Set([filled.result.employee1_id, filled.result.employee2_id])
  }

  return suggestions
}

export function rebalanceFutureSchedule(
  employees: Employee[],
  year: number,
  month: number,
  lockedDates: string[],
  options?: { fromDate?: string }
): void {
  const activeEmployees = employees.filter(e => e.active === 1 && e.in_stretch === 1)
  if (activeEmployees.length < 2) return

  const locked = new Set(lockedDates)
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const fromDate = options?.fromDate ?? (isCurrentMonth ? getTodayString() : undefined)

  const allWorkingDays = getSchedulableDaysInMonth(year, month)
  const visibleDays = getSchedulableDaysInMonth(year, month, fromDate)

  const rebalanceStart = visibleDays.find(d => !locked.has(d) && !hasConfirmedAssignments(d))
  if (!rebalanceStart) return

  for (const date of visibleDays) {
    if (date >= rebalanceStart && !locked.has(date) && !hasConfirmedAssignments(date)) {
      deleteAssignmentForDate(date)
    }
  }

  const existingSchedule = getScheduleForMonth(year, month)
  let rotationPointer = getTotalAssignmentsBefore(rebalanceStart)
  let lastAssigned = new Set<number>()

  for (const date of allWorkingDays) {
    if (date < rebalanceStart) {
      const day = existingSchedule.find(d => d.date === date)
      if (day) {
        lastAssigned = new Set([day.employee1_id, day.employee2_id])
        rotationPointer += 2
      }
      continue
    }

    if (locked.has(date) || hasConfirmedAssignments(date)) {
      const day = getScheduleForMonth(year, month).find(d => d.date === date)
      if (day) {
        lastAssigned = new Set([day.employee1_id, day.employee2_id])
        rotationPointer += 2
      }
      continue
    }

    const filled = fillScheduleDay(activeEmployees, date, rotationPointer, lastAssigned)
    if (filled) {
      rotationPointer = filled.nextPointer
      lastAssigned = new Set([filled.result.employee1_id, filled.result.employee2_id])
    }
  }
}

function nextWorkingDayAfter(date: string, workingDays: string[]): string | null {
  const idx = workingDays.indexOf(date)
  if (idx === -1 || idx >= workingDays.length - 1) return null
  return workingDays[idx + 1]
}

export function rebalanceAfterReplacement(
  employees: Employee[],
  year: number,
  month: number,
  absenceDate: string,
  swapDate: string | null
): void {
  const activeEmployees = employees.filter(e => e.active === 1 && e.in_stretch === 1)
  if (activeEmployees.length < 2) return

  const workingDays = getSchedulableDaysInMonth(year, month)
  if (workingDays.length === 0) return

  const locked = new Set<string>()
  locked.add(absenceDate)
  if (swapDate) locked.add(swapDate)

  for (const date of workingDays) {
    if (hasConfirmedAssignments(date)) locked.add(date)
  }

  const regenStart = swapDate
    ? nextWorkingDayAfter(swapDate, workingDays)
    : nextWorkingDayAfter(absenceDate, workingDays)

  if (!regenStart) return

  for (const date of workingDays) {
    if (date >= regenStart && !locked.has(date) && !hasConfirmedAssignments(date)) {
      deleteAssignmentForDate(date)
    }
  }

  let rotationPointer = getTotalAssignmentsBefore(workingDays[0])
  let lastAssigned = new Set<number>()

  for (const date of workingDays) {
    const schedule = getScheduleForMonth(year, month)
    const day = schedule.find(d => d.date === date)
    const confirmed = hasConfirmedAssignments(date)

    if (date < regenStart || locked.has(date) || confirmed) {
      if (day) {
        lastAssigned = new Set([day.employee1_id, day.employee2_id])
        rotationPointer += 2
      }
      continue
    }

    const filled = fillScheduleDay(activeEmployees, date, rotationPointer, lastAssigned)
    if (filled) {
      rotationPointer = filled.nextPointer
      lastAssigned = new Set([filled.result.employee1_id, filled.result.employee2_id])
    }
  }
}

export function markHolidayAndRebalance(
  employees: Employee[],
  date: string
): boolean {
  if (hasConfirmedAssignments(date)) return false

  markStretchHoliday(date)
  deleteAssignmentForDate(date)

  const [year, month] = date.split('-').map(Number)
  const lockedDates = getWorkingDaysInMonth(year, month).filter(
    d => d < date || hasConfirmedAssignments(d)
  )

  rebalanceFutureSchedule(employees, year, month, lockedDates)
  return true
}

export function unmarkHolidayAndRebalance(
  employees: Employee[],
  date: string
): boolean {
  if (!isStretchHoliday(date)) return false
  if (hasConfirmedAssignments(date)) return false

  unmarkStretchHoliday(date)

  const [year, month] = date.split('-').map(Number)
  const lockedDates = getWorkingDaysInMonth(year, month).filter(
    d => d < date || hasConfirmedAssignments(d)
  )

  rebalanceFutureSchedule(employees, year, month, lockedDates, { fromDate: date })
  return true
}

/** @deprecated Use markHolidayAndRebalance */
export function deleteDayAndRebalance(
  employees: Employee[],
  date: string
): boolean {
  return markHolidayAndRebalance(employees, date)
}
