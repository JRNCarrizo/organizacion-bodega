import { dialog } from 'electron'
import fs from 'fs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getSupplyOrder } from './supplies-database'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export interface SupplyExportResult {
  success: boolean
  message: string
  filePath?: string
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return ''
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',')
}

function formatIssuedAt(): string {
  return new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export async function exportSupplyOrderPdf(year: number, month: number): Promise<SupplyExportResult> {
  const order = getSupplyOrder(year, month)
  const requested = order.lines.filter(line => line.requested === 1)
  const monthName = MONTH_NAMES[month - 1]

  if (requested.length === 0) {
    return { success: false, message: 'No hay productos marcados para pedir este mes.' }
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Guardar listado de mercadería',
    defaultPath: `Listado-Mercaderia-${monthName}-${year}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })

  if (canceled || !filePath) {
    return { success: false, message: 'Exportación cancelada.' }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Bodega Esmeralda', 14, 18)

  doc.setFontSize(13)
  doc.text('Listado de mercadería mensual', 14, 26)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(70)
  doc.text(`Período: ${monthName} ${year}`, 14, 34)
  doc.text(`Fecha de emisión: ${formatIssuedAt()}`, 14, 39)
  doc.text(`Ítems solicitados: ${requested.length}`, 14, 44)

  if (order.notes.trim()) {
    doc.setFontSize(9)
    doc.text(`Nota: ${order.notes.trim()}`, 14, 50, { maxWidth: 182 })
  }

  doc.setTextColor(0)

  autoTable(doc, {
    startY: order.notes.trim() ? 56 : 50,
    head: [['#', 'Producto', 'Cantidad', 'Unidad', 'Observaciones']],
    body: requested.map((line, index) => [
      String(index + 1),
      line.name,
      formatQuantity(line.quantity),
      line.unit || '—',
      line.note || '—'
    ]),
    styles: {
      fontSize: 10,
      cellPadding: 3.2,
      valign: 'middle'
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 78 },
      2: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 40 }
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
      `Bodega Esmeralda — Listado de mercadería mensual — ${monthName} ${year} — Página ${i} de ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
    doc.setTextColor(0)
  }

  const buffer = Buffer.from(doc.output('arraybuffer'))
  fs.writeFileSync(filePath, buffer)

  return { success: true, message: `PDF guardado en: ${filePath}`, filePath }
}
