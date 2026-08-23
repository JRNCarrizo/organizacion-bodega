import { initDatabase } from './database'

export interface SupplyItem {
  id: number
  name: string
  unit: string
  active: number
  created_at: string
}

export interface SupplyOrderLineView {
  id: number
  item_id: number
  name: string
  quantity: number
  unit: string
  requested: number
  note: string
  sort_order: number
  last_quantity: number | null
  last_unit: string | null
  last_year: number | null
  last_month: number | null
}

export interface SupplyOrderView {
  id: number | null
  year: number
  month: number
  notes: string
  issued_at: string | null
  lines: SupplyOrderLineView[]
  previous: { year: number; month: number } | null
}

export interface SupplyHistoryMonth {
  year: number
  month: number
  line_count: number
  requested_count: number
  issued_at: string | null
}

function monthKey(year: number, month: number): number {
  return year * 12 + month
}

function todayLocalDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function normalizeIssuedAt(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const [year, month, day] = trimmed.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return trimmed
}

export function initSuppliesSchema(): void {
  const database = initDatabase()
  database.exec(`
    CREATE TABLE IF NOT EXISTS supply_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      unit TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS supply_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      issued_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(year, month)
    );

    CREATE TABLE IF NOT EXISTS supply_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT '',
      requested INTEGER NOT NULL DEFAULT 1,
      note TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES supply_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES supply_items(id) ON DELETE CASCADE,
      UNIQUE(order_id, item_id)
    );
  `)

  const columns = database.prepare('PRAGMA table_info(supply_orders)').all() as Array<{ name: string }>
  if (!columns.some(column => column.name === 'issued_at')) {
    database.exec('ALTER TABLE supply_orders ADD COLUMN issued_at TEXT')
  }
}

export function getSupplyItems(): SupplyItem[] {
  const database = initDatabase()
  return database.prepare(`
    SELECT id, name, unit, active, created_at
    FROM supply_items
    WHERE active = 1
    ORDER BY name COLLATE NOCASE
  `).all() as SupplyItem[]
}

function findItemByName(name: string): SupplyItem | undefined {
  const database = initDatabase()
  return database.prepare(`
    SELECT id, name, unit, active, created_at
    FROM supply_items
    WHERE name = ? COLLATE NOCASE
  `).get(name.trim()) as SupplyItem | undefined
}

export function getOrCreateSupplyItem(name: string, unit = ''): SupplyItem {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('El nombre no puede estar vacío.')

  const existing = findItemByName(trimmed)
  if (existing) {
    const database = initDatabase()
    if (existing.active !== 1) {
      database.prepare('UPDATE supply_items SET active = 1 WHERE id = ?').run(existing.id)
      existing.active = 1
    }
    if (unit.trim() && !existing.unit) {
      database.prepare('UPDATE supply_items SET unit = ? WHERE id = ?').run(unit.trim(), existing.id)
      existing.unit = unit.trim()
    }
    return existing
  }

  const database = initDatabase()
  const result = database.prepare(`
    INSERT INTO supply_items (name, unit) VALUES (?, ?)
  `).run(trimmed, unit.trim())

  return {
    id: Number(result.lastInsertRowid),
    name: trimmed,
    unit: unit.trim(),
    active: 1,
    created_at: new Date().toISOString()
  }
}

export function updateSupplyItem(id: number, name: string, unit: string): SupplyItem {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('El nombre no puede estar vacío.')

  const database = initDatabase()
  const clash = findItemByName(trimmed)
  if (clash && clash.id !== id) {
    throw new Error('Ya existe un producto con ese nombre.')
  }

  database.prepare(`
    UPDATE supply_items SET name = ?, unit = ? WHERE id = ?
  `).run(trimmed, unit.trim(), id)

  return database.prepare(`
    SELECT id, name, unit, active, created_at FROM supply_items WHERE id = ?
  `).get(id) as SupplyItem
}

export function deactivateSupplyItem(id: number): void {
  const database = initDatabase()
  database.prepare('UPDATE supply_items SET active = 0 WHERE id = ?').run(id)
}

function getOrderRow(year: number, month: number): { id: number; notes: string; issued_at: string | null } | undefined {
  const database = initDatabase()
  const row = database.prepare(`
    SELECT id, notes, issued_at FROM supply_orders WHERE year = ? AND month = ?
  `).get(year, month) as { id: number; notes: string; issued_at: string | null } | undefined
  if (!row) return undefined
  return { ...row, issued_at: normalizeIssuedAt(row.issued_at) }
}

function ensureOrder(year: number, month: number): { id: number; notes: string; issued_at: string | null } {
  const existing = getOrderRow(year, month)
  if (existing) return existing

  const database = initDatabase()
  const result = database.prepare(`
    INSERT INTO supply_orders (year, month) VALUES (?, ?)
  `).run(year, month)

  return { id: Number(result.lastInsertRowid), notes: '', issued_at: null }
}

