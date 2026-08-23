import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addMonths, format, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import type { SupplyHistoryMonth, SupplyItem, SupplyOrderLineView, SupplyOrderView } from '../../types'
import { useAppRefresh } from '../../hooks/useAppRefresh'
import SettingsInfoButton from '../settings/SettingsInfoButton'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

function capitalizeMonth(date: Date): string {
  const formatted = format(date, 'MMMM yyyy', { locale: es })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return ''
  return Number.isInteger(value) ? String(value) : String(value)
}

function ipcError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  const cleaned = raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/i, '')
  return cleaned || fallback
}

function lastLabel(line: SupplyOrderLineView): string | null {
  if (line.last_quantity == null || line.last_year == null || line.last_month == null) return null
  const unit = line.last_unit ? ` ${line.last_unit}` : ''
  return `Antes: ${formatQty(line.last_quantity)}${unit} (${MONTH_NAMES[line.last_month - 1].slice(0, 3)} ${line.last_year})`
}

function formatIssuedDisplay(value: string | null | undefined): string {
  if (!value) return 'Sin emitir'
  const [year, month, day] = value.split('-').map(Number)
  return format(new Date(year, month - 1, day), 'dd/MM/yyyy')
}

export default function SuppliesPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [order, setOrder] = useState<SupplyOrderView | null>(null)
  const [items, setItems] = useState<SupplyItem[]>([])
  const [history, setHistory] = useState<SupplyHistoryMonth[]>([])
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newUnit, setNewUnit] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [exporting, setExporting] = useState(false)
  const [lastExportPath, setLastExportPath] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const historyRef = useRef<HTMLDivElement>(null)
  const issuedInputRef = useRef<HTMLInputElement>(null)
  const { refreshKey } = useAppRefresh()

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const load = async () => {
    const [orderData, itemData, historyData] = await Promise.all([
      window.api.supplies.getOrder(year, month),
      window.api.supplies.getItems(),
      window.api.supplies.getHistory()
    ])
    setOrder(orderData)
    setItems(itemData)
    setHistory(historyData)
    setNotesDraft(orderData.notes)
  }

  useEffect(() => {
    load().catch(() => setError('No se pudo cargar el pedido.'))
  }, [year, month, refreshKey])

  useEffect(() => {
    setLastExportPath(null)
    setMessage('')
    setError('')
  }, [year, month])

  useLayoutEffect(() => {
    const el = historyRef.current
    if (!el) return

    const fitToWidth = () => {
      const chips = Array.from(el.querySelectorAll<HTMLElement>('.supplies-history-chip'))
      const maxWidth = el.clientWidth
      const styles = getComputedStyle(el)
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 8
      let used = 0
      let count = 0

      for (const chip of chips) {
        chip.hidden = false
      }

      for (const chip of chips) {
        const next = count === 0 ? chip.offsetWidth : used + gap + chip.offsetWidth
        if (count > 0 && next > maxWidth) {
          chip.hidden = true
        } else {
          used = next
          count += 1
        }
      }
    }

    fitToWidth()
    const observer = new ResizeObserver(fitToWidth)
    observer.observe(el)
    return () => observer.disconnect()
  }, [history])

  const lines = order?.lines ?? []
  const requestedCount = lines.filter(line => line.requested === 1).length
  const skippedCount = lines.length - requestedCount
  const usedIds = new Set(lines.map(line => line.item_id))
  const catalogSuggestions = items.filter(item => !usedIds.has(item.id))

  const nameSuggestions = useMemo(() => {
    const query = newName.trim().toLowerCase()
    if (!query) return catalogSuggestions.slice(0, 8)
    return catalogSuggestions
      .filter(item => item.name.toLowerCase().includes(query))
      .slice(0, 8)
  }, [catalogSuggestions, newName])

  const handleAdd = async (name = newName, unit = newUnit) => {
    if (!name.trim()) return
    setError('')
    setMessage('')
    try {
      const qty = Number(String(newQty).replace(',', '.'))
      await window.api.supplies.addLine(year, month, name, qty, unit)
      setNewName('')
      setNewQty('1')
      setNewUnit('')
      await load()
    } catch (err) {
      setError(ipcError(err, 'No se pudo agregar el producto.'))
    }
  }

  const handleUpdateLine = async (
    lineId: number,
    updates: { quantity?: number; unit?: string; requested?: boolean; note?: string }
  ) => {
    setError('')
    try {
      await window.api.supplies.updateLine(lineId, updates)
      await load()
    } catch {
      setError('No se pudo actualizar el producto.')
    }
  }

  const handleRemoveLine = async (lineId: number) => {
    setError('')
    await window.api.supplies.removeLine(lineId)
    await load()
  }

  const handleCopyPrevious = async () => {
    setError('')
    setMessage('')
    const result = await window.api.supplies.copyPrevious(year, month)
    if (result.success) {
      setMessage(result.message)
      await load()
    } else {
      setError(result.message)
    }
  }

  const handleSaveNotes = async () => {
    if (!order) return
    if (notesDraft === order.notes) return
    await window.api.supplies.setNotes(year, month, notesDraft)
    await load()
  }

  const handleIssuedAtChange = async (value: string) => {
    setError('')
    try {
      await window.api.supplies.setIssuedAt(year, month, value || null)
      await load()
    } catch (err) {
      setError(ipcError(err, 'No se pudo guardar la fecha de emisión.'))
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setError('')
    setMessage('')
    try {
      const result = await window.api.supplies.exportPdf(year, month)
      if (result.success) {
        setMessage(result.message)
        if (result.filePath) setLastExportPath(result.filePath)
        await load()
      } else if (result.message !== 'Exportación cancelada.') {
        setError(result.message)
      }
    } catch {
      setError('Error al exportar.')
    } finally {
      setExporting(false)
    }
  }

  const handleOpenExportFolder = async () => {
    if (!lastExportPath) return
    const result = await window.api.app.showItemInFolder(lastExportPath)
    if (!result.success) setError(result.message)
  }

  const previousLabel = order?.previous
    ? `${MONTH_NAMES[order.previous.month - 1]} ${order.previous.year}`
    : null

  return (
    <div className="supplies-page">
      <header className="supplies-page-header">
        <div className="supplies-page-badge" aria-hidden="true">🛒</div>
        <div className="supplies-page-copy">
          <span className="supplies-page-kicker">Mercadería</span>
          <h2>Pedidos</h2>
          <p>Lista mensual para RR.HH.: lo que se pide queda guardado y se reutiliza el mes siguiente.</p>
        </div>
        <SettingsInfoButton title="Cómo funciona" ariaLabel="Ayuda de pedidos">
          <p>Cargá los productos una vez. Quedan en el catálogo para los meses siguientes.</p>
          <p>Si ya hay stock, marcá <strong>Hay stock</strong> para no pedirlo este mes.</p>
          <p><strong>Usar pedido anterior</strong> copia la lista del último mes. Después ajustás cantidades.</p>
          <p>La <strong>fecha de emisión</strong> se guarda al exportar el PDF, o la podés elegir con el calendario.</p>
          <p>Exportá el PDF para entregar el listado de mercadería mensual a Recursos Humanos.</p>
        </SettingsInfoButton>
      </header>

      <div className="schedule-toolbar meals-toolbar">
        <div className="schedule-toolbar-month">
          <button
            type="button"
            className="schedule-toolbar-nav-btn"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            title="Mes anterior"
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <h3>{capitalizeMonth(currentDate)}</h3>
          <button
            type="button"
            className="schedule-toolbar-nav-btn"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            title="Mes siguiente"
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>

        <div className="schedule-toolbar-actions">
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-secondary"
            onClick={handleCopyPrevious}
            disabled={!order?.previous}
            title={previousLabel ? `Copiar lista de ${previousLabel}` : 'Todavía no hay un pedido anterior'}
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">↩</span>
            Usar pedido anterior
          </button>
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-primary"
            onClick={() => void handleExport()}
            disabled={requestedCount === 0 || exporting}
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">↓</span>
            {exporting ? 'Exportando...' : 'Exportar PDF'}
          </button>
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-ghost"
            onClick={handleOpenExportFolder}
            disabled={!lastExportPath}
            title={lastExportPath ? 'Abrir carpeta con el último archivo exportado' : 'Exportá primero para abrir la carpeta'}
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">📁</span>
            Abrir carpeta
          </button>
        </div>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-warning">{error}</div>}

      <div className="supplies-summary">
        <div className="supplies-stat supplies-stat-list">
          <span className="supplies-stat-icon" aria-hidden="true">☰</span>
          <div>
            <span className="supplies-stat-value">{lines.length}</span>
            <span className="supplies-stat-label">En la lista</span>
          </div>
        </div>
        <div className="supplies-stat supplies-stat-ask">
          <span className="supplies-stat-icon" aria-hidden="true">✓</span>
          <div>
            <span className="supplies-stat-value">{requestedCount}</span>
            <span className="supplies-stat-label">A pedir</span>
          </div>
        </div>
        <div className="supplies-stat supplies-stat-skip">
          <span className="supplies-stat-icon" aria-hidden="true">○</span>
          <div>
            <span className="supplies-stat-value">{skippedCount}</span>
            <span className="supplies-stat-label">Hay stock</span>
          </div>
        </div>
        <div className={`supplies-stat supplies-stat-issued ${order?.issued_at ? 'supplies-stat-issued-set' : ''}`}>
          <button
            type="button"
            className="supplies-issued-picker"
            title="Elegir fecha de emisión"
            aria-label="Elegir fecha de emisión"
            onClick={() => {
              const input = issuedInputRef.current
              if (!input) return
              try {
                if (typeof input.showPicker === 'function') {
                  input.showPicker()
                  return
                }
              } catch {
                // Algunos navegadores bloquean showPicker fuera de gesto directo.
              }
              input.focus()
              input.click()
            }}
          >
            <span className="supplies-stat-icon" aria-hidden="true">📅</span>
          </button>
          <input
            ref={issuedInputRef}
            type="date"
            className="supplies-issued-input"
            value={order?.issued_at ?? ''}
            onChange={event => void handleIssuedAtChange(event.target.value)}
            tabIndex={-1}
            aria-hidden="true"
          />
          <div>
            <span className="supplies-stat-value">{formatIssuedDisplay(order?.issued_at)}</span>
            <span className="supplies-stat-label">Fecha de emisión</span>
          </div>
        </div>
      </div>

      <section className="supplies-card">
        <div className="supplies-card-header">
          <div>
            <span className="supplies-kicker">Nuevo ítem</span>
            <h3>Agregar al pedido</h3>
          </div>
        </div>
        <form
          className="supplies-add-form"
          onSubmit={event => {
            event.preventDefault()
            void handleAdd()
          }}
        >
          <input
            className="input employees-input"
            list="supplies-item-suggestions"
            placeholder="Producto (café, azúcar, jabón...)"
            value={newName}
            onChange={event => {
              const value = event.target.value
              setNewName(value)
              const match = items.find(item => item.name.toLowerCase() === value.trim().toLowerCase())
              if (match?.unit && !newUnit) setNewUnit(match.unit)
            }}
          />
          <datalist id="supplies-item-suggestions">
            {items.map(item => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
          <input
            className="input supplies-qty-input"
            type="number"
            min="0.01"
            step="any"
            placeholder="Cant."
            value={newQty}
            onChange={event => setNewQty(event.target.value)}
          />
          <input
            className="input supplies-unit-input"
            placeholder="Unidad (kg, un...)"
            value={newUnit}
            onChange={event => setNewUnit(event.target.value)}
          />
          <button type="submit" className="employees-add-btn" disabled={!newName.trim()}>
            Agregar
          </button>
        </form>
        {nameSuggestions.length > 0 && (
          <div className="supplies-suggestions">
            <span className="supplies-suggestions-label">Ya cargados, no están en este mes:</span>
            <div className="supplies-chips">
              {nameSuggestions.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="supplies-chip"
                  onClick={() => void handleAdd(item.name, item.unit)}
                >
                  {item.name}
                  {item.unit ? ` · ${item.unit}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {lines.length === 0 ? (
        <div className="meals-empty-card supplies-empty">
          <div className="meals-empty-icon-wrap" aria-hidden="true">🛒</div>
          <div className="meals-empty-copy">
            <h3>Todavía no hay pedido este mes</h3>
            <p>
              {previousLabel
                ? `Podés copiar el de ${previousLabel} o empezar a cargar productos.`
                : 'Agregá el primer producto. Queda guardado para los próximos meses.'}
            </p>
          </div>
          {previousLabel && (
            <button type="button" className="employees-add-btn meals-empty-btn" onClick={handleCopyPrevious}>
              Usar pedido de {previousLabel}
            </button>
          )}
        </div>
      ) : (
        <section className="supplies-card">
          <div className="supplies-card-header">
            <div>
              <span className="supplies-kicker">Pedido del mes</span>
              <h3>{capitalizeMonth(currentDate)}</h3>
            </div>
            <p className="supplies-card-hint">Lo marcado como “Hay stock” no sale en el PDF.</p>
          </div>
          <div className="supplies-table-wrap">
            <table className="supplies-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Unidad</th>
                  <th>Estado</th>
                  <th>Nota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={line.id} className={line.requested === 1 ? '' : 'supplies-row-skip'}>
                    <td>
                      <div className="supplies-item-name">{line.name}</div>
                      {lastLabel(line) && <div className="supplies-item-last">{lastLabel(line)}</div>}
                    </td>
                    <td>
                      <input
                        className="input supplies-qty-input"
                        type="number"
                        min="0.01"
                        step="any"
                        defaultValue={formatQty(line.quantity)}
                        key={`${line.id}-${line.quantity}`}
                        onBlur={event => {
                          const qty = Number(String(event.target.value).replace(',', '.'))
                          if (qty !== line.quantity) void handleUpdateLine(line.id, { quantity: qty })
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="input supplies-unit-input"
                        defaultValue={line.unit}
                        key={`${line.id}-${line.unit}`}
                        onBlur={event => {
                          if (event.target.value.trim() !== line.unit) {
                            void handleUpdateLine(line.id, { unit: event.target.value })
                          }
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`supplies-toggle ${line.requested === 1 ? 'supplies-toggle-on' : ''}`}
                        onClick={() => void handleUpdateLine(line.id, { requested: line.requested !== 1 })}
                      >
                        {line.requested === 1 ? 'Pedir' : 'Hay stock'}
                      </button>
                    </td>
                    <td>
                      <input
                        className="input"
                        placeholder="Opcional"
                        defaultValue={line.note}
                        key={`${line.id}-${line.note}`}
                        onBlur={event => {
                          if (event.target.value.trim() !== line.note) {
                            void handleUpdateLine(line.id, { note: event.target.value })
                          }
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => void handleRemoveLine(line.id)}
                        title="Sacar de este mes (el producto sigue guardado)"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="supplies-card">
        <div className="supplies-card-header">
          <div>
            <span className="supplies-kicker">Para RR.HH.</span>
            <h3>Nota del pedido</h3>
          </div>
        </div>
        <textarea
          className="input supplies-notes"
          rows={2}
          placeholder="Aclaración opcional para el PDF (urgencia, faltantes, etc.)"
          value={notesDraft}
          onChange={event => setNotesDraft(event.target.value)}
          onBlur={() => void handleSaveNotes()}
        />
      </section>

      {history.length > 0 && (
        <section className="supplies-card">
          <div className="supplies-card-header">
            <div>
              <span className="supplies-kicker">Historial</span>
              <h3>Pedidos anteriores</h3>
            </div>
          </div>
          <div className="supplies-history" ref={historyRef}>
            {history.map(entry => {
              const active = entry.year === year && entry.month === month
              return (
                <button
                  key={`${entry.year}-${entry.month}`}
                  type="button"
                  className={`supplies-history-chip ${active ? 'supplies-history-chip-active' : ''}`}
                  onClick={() => setCurrentDate(new Date(entry.year, entry.month - 1, 1))}
                >
                  <strong>{MONTH_NAMES[entry.month - 1]} {entry.year}</strong>
                  <span>
                    {entry.requested_count} a pedir
                    {entry.issued_at ? ` · emitido ${formatIssuedDisplay(entry.issued_at)}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
