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

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks.length > 0 ? chunks : [[]]
}

const PLANILLA_WEEKDAYS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'] as const

interface PlanillaColumn {
  date: string | null
  weekdayLabel: string
  isSeparator: boolean
  isFriday: boolean
}

interface PlanillaWeekBlock {
  days: Array<{ date: string | null; weekdayLabel: string }>
}

type BorderSide = { style: string; color: { rgb: string } }
type CellBorder = {
  top: BorderSide
  bottom: BorderSide
  left: BorderSide
  right: BorderSide
}

const THIN_BORDER: BorderSide = { style: 'thin', color: { rgb: 'FF000000' } }
const THICK_BORDER: BorderSide = { style: 'thick', color: { rgb: 'FF000000' } }
const MEDIUM_BORDER: BorderSide = { style: 'medium', color: { rgb: 'FF000000' } }

function makeBorder(
  top: BorderSide,
  right: BorderSide,
  bottom: BorderSide,
  left: BorderSide
): CellBorder {
  return { top, right, bottom, left }
}

function getPlanillaBorder(column: PlanillaColumn | null, isNameCol: boolean): CellBorder {
  if (isNameCol) {
    return makeBorder(THIN_BORDER, THIN_BORDER, THIN_BORDER, THIN_BORDER)
  }
  if (column?.isSeparator) {
    return makeBorder(THIN_BORDER, MEDIUM_BORDER, THIN_BORDER, MEDIUM_BORDER)
  }
  if (column?.isFriday) {
    return makeBorder(THIN_BORDER, THICK_BORDER, THIN_BORDER, THIN_BORDER)
  }
  return makeBorder(THIN_BORDER, THIN_BORDER, THIN_BORDER, THIN_BORDER)
}

function withBorderStyle(base: Record<string, unknown>, border: CellBorder): Record<string, unknown> {
  return { ...base, border }
}

function getMondayOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dow = copy.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  copy.setDate(copy.getDate() + diff)
  return copy
}

function addCalendarDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  copy.setDate(copy.getDate() + days)
  return copy
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildPlanillaWeekBlocks(year: number, month: number): PlanillaWeekBlock[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month - 1, daysInMonth)
  const blocks: PlanillaWeekBlock[] = []

  let weekMonday = getMondayOfWeek(monthStart)
  const lastMonday = getMondayOfWeek(monthEnd)

  while (weekMonday <= lastMonday) {
    const days: Array<{ date: string | null; weekdayLabel: string }> = []
    for (let i = 0; i < 5; i++) {
      const current = addCalendarDays(weekMonday, i)
      const inMonth = current.getMonth() + 1 === month
      days.push({
        date: inMonth ? formatIsoDate(current) : null,
        weekdayLabel: PLANILLA_WEEKDAYS[i]
      })
    }
    blocks.push({ days })
    weekMonday = addCalendarDays(weekMonday, 7)
  }

  return blocks
}

function formatPlanillaEmployeeName(name: string): string {
  return name.trim().toUpperCase()
}

function buildPlanillaColumns(blocks: PlanillaWeekBlock[]): PlanillaColumn[] {
  const columns: PlanillaColumn[] = []
  blocks.forEach((block, index) => {
    block.days.forEach((day, dayIndex) => {
      columns.push({
        date: day.date,
        weekdayLabel: day.weekdayLabel,
        isSeparator: false,
        isFriday: dayIndex === 4
      })
    })
    if (index < blocks.length - 1) {
      columns.push({
        date: null,
        weekdayLabel: '',
        isSeparator: true,
        isFriday: false
      })
    }
  })
  return columns
}

const PLANILLA_COL_WIDTHS = [
  14.9, 16.8, 16.8, 19.9, 18.8, 21.5, 3.4,
  16.8, 19.9, 18.8, 21.5, 20.5, 3.4,
  16.8, 19.9, 18.8, 21.5, 20.5, 3.4,
  16.8, 19.9, 18.2, 20.8, 20.4, 3.4,
  20.4, 22.4, 22.4, 22.4, 22.4
]

const HEADER_BASE = {
  font: { bold: true, sz: 10 },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
}

const NAME_BASE = {
  font: { bold: true, sz: 10 },
  alignment: { horizontal: 'left', vertical: 'center' }
}

const DATA_BASE = {
  alignment: { horizontal: 'left', vertical: 'top', wrapText: true }
}

const TOTAL_BASE = {
  font: { bold: true, sz: 10 },
  alignment: { horizontal: 'left', vertical: 'center' },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFECFDF5' } }
}

const TOTAL_DATA_BASE = {
  font: { bold: true, sz: 9, color: { rgb: 'FF166534' } },
  alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFECFDF5' } }
}

function setPlanillaCell(
  sheet: XLSX.WorkSheet,
  row: number,
  col: number,
  border: CellBorder,
  baseStyle: Record<string, unknown>,
  value?: string | number | Date,
  dateFormat?: string
) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  const style = withBorderStyle(baseStyle, border)

  if (value === undefined || value === '') {
    sheet[addr] = { s: style }
    return
  }

  if (value instanceof Date) {
    sheet[addr] = {
      t: 'd',
      v: value,
      z: dateFormat ?? 'd-mmm',
      s: style
    }
    return
  }

  sheet[addr] = {
    t: typeof value === 'number' ? 'n' : 's',
    v: value,
    s: style
  }
}

