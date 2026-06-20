import { dialog } from 'electron'
import fs from 'fs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx-js-style'
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
  filePath?: string
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
    selections,
    employees,
    selectionMap,
    monthName: MONTH_NAMES[month - 1],
    dayCount: days.length,
    employeeCount: employees.length
  }
}

/** Agrupa pedidos por día y plato (descripción). */
function countDishesByDay(
  dayDates: string[],
  selections: ReturnType<typeof getMealSelections>
): Map<string, Map<string, { count: number; label: string }>> {
  const byDay = new Map<string, Map<string, { count: number; label: string }>>()
  for (const date of dayDates) {
    byDay.set(date, new Map())
  }

  for (const sel of selections) {
    const dayMap = byDay.get(sel.date)
    if (!dayMap || !sel.description?.trim()) continue

    const label = sel.description.trim().replace(/\s+/g, ' ')
    const key = label.toLowerCase()
    const existing = dayMap.get(key)
    if (existing) {
      existing.count += 1
    } else {
      dayMap.set(key, { count: 1, label })
    }
  }

  return byDay
}

function formatDayDishSummary(
  counts: Map<string, { count: number; label: string }>,
  charsPerLine: number
): string {
  if (counts.size === 0) return '—'

  const lines = Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
    .map(({ count, label }) => {
      const dish = label.length > charsPerLine - 3
        ? `${label.slice(0, Math.max(4, charsPerLine - 4)).trim()}…`
        : label
      return `${count} ${dish}`
    })

  return lines.slice(0, 12).join('\n')
}

function buildSummaryFootRow(
  daySubset: ReturnType<typeof getMealDays>,
  selections: ReturnType<typeof getMealSelections>,
  charsPerLine: number
): string[] {
  const countsByDay = countDishesByDay(daySubset.map(d => d.date), selections)
  return [
    'Totales',
    ...daySubset.map(day => formatDayDishSummary(countsByDay.get(day.date) ?? new Map(), charsPerLine))
  ]
}

/** Excel y PDF: empleados en filas, días en columnas. */
function buildEmployeeRowsMatrix(
  year: number,
  month: number,
  daySubset: ReturnType<typeof getMealDays>
) {
  const { employees, selectionMap, selections } = buildExportData(year, month)
  const days = daySubset
  const charsPerLine = days.length > 12 ? 16 : days.length > 8 ? 20 : days.length > 5 ? 26 : 32

  const headers = ['Empleado', ...days.map(d => formatDayLabel(d.weekday, d.date))]
  const rows = employees.map(emp => {
    const row: string[] = [wrapEmployeeName(emp.name)]
    for (const day of days) {
      const description = selectionMap.get(`${emp.id}-${day.date}`) ?? ''
      row.push(description ? wrapDishText(description, charsPerLine, 3) : '—')
    }
    return row
  })

  const foot = [buildSummaryFootRow(days, selections, charsPerLine)]

  return { headers, rows, foot }
}

function buildExcelMatrix(year: number, month: number) {
  const { days, employees, selectionMap, selections, monthName, dayCount } = buildExportData(year, month)

  const headers = ['Empleado', ...days.map(d => formatDayLabel(d.weekday, d.date))]
  const rows = employees.map(emp => {
    const row: string[] = [emp.name]
    for (const day of days) {
      const description = selectionMap.get(`${emp.id}-${day.date}`) ?? ''
      row.push(description ? wrapDishText(description) : '')
    }
    return row
  })

  const summaryRow = buildSummaryFootRow(days, selections, 36)

  return { headers, rows, summaryRow, days, monthName, dayCount }
}

function applyExcelMultilineStyles(
  sheet: XLSX.WorkSheet,
  rowCount: number,
  colCount: number,
  summaryRowIndex: number
): number {
  let maxSummaryLines = 1

  for (let row = 1; row <= rowCount; row++) {
    for (let col = 0; col <= colCount; col++) {
      const addr = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = sheet[addr]
      if (!cell || cell.v == null) continue

      const text = String(cell.v)
      const lineCount = text.split('\n').length
      const isSummaryRow = row === summaryRowIndex

      if (isSummaryRow) {
        maxSummaryLines = Math.max(maxSummaryLines, lineCount)
        cell.s = {
          font: { bold: true, color: { rgb: '166534' } },
          fill: { fgColor: { rgb: 'ECFDF5' } },
          alignment: { wrapText: true, vertical: 'top' }
        }
        continue
      }

      if (lineCount > 1) {
        cell.s = {
          alignment: { wrapText: true, vertical: 'top' }
        }
      }
    }
  }

  return maxSummaryLines
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks.length > 0 ? chunks : [[]]
}

function getMaxDaysPerPdfPage(): number {
  const pageWidth = 297
  const margin = 8
  const usableWidth = pageWidth - margin * 2
  const nameColWidth = 28
  const minDayColWidth = 21
  return Math.max(1, Math.floor((usableWidth - nameColWidth) / minDayColWidth))
}

