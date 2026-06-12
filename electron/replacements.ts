import {
  getAssignmentsForDate,
  getScheduleForMonth,
  deleteAssignmentForDate,
  saveScheduleDay,
  getEmployeeName,
  getDepotSettings,
  getStretchEmployees,
  initDatabase,
  StretchScheduleDay
} from './database'
import { rebalanceAfterReplacement, getWorkingDaysInMonth } from './scheduler'

export interface ReplacementResult {
  success: boolean
  message: string
  swapDate: string | null
}

function swapWithDepotCompensation(
  day: StretchScheduleDay,
  replacementEmployeeId: number,
  absentEmployeeId: number,
  absentDepot: number
): void {
  const otherEmployeeId = day.employee1_id === replacementEmployeeId
    ? day.employee2_id
    : day.employee1_id

  const depot1EmployeeId = absentDepot === 1 ? absentEmployeeId : otherEmployeeId

  deleteAssignmentForDate(day.date)
  saveScheduleDay(day.date, absentEmployeeId, otherEmployeeId, depot1EmployeeId)
}

function findCompensationDay(
  schedule: StretchScheduleDay[],
  absenceDate: string,
  replacementEmployeeId: number
): StretchScheduleDay | null {
  return schedule.find(
    d => d.date > absenceDate &&
      (d.employee1_id === replacementEmployeeId || d.employee2_id === replacementEmployeeId)
  ) ?? null
}

export function replaceAbsentEmployee(
  date: string,
  absentEmployeeId: number,
  replacementEmployeeId: number
): ReplacementResult {
  if (absentEmployeeId === replacementEmployeeId) {
    return { success: false, message: 'El reemplazo debe ser otra persona.', swapDate: null }
  }

  const dayAssignments = getAssignmentsForDate(date)
  const absentAssignment = dayAssignments.find(a => a.employee_id === absentEmployeeId)

  if (!absentAssignment) {
    return { success: false, message: 'Esa persona no está asignada en este día.', swapDate: null }
  }

  if (dayAssignments.some(a => a.employee_id === replacementEmployeeId)) {
    return { success: false, message: 'Esa persona ya está asignada este día.', swapDate: null }
  }

  const absentDepot = absentAssignment.depot
  const completed = absentAssignment.balls_count
  const database = initDatabase()

  // Paso 1: el reemplazo cubre hoy en el mismo depósito
  database.prepare('DELETE FROM stretch_assignments WHERE date = ? AND employee_id = ?')
    .run(date, absentEmployeeId)

  database.prepare(`
    INSERT INTO stretch_assignments (date, employee_id, depot, balls_count, original_employee_id, is_replacement)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(date, replacementEmployeeId, absentDepot, completed, absentEmployeeId)

  const [year, month] = date.split('-').map(Number)
  const schedule = getScheduleForMonth(year, month)

  // Paso 2: el ausente recupera en el próximo turno del reemplazo
  const compensationDay = findCompensationDay(schedule, date, replacementEmployeeId)
  let swapDate: string | null = null

  if (compensationDay) {
    swapWithDepotCompensation(compensationDay, replacementEmployeeId, absentEmployeeId, absentDepot)
    swapDate = compensationDay.date
  }

  // Paso 3: reajustar días posteriores manteniendo la rotación
  rebalanceAfterReplacement(getStretchEmployees(), year, month, date, swapDate)

  const absentName = getEmployeeName(absentEmployeeId)
  const replacementName = getEmployeeName(replacementEmployeeId)
  const depotSettings = getDepotSettings()
  const depotName = absentDepot === 1 ? depotSettings.depot1Name : depotSettings.depot2Name

  if (swapDate) {
    const [, m, d] = swapDate.split('-').map(Number)
    const regenStart = getWorkingDaysInMonth(year, month).find(d => d > swapDate)
    const regenNote = regenStart
      ? ` Los turnos desde el ${regenStart.split('-')[2]}/${m} se reacomodaron.`
      : ''

    return {
      success: true,
      swapDate,
      message: `${replacementName} cubre hoy a ${absentName}. ${absentName} recupera el ${d}/${m} en ${depotName} (turno de ${replacementName}).${regenNote}`
    }
  }

  const nextDay = getWorkingDaysInMonth(year, month).find(d => d > date)
  const regenNote = nextDay
    ? ` Los turnos desde el ${nextDay.split('-')[2]}/${nextDay.split('-')[1]} se reacomodaron.`
    : ''

  return {
    success: true,
    swapDate: null,
    message: `${replacementName} cubre hoy a ${absentName}.${regenNote} ${absentName} no tenía más turnos este mes — la rotación se compensa al generar el mes siguiente.`
  }
}