function getPreviousOrderRef(year: number, month: number): { year: number; month: number } | null {
  const database = initDatabase()
  const key = monthKey(year, month)
  const row = database.prepare(`
    SELECT year, month
    FROM supply_orders
    WHERE (year * 12 + month) < ?
      AND EXISTS (
        SELECT 1 FROM supply_order_lines WHERE order_id = supply_orders.id
      )
    ORDER BY year DESC, month DESC
    LIMIT 1
  `).get(key) as { year: number; month: number } | undefined
  return row ?? null
}

function lastRequestedForItem(
  itemId: number,
  year: number,
  month: number
): { quantity: number; unit: string; year: number; month: number } | null {
  const database = initDatabase()
  const key = monthKey(year, month)
  const row = database.prepare(`
    SELECT l.quantity, l.unit, o.year, o.month
    FROM supply_order_lines l
    JOIN supply_orders o ON o.id = l.order_id
    WHERE l.item_id = ?
      AND l.requested = 1
      AND (o.year * 12 + o.month) < ?
    ORDER BY o.year DESC, o.month DESC
    LIMIT 1
  `).get(itemId, key) as { quantity: number; unit: string; year: number; month: number } | undefined
  return row ?? null
}

export function getSupplyOrder(year: number, month: number): SupplyOrderView {
  const database = initDatabase()
  const order = getOrderRow(year, month)
  const previous = getPreviousOrderRef(year, month)

  if (!order) {
    return { id: null, year, month, notes: '', issued_at: null, lines: [], previous }
  }

  const rows = database.prepare(`
    SELECT
      l.id, l.item_id, i.name, l.quantity, l.unit, l.requested, l.note, l.sort_order
    FROM supply_order_lines l
    JOIN supply_items i ON i.id = l.item_id
    WHERE l.order_id = ?
    ORDER BY l.sort_order ASC, i.name COLLATE NOCASE
  `).all(order.id) as Array<{
    id: number
    item_id: number
    name: string
    quantity: number
    unit: string
    requested: number
    note: string
    sort_order: number
  }>

  const lines: SupplyOrderLineView[] = rows.map(row => {
    const last = lastRequestedForItem(row.item_id, year, month)
    return {
      ...row,
      last_quantity: last?.quantity ?? null,
      last_unit: last?.unit ?? null,
      last_year: last?.year ?? null,
      last_month: last?.month ?? null
    }
  })

  return {
    id: order.id,
    year,
    month,
    notes: order.notes,
    issued_at: order.issued_at,
    lines,
    previous
  }
}

export function getSupplyHistory(): SupplyHistoryMonth[] {
  const database = initDatabase()
  const rows = database.prepare(`
    SELECT
      o.year,
      o.month,
      o.issued_at,
      COUNT(l.id) AS line_count,
      SUM(CASE WHEN l.requested = 1 THEN 1 ELSE 0 END) AS requested_count
    FROM supply_orders o
    JOIN supply_order_lines l ON l.order_id = o.id
    GROUP BY o.id
    ORDER BY o.year DESC, o.month DESC
  `).all() as Array<{
    year: number
    month: number
    issued_at: string | null
    line_count: number
    requested_count: number
  }>

  return rows.map(row => ({
    ...row,
    issued_at: normalizeIssuedAt(row.issued_at)
  }))
}

export function setSupplyOrderNotes(year: number, month: number, notes: string): void {
  const order = ensureOrder(year, month)
  const database = initDatabase()
  database.prepare('UPDATE supply_orders SET notes = ? WHERE id = ?').run(notes, order.id)
}

export function setSupplyOrderIssuedAt(year: number, month: number, issuedAt: string | null): string | null {
  const order = ensureOrder(year, month)
  const normalized = issuedAt === null || issuedAt === '' ? null : normalizeIssuedAt(issuedAt)
  if (issuedAt && !normalized) {
    throw new Error('La fecha de emisión no es válida.')
  }
  const database = initDatabase()
  database.prepare('UPDATE supply_orders SET issued_at = ? WHERE id = ?').run(normalized, order.id)
  return normalized
}

/** Guarda la fecha de emisión si el pedido todavía no la tiene (primera exportación). */
export function ensureSupplyOrderIssuedAt(year: number, month: number): string {
  const order = ensureOrder(year, month)
  if (order.issued_at) return order.issued_at
  const issuedAt = todayLocalDate()
  const database = initDatabase()
  database.prepare('UPDATE supply_orders SET issued_at = ? WHERE id = ?').run(issuedAt, order.id)
  return issuedAt
}

