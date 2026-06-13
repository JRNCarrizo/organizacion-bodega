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
import { rebalanceAfterReplacement, getWorkingDaysInMonth, getSchedulableDaysInMonth } from './scheduler'

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
  replacementEmployeeId: number,
  schedulableDays: string[]
): StretchScheduleDay | null {
  const scheduleByDate = new Map(schedule.map(d => [d.date, d]))

  for (const date of schedulableDays) {
    if (date <= absenceDate) continue

    const day = scheduleByDate.get(date)
    if (!day) continue

    if (day.employee1_id === replacementEmployeeId || day.employee2_id === replacementEmployeeId) {
      return day
    }
  }

  return null
}

function getBeneficiaryEmployeeId(
  absentEmployeeId: number,
  absentAssignment: { is_replacement?: number; original_employee_id?: number | null }
): number {
  if (absentAssignment.is_replacement === 1 && absentAssignment.original_employee_id) {
    return absentAssignment.original_employee_id
  }
  return absentEmployeeId
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
  const beneficiaryId = getBeneficiaryEmployeeId(absentEmployeeId, absentAssignment)
  const database = initDatabase()

  // Paso 1: el reemplazo cubre hoy en el mismo depósito
  database.prepare('DELETE FROM stretch_assignments WHERE date = ? AND employee_id = ?')
    .run(date, absentEmployeeId)

  database.prepare(`
    INSERT INTO stretch_assignments (date, employee_id, depot, balls_count, original_employee_id, is_replacement)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(date, replacementEmployeeId, absentDepot, completed, beneficiaryId)

  const [year, month] = date.split('-').map(Number)
  const schedule = getScheduleForMonth(year, month)
  const schedulableDays = getSchedulableDaysInMonth(year, month)

  // Paso 2: quien debe recuperar el turno toma el próximo turno del reemplazo
  const compensationDay = findCompensationDay(schedule, date, replacementEmployeeId, schedulableDays)
  let swapDate: string | null = null

  if (compensationDay) {
    swapWithDepotCompensation(compensationDay, replacementEmployeeId, beneficiaryId, absentDepot)
    swapDate = compensationDay.date
  }

  // Paso 3: reajustar días posteriores manteniendo la rotación
  rebalanceAfterReplacement(getStretchEmployees(), year, month, date, swapDate)

  const absentName = getEmployeeName(absentEmployeeId)
  const beneficiaryName = beneficiaryId === absentEmployeeId
    ? absentName
    : getEmployeeName(beneficiaryId)
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
      message: beneficiaryId === absentEmployeeId
        ? `${replacementName} cubre hoy a ${absentName}. ${beneficiaryName} recupera el ${d}/${m} en ${depotName} (turno de ${replacementName}).${regenNote}`
        : `${replacementName} cubre hoy a ${absentName} (por ${beneficiaryName}). ${beneficiaryName} recupera el ${d}/${m} en ${depotName} (turno de ${replacementName}).${regenNote}`
    }
  }

  const nextDay = getWorkingDaysInMonth(year, month).find(d => d > date)
  const regenNote = nextDay
    ? ` Los turnos desde el ${nextDay.split('-')[2]}/${nextDay.split('-')[1]} se reacomodaron.`
    : ''

  return {
    success: true,
    swapDate: null,
    message: beneficiaryId === absentEmployeeId
      ? `${replacementName} cubre hoy a ${absentName}.${regenNote} ${beneficiaryName} no tenía más turnos este mes — la rotación se compensa al generar el mes siguiente.`
      : `${replacementName} cubre hoy a ${absentName} (por ${beneficiaryName}).${regenNote} ${beneficiaryName} no tenía más turnos este mes — la rotación se compensa al generar el mes siguiente.`
  }
}