function formatDayRangeLabel(days: Array<{ weekday: string; date: string }>): string {
  if (days.length === 0) return ''
  const first = days[0]
  const last = days[days.length - 1]
  const [, , d1] = first.date.split('-')
  const [, , d2] = last.date.split('-')
  const w1 = first.weekday.slice(0, 3).toLowerCase()
  const w2 = last.weekday.slice(0, 3).toLowerCase()
  if (days.length === 1) return `${w1} ${d1}`
  return `${w1} ${d1} — ${w2} ${d2}`
}

export async function exportMealMenuPdf(year: number, month: number): Promise<MealExportResult> {
  const menu = getMealMenu(year, month)
  if (!menu) {
    return { success: false, message: 'No hay menú importado para este mes.' }
  }

  const { days, monthName } = buildExportData(year, month)
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
  const nameColWidth = 28
  const dayChunks = chunkArray(days, getMaxDaysPerPdfPage())
  const totalSheets = dayChunks.length

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  dayChunks.forEach((dayChunk, sheetIndex) => {
    if (sheetIndex > 0) doc.addPage()

    const { headers, rows, foot } = buildEmployeeRowsMatrix(year, month, dayChunk)
    const dayColWidth = Math.max(18, (usableWidth - nameColWidth) / Math.max(dayChunk.length, 1))
    const dayRange = formatDayRangeLabel(dayChunk)

    const columnStyles: Record<number, { cellWidth: number; fontStyle?: 'bold'; halign?: 'left' | 'center' }> = {
      0: { cellWidth: nameColWidth, fontStyle: 'bold', halign: 'left' }
    }
    for (let i = 1; i <= dayChunk.length; i++) {
      columnStyles[i] = { cellWidth: dayColWidth, halign: 'left' }
    }

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(`Pedido de comidas - ${monthName} ${year}`, margin, 14)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const sheetNote = totalSheets > 1
      ? `Hoja ${sheetIndex + 1} de ${totalSheets} · Días: ${dayRange}`
      : 'Empleados en filas, días en columnas'
    doc.text(`Organización Bodega — ${sheetNote}`, margin, 20)

    autoTable(doc, {
      startY: 24,
      head: [headers],
      body: rows,
      foot,
      styles: {
        fontSize: dayChunk.length > 12 ? 5 : 5.5,
        cellPadding: 2,
        overflow: 'linebreak',
        valign: 'middle',
        halign: 'left',
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [59, 130, 246],
        fontSize: dayChunk.length > 12 ? 5 : 5.5,
        halign: 'center',
        valign: 'middle'
      },
      footStyles: {
        fillColor: [236, 253, 245],
        textColor: [22, 101, 52],
        fontStyle: 'bold',
        fontSize: dayChunk.length > 12 ? 4.5 : 5,
        halign: 'left',
        valign: 'top',
        cellPadding: 2.5
      },
      columnStyles,
      margin: { left: margin, right: margin },
      showHead: 'everyPage'
    })
  })

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Organización Bodega — Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
    doc.setTextColor(0)
  }

  const buffer = Buffer.from(doc.output('arraybuffer'))
  fs.writeFileSync(filePath, buffer)

  const sheetNote = totalSheets > 1 ? ` (${totalSheets} hojas por días)` : ''
  return { success: true, message: `PDF guardado en ${filePath}${sheetNote}`, filePath }
}

export async function exportMealMenuExcel(year: number, month: number): Promise<MealExportResult> {
  const menu = getMealMenu(year, month)
  if (!menu) {
    return { success: false, message: 'No hay menú importado para este mes.' }
  }

  const { headers, rows, summaryRow, days, monthName, dayCount } = buildExcelMatrix(year, month)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar pedido de comidas (Excel)',
    defaultPath: `pedido-comidas-${monthName}-${year}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })

  if (canceled || !filePath) {
    return { success: false, message: 'Exportación cancelada.' }
  }

  const flatHeaders = headers.map((h, i) => i === 0 ? h : h.replace('\n', ' '))
  const menuSheet = [flatHeaders, ...rows, summaryRow]

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

  const summaryRowIndex = rows.length + 1
  const maxSummaryLines = applyExcelMultilineStyles(pedidoSheet, summaryRowIndex, dayCount, summaryRowIndex)

  pedidoSheet['!cols'] = [
    { wch: 22 },
    ...Array.from({ length: dayCount }, () => ({ wch: 36 }))
  ]

  pedidoSheet['!rows'] = [
    { hpt: 28 },
    ...rows.map(() => ({ hpt: 54 })),
    { hpt: Math.min(160, Math.max(48, maxSummaryLines * 15 + 10)) }
  ]

  XLSX.utils.book_append_sheet(workbook, pedidoSheet, 'Pedido')
  XLSX.utils.book_append_sheet(workbook, platosSheet, 'Menú del mes')
  XLSX.writeFile(workbook, filePath)

  return { success: true, message: `Excel guardado en ${filePath}`, filePath }
}