export function addSupplyLine(
  year: number,
  month: number,
  name: string,
  quantity: number,
  unit: string,
  note = ''
): SupplyOrderLineView {
  const item = getOrCreateSupplyItem(name, unit)
  const order = ensureOrder(year, month)
  const database = initDatabase()

  const existing = database.prepare(`
    SELECT id FROM supply_order_lines WHERE order_id = ? AND item_id = ?
  `).get(order.id, item.id) as { id: number } | undefined

  if (existing) {
    throw new Error('Ese producto ya está en el pedido de este mes.')
  }

  const maxSort = database.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) AS max_sort
    FROM supply_order_lines WHERE order_id = ?
  `).get(order.id) as { max_sort: number }

  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1
  const lineUnit = unit.trim() || item.unit

  const result = database.prepare(`
    INSERT INTO supply_order_lines (order_id, item_id, quantity, unit, requested, note, sort_order)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(order.id, item.id, qty, lineUnit, note.trim(), maxSort.max_sort + 1)

  if (lineUnit && item.unit !== lineUnit) {
    database.prepare('UPDATE supply_items SET unit = ? WHERE id = ? AND unit = ?').run(lineUnit, item.id, '')
  }

  const last = lastRequestedForItem(item.id, year, month)
  return {
    id: Number(result.lastInsertRowid),
    item_id: item.id,
    name: item.name,
    quantity: qty,
    unit: lineUnit,
    requested: 1,
    note: note.trim(),
    sort_order: maxSort.max_sort + 1,
    last_quantity: last?.quantity ?? null,
    last_unit: last?.unit ?? null,
    last_year: last?.year ?? null,
    last_month: last?.month ?? null
  }
}

export function updateSupplyLine(
  lineId: number,
  updates: { quantity?: number; unit?: string; requested?: boolean; note?: string }
): void {
  const database = initDatabase()
  const current = database.prepare(`
    SELECT id, quantity, unit, requested, note, item_id FROM supply_order_lines WHERE id = ?
  `).get(lineId) as {
    id: number
    quantity: number
    unit: string
    requested: number
    note: string
    item_id: number
  } | undefined

  if (!current) throw new Error('No se encontró el ítem del pedido.')

  const quantity = updates.quantity !== undefined
    ? (Number.isFinite(updates.quantity) && updates.quantity > 0 ? updates.quantity : current.quantity)
    : current.quantity
  const unit = updates.unit !== undefined ? updates.unit.trim() : current.unit
  const requested = updates.requested !== undefined ? (updates.requested ? 1 : 0) : current.requested
  const note = updates.note !== undefined ? updates.note.trim() : current.note

  database.prepare(`
    UPDATE supply_order_lines
    SET quantity = ?, unit = ?, requested = ?, note = ?
    WHERE id = ?
  `).run(quantity, unit, requested, note, lineId)

  if (unit) {
    database.prepare('UPDATE supply_items SET unit = ? WHERE id = ?').run(unit, current.item_id)
  }
}

export function removeSupplyLine(lineId: number): void {
  const database = initDatabase()
  database.prepare('DELETE FROM supply_order_lines WHERE id = ?').run(lineId)
}

export function copyPreviousSupplyOrder(year: number, month: number): {
  success: boolean
  message: string
  copied: number
} {
  const previous = getPreviousOrderRef(year, month)
  if (!previous) {
    return { success: false, message: 'No hay un pedido anterior para copiar.', copied: 0 }
  }

  const database = initDatabase()
  const prevOrder = getOrderRow(previous.year, previous.month)
  if (!prevOrder) {
    return { success: false, message: 'No hay un pedido anterior para copiar.', copied: 0 }
  }

  const prevLines = database.prepare(`
    SELECT item_id, quantity, unit, requested, note, sort_order
    FROM supply_order_lines
    WHERE order_id = ?
    ORDER BY sort_order ASC
  `).all(prevOrder.id) as Array<{
    item_id: number
    quantity: number
    unit: string
    requested: number
    note: string
    sort_order: number
  }>

  if (prevLines.length === 0) {
    return { success: false, message: 'El pedido anterior no tiene productos.', copied: 0 }
  }

  const order = ensureOrder(year, month)
  const insert = database.prepare(`
    INSERT OR IGNORE INTO supply_order_lines
      (order_id, item_id, quantity, unit, requested, note, sort_order)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `)

  const copy = database.transaction(() => {
    let copied = 0
    for (const line of prevLines) {
      const result = insert.run(order.id, line.item_id, line.quantity, line.unit, '', line.sort_order)
      if (result.changes > 0) copied += 1
    }
    return copied
  })

  const copied = copy()
  if (copied === 0) {
    return {
      success: true,
      message: 'El pedido de este mes ya tenía todos los productos del anterior.',
      copied: 0
    }
  }

  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ]
  return {
    success: true,
    message: `Se copiaron ${copied} productos de ${monthNames[previous.month - 1]} ${previous.year}. Revisá lo que ya hay en stock.`,
    copied
  }
}
