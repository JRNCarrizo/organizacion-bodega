import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { dialog } from 'electron'
import fs from 'fs'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  getScheduleForMonth,
  getAssignmentsForMonth,
  getDepotSettings,
  StretchScheduleDay,
  StretchAssignment,
  DepotSettings
} from './database'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

function formatDayLabel(dateStr: string): string {
  const date = parseISO(dateStr)
  return format(date, "EEE d/MM", { locale: es })
}

function getDepotName(depot: number, settings: DepotSettings): string {
  return depot === 1 ? settings.depot1Name : settings.depot2Name
}

function getPersonInfo(
  date: string,
  employeeId: number,
  employeeName: string,
  depot: number,
  depotSettings: DepotSettings,
  assignments: StretchAssignment[]
): string {
  const assignment = assignments.find(a => a.date === date && a.employee_id === employeeId)
  const depotLabel = getDepotName(depot, depotSettings)
  const completed = (assignment?.balls_count ?? 0) > 0
  const status = completed ? ' [OK]' : ''

  let text = `${employeeName} (${depotLabel})${status}`
  if (assignment?.is_replacement === 1 && assignment.original_employee_name) {
    text += `\nCubre a ${assignment.original_employee_name}`
  }
  return text
}

function buildRows(
  schedule: StretchScheduleDay[],
  assignments: StretchAssignment[],
  depotSettings: DepotSettings
): string[][] {
  return schedule.map(day => {
    const depot1Person = day.depot1_employee_id
    const depot2Person = day.depot1_employee_id === day.employee1_id ? day.employee2_id : day.employee1_id
    const depot1EmployeeName = day.depot1_employee_id === day.employee1_id ? day.employee1_name : day.employee2_name
    const depot2EmployeeName = day.depot1_employee_id === day.employee1_id ? day.employee2_name : day.employee1_name

    return [
      formatDayLabel(day.date),
      getPersonInfo(day.date, depot1Person, depot1EmployeeName, 1, depotSettings, assignments),
      getPersonInfo(day.date, depot2Person, depot2EmployeeName, 2, depotSettings, assignments)
    ]
  })
}

export async function exportSchedulePdf(year: number, month: number): Promise<{ success: boolean; message: string }> {
  const schedule = getScheduleForMonth(year, month)

  if (schedule.length === 0) {
    return { success: false, message: 'No hay turnos asignados para exportar este mes.' }
  }

  const assignments = getAssignmentsForMonth(year, month)
  const depotSettings = getDepotSettings()
  const heavyDepot = depotSettings.heavyDepot
  const lightDepot = heavyDepot === 1 ? 2 : 1
  const heavyName = heavyDepot === 1 ? depotSettings.depot1Name : depotSettings.depot2Name
  const lightName = lightDepot === 1 ? depotSettings.depot1Name : depotSettings.depot2Name
  const monthName = MONTH_NAMES[month - 1]

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Guardar calendario de turnos',
    defaultPath: `turnos-stretch-${monthName}-${year}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })

  if (canceled || !filePath) {
    return { success: false, message: 'Exportación cancelada.' }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Turnos - Stretch', 14, 18)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`${monthName} ${year}`, 14, 26)
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(`${heavyName} (Pesado)  |  ${lightName} (Liviano)  |  [OK] = Confirmado`, 14, 32)
  doc.setTextColor(0)

  const rows = buildRows(schedule, assignments, depotSettings)

  autoTable(doc, {
    startY: 38,
    head: [['Fecha', depotSettings.depot1Name, depotSettings.depot2Name]],
    body: rows,
    styles: {
      fontSize: 9,
      cellPadding: 4,
      valign: 'middle'
    },
    headStyles: {
      fillColor: [59, 130, 246],
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 78 },
      2: { cellWidth: 78 }
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250]
    },
    margin: { left: 14, right: 14 }
  })

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Organización Bodega — Página ${i} de ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
    doc.setTextColor(0)
  }

  const buffer = Buffer.from(doc.output('arraybuffer'))
  fs.writeFileSync(filePath, buffer)

  return { success: true, message: `PDF guardado en: ${filePath}` }
}