function buildPlanillaWorksheet(year: number, month: number) {
  const { employees, selectionMap, selections } = buildExportData(year, month)
  const weekBlocks = buildPlanillaWeekBlocks(year, month)
  const columns = buildPlanillaColumns(weekBlocks)
  const planillaDates = columns.map(col => col.date).filter((d): d is string => d !== null)
  const countsByDay = countDishesByDay(planillaDates, selections)
  const summaryCharsPerLine = 18

  const dateRow = 1
  const headerRow = 2
  const dataStartRow = 3
  const employeeCount = employees.length
  const emptyRow = dataStartRow + employeeCount
  const totalRow = emptyRow + 1
  const lastRow = totalRow
  const lastCol = columns.length

  const sheet: XLSX.WorkSheet = {}
  const rows: Array<{ hpt?: number }> = [
    { hpt: 14 },
    { hpt: 15 },
    { hpt: 14 }
  ]

  setPlanillaCell(
    sheet,
    headerRow,
    0,
    getPlanillaBorder(null, true),
    NAME_BASE,
    'NOMBRE '
  )
  columns.forEach((col, index) => {
    const border = getPlanillaBorder(col, false)
    setPlanillaCell(
      sheet,
      headerRow,
      index + 1,
      border,
      HEADER_BASE,
      col.weekdayLabel ? `${col.weekdayLabel} ` : undefined
    )
  })

  setPlanillaCell(sheet, dateRow, 0, getPlanillaBorder(null, true), DATA_BASE)
  columns.forEach((col, index) => {
    const border = getPlanillaBorder(col, false)
    if (!col.date) {
      setPlanillaCell(sheet, dateRow, index + 1, border, HEADER_BASE)
      return
    }
    const [y, m, d] = col.date.split('-').map(Number)
    setPlanillaCell(
      sheet,
      dateRow,
      index + 1,
      border,
      HEADER_BASE,
      new Date(y, m - 1, d),
      'd-mmm'
    )
  })

  employees.forEach((emp, empIndex) => {
    const row = dataStartRow + empIndex
    rows.push({ hpt: 69 })
    setPlanillaCell(
      sheet,
      row,
      0,
      getPlanillaBorder(null, true),
      NAME_BASE,
      formatPlanillaEmployeeName(emp.name)
    )

    columns.forEach((col, colIndex) => {
      const border = getPlanillaBorder(col, false)
      if (!col.date) {
        setPlanillaCell(sheet, row, colIndex + 1, border, DATA_BASE)
        return
      }
      const description = selectionMap.get(`${emp.id}-${col.date}`) ?? ''
      setPlanillaCell(
        sheet,
        row,
        colIndex + 1,
        border,
        DATA_BASE,
        description ? wrapDishText(description, 28, 4) : undefined
      )
    })
  })

  rows.push({ hpt: 21 })

  setPlanillaCell(sheet, emptyRow, 0, getPlanillaBorder(null, true), DATA_BASE)
  columns.forEach((col, colIndex) => {
    setPlanillaCell(sheet, emptyRow, colIndex + 1, getPlanillaBorder(col, false), DATA_BASE)
  })

  let maxTotalLines = 1
  setPlanillaCell(sheet, totalRow, 0, getPlanillaBorder(null, true), TOTAL_BASE, 'TOTAL')

  columns.forEach((col, colIndex) => {
    const border = getPlanillaBorder(col, false)
    if (!col.date) {
      setPlanillaCell(sheet, totalRow, colIndex + 1, border, TOTAL_DATA_BASE)
      return
    }
    const summary = formatDayDishSummary(
      countsByDay.get(col.date) ?? new Map(),
      summaryCharsPerLine
    )
    const lineCount = summary === '—' ? 1 : summary.split('\n').length
    maxTotalLines = Math.max(maxTotalLines, lineCount)
    setPlanillaCell(
      sheet,
      totalRow,
      colIndex + 1,
      border,
      TOTAL_DATA_BASE,
      summary === '—' ? undefined : summary
    )
  })

  rows.push({ hpt: Math.min(160, Math.max(28, maxTotalLines * 15 + 10)) })

  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastRow, c: lastCol }
  })

  sheet['!cols'] = Array.from({ length: lastCol + 1 }, (_, index) => ({
    wch: PLANILLA_COL_WIDTHS[index] ?? 18
  }))

  sheet['!rows'] = rows

  return sheet
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

  const { monthName } = buildExportData(year, month)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar planilla de comidas (Excel)',
    defaultPath: `Planilla Bodegas Deposito - ${monthName} ${year}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })

  if (canceled || !filePath) {
    return { success: false, message: 'Exportación cancelada.' }
  }

  const workbook = XLSX.utils.book_new()
  const planillaSheet = buildPlanillaWorksheet(year, month)
  XLSX.utils.book_append_sheet(workbook, planillaSheet, 'Planilla Bodegas Depo')
  XLSX.writeFile(workbook, filePath, { cellStyles: true })

  return { success: true, message: `Excel guardado en ${filePath}`, filePath }
}
