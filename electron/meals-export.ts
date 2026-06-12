import { dialog } from 'electron'
import fs from 'fs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { getMealsEmployees } from './database'
import { getMealMenu, getMealDays, getMealSelections } from './meals-database'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const CATEGORY_SHORT: Record<string, string> = {
  CARNE: 'Carne',
  POLLO: 'Pollo',
  VEGGIE: 'Veggie',
  ENSALADA: 'Ensalada',
  PASTAS: 'Pastas',
  TARTA: 'Tarta',
  OMELETTE: 'Omelette'
}

export interface MealExportResult {
  success: boolean
  message: string
}

/** Parte el nombre del plato en 2-3 líneas para que entre en cada celda de la tabla. */
function wrapDishText(description: string, maxCharsPerLine = 34, maxLines = 3): string {
  const text = description.trim()
  if (!text) return ''

  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharsPerLine) {
      current = candidate
      continue
    }

    if (current) lines.push(current)
    current = word

    if (lines.length >= maxLines - 1) {
      const rest = [current, ...words.slice(words.indexOf(word) + 1)].join(' ')
      lines.push(rest)
      return lines.slice(0, maxLines).join('\n')
    }
  }

  if (current) lines.push(current)
  return lines.slice(0, maxLines).join('\n')
}

function formatDayLabel(weekday: string, date: string): string {
  const [, , day] = date.split('-')
  const shortDay = weekday.charAt(0) + weekday.slice(1, 3).toLowerCase()
  return `${shortDay}\n${day}`
}

function wrapEmployeeName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2 && name.length > 14) {
    return `${parts[0]}\n${parts.slice(1).join(' ')}`
  }
  return name.length > 16 ? wrapDishText(name, 16, 2) : name
}

function buildExportData(year: number, month: number) {
  const days = getMealDays(year, month)
  const selections = getMealSelections(year, month)
  const employees = getMealsEmployees()

  const selectionMap = new Map<string, string>()
  for (const sel of selections) {
    if (sel.description) {
      selectionMap.set(`${sel.employee_id}-${sel.date}`, sel.description)
    }
  }

  return {
    days,
    employees,
    selectionMap,
    monthName: MONTH_NAMES[month - 1],
    dayCount: days.length,
    employeeCount: employees.length
  }
}

/** Excel: empleados en filas, días en columnas. */
function buildExcelMatrix(year: number, month: number) {
  const { days, employees, selectionMap, monthName, dayCount } = buildExportData(year, month)

  const headers = ['Empleado', ...days.map(d => formatDayLabel(d.weekday, d.date))]
  const rows = employees.map(emp => {
    const row: string[] = [emp.name]
    for (const day of days) {
      const description = selectionMap.get(`${emp.id}-${day.date}`) ?? ''
      row.push(description ? wrapDishText(description) : '')
    }
    return row
  })

  return { headers, rows, days, monthName, dayCount }
}

/** PDF: días en filas, empleados en columnas — entra mejor en la página. */
function buildPdfMatrix(year: number, month: number) {
  const { days, employees, selectionMap, monthName, dayCount, employeeCount } = buildExportData(year, month)
  const charsPerLine = employeeCount > 8 ? 22 : employeeCount > 5 ? 28 : 32

  const headers = ['Día', ...employees.map(emp => wrapEmployeeName(emp.name))]
  const rows = days.map(day => {
    const row: string[] = [formatDayLabel(day.weekday, day.date)]
    for (const emp of employees) {
      const description = selectionMap.get(`${emp.id}-${day.date}`) ?? ''
      row.push(description ? wrapDishText(description, charsPerLine, 3) : '—')
    }
    return row
  })

  return { headers, rows, monthName, dayCount, employeeCount }
}

export async function exportMealMenuPdf(year: number, month: number): Promise<MealExportResult> {
  const menu = getMealMenu(year, month)
  if (!menu) {
    return { success: false, message: 'No hay menú importado para este mes.' }
  }

  const { headers, rows, monthName, employeeCount } = buildPdfMatrix(year, month)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar pedido de comidas (PDF)',
    defaultPath: `pedido-comidas-${monthName}-${year}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })

  if (canceled || !filePath) {
    return { success: false, message: 'Exportación cancelada.' }
  }

  const pageWidth = 297
  const margin = 8
  const usableWidth = pageWidth - margin * 2
  const dayColWidth = 16
  const employeeColWidth = Math.max(
    18,
    (usableWidth - dayColWidth) / Math.max(employeeCount, 1)
  )

  const columnStyles: Record<number, { cellWidth: number; fontStyle?: 'bold'; halign?: 'left' | 'center' }> = {
    0: { cellWidth: dayColWidth, fontStyle: 'bold', halign: 'center' }
  }
  for (let i = 1; i <= employeeCount; i++) {
    columnStyles[i] = { cellWidth: employeeColWidth, halign: 'left' }
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`Pedido de comidas - ${monthName} ${year}`, margin, 14)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Organización Bodega — días en filas, empleados en columnas', margin, 20)

  autoTable(doc, {
    startY: 24,
    head: [headers],
    body: rows,
    styles: {
      fontSize: employeeCount > 10 ? 5 : 5.5,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle',
      halign: 'left',
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [59, 130, 246],
      fontSize: employeeCount > 10 ? 5 : 5.5,
      halign: 'center',
      valign: 'middle'
    },
    columnStyles,
    margin: { left: margin, right: margin },
    showHead: 'everyPage'
  })

  const buffer = Buffer.from(doc.output('arraybuffer'))
  fs.writeFileSync(filePath, buffer)

  return { success: true, message: `PDF guardado en ${filePath}` }
}

export async function exportMealMenuExcel(year: number, month: number): Promise<MealExportResult> {
  const menu = getMealMenu(year, month)
  if (!menu) {
    return { success: false, message: 'No hay menú importado para este mes.' }
  }

  const { headers, rows, days, monthName, dayCount } = buildExcelMatrix(year, month)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar pedido de comidas (Excel)',
    defaultPath: `pedido-comidas-${monthName}-${year}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })

  if (canceled || !filePath) {
    return { success: false, message: 'Exportación cancelada.' }
  }

  const flatHeaders = headers.map((h, i) => i === 0 ? h : h.replace('\n', ' '))
  const menuSheet = [flatHeaders, ...rows]

  const detailHeaders = ['Fecha', 'Día', 'Categoría', 'Plato']
  const detailRows: string[][] = []
  for (const day of days) {
    for (const option of day.options) {
      detailRows.push([
        day.date,
        day.weekday,
        CATEGORY_SHORT[option.category] ?? option.category,
        option.description
      ])
    }
  }

  const workbook = XLSX.utils.book_new()
  const pedidoSheet = XLSX.utils.aoa_to_sheet(menuSheet)
  const platosSheet = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows])

  pedidoSheet['!cols'] = [
    { wch: 22 },
    ...Array.from({ length: dayCount }, () => ({ wch: 36 }))
  ]

  const rowHeights: Record<number, { hpt: number }> = { 0: 28 }
  for (let r = 1; r <= rows.length; r++) {
    rowHeights[r] = { hpt: 54 }
  }
  pedidoSheet['!rows'] = rowHeights

  XLSX.utils.book_append_sheet(workbook, pedidoSheet, 'Pedido')
  XLSX.utils.book_append_sheet(workbook, platosSheet, 'Menú del mes')
  XLSX.writeFile(workbook, filePath)

  return { success: true, message: `Excel guardado en ${filePath}` }
}
