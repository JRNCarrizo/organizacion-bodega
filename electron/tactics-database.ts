import { initDatabase } from './database'

export interface TacticsBoard {
  id: number
  name: string
  notes: string
  updated_at: string
}

export interface TacticsPlacement {
  id: number
  board_id: number
  employee_id: number
  employee_name: string
  x: number
  y: number
}

export interface TacticsArrow {
  id: number
  board_id: number
  x1: number
  y1: number
  x2: number
  y2: number
  curve: number
  style: 'move' | 'pass' | 'press'
  color: string
  from_employee_id: number | null
}

export interface TacticsBoardView {
  board: TacticsBoard
  placements: TacticsPlacement[]
  arrows: TacticsArrow[]
}

function clampCoord(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.min(98, Math.max(2, Math.round(value * 10) / 10))
}

function clampCurve(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(40, Math.max(-40, Math.round(value * 10) / 10))
}

export function initTacticsSchema(): void {
  const database = initDatabase()
  database.exec(`
    CREATE TABLE IF NOT EXISTS tactics_boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS tactics_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      FOREIGN KEY (board_id) REFERENCES tactics_boards(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(board_id, employee_id)
    );

    CREATE TABLE IF NOT EXISTS tactics_arrows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL,
      x1 REAL NOT NULL,
      y1 REAL NOT NULL,
      x2 REAL NOT NULL,
      y2 REAL NOT NULL,
      curve REAL NOT NULL DEFAULT 0,
      style TEXT NOT NULL DEFAULT 'move',
      color TEXT NOT NULL DEFAULT '#f8fafc',
      from_employee_id INTEGER,
      FOREIGN KEY (board_id) REFERENCES tactics_boards(id) ON DELETE CASCADE,
      FOREIGN KEY (from_employee_id) REFERENCES employees(id) ON DELETE SET NULL
    );
  `)

  const arrowColumns = database.prepare('PRAGMA table_info(tactics_arrows)').all() as Array<{ name: string }>
  if (!arrowColumns.some(column => column.name === 'from_employee_id')) {
    database.exec('ALTER TABLE tactics_arrows ADD COLUMN from_employee_id INTEGER REFERENCES employees(id)')
  }

  const count = database.prepare('SELECT COUNT(*) AS c FROM tactics_boards').get() as { c: number }
  if (count.c === 0) {
    database.prepare(`
      INSERT INTO tactics_boards (name, notes) VALUES (?, ?)
    `).run('Esquema principal', '')
  }
}

function touchBoard(boardId: number): void {
  const database = initDatabase()
  database.prepare(`
    UPDATE tactics_boards
    SET updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(boardId)
}

export function listTacticsBoards(): TacticsBoard[] {
  const database = initDatabase()
  return database.prepare(`
    SELECT id, name, notes, updated_at
    FROM tactics_boards
    ORDER BY updated_at DESC, id DESC
  `).all() as TacticsBoard[]
}

export function createTacticsBoard(name: string): TacticsBoard {
  const trimmed = name.trim() || 'Nuevo esquema'
  const database = initDatabase()
  const result = database.prepare(`
    INSERT INTO tactics_boards (name) VALUES (?)
  `).run(trimmed)
  return database.prepare(`
    SELECT id, name, notes, updated_at FROM tactics_boards WHERE id = ?
  `).get(result.lastInsertRowid) as TacticsBoard
}

export function renameTacticsBoard(boardId: number, name: string): TacticsBoard {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('El nombre no puede estar vacío.')
  const database = initDatabase()
  database.prepare(`
    UPDATE tactics_boards
    SET name = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(trimmed, boardId)
  return database.prepare(`
    SELECT id, name, notes, updated_at FROM tactics_boards WHERE id = ?
  `).get(boardId) as TacticsBoard
}

export function deleteTacticsBoard(boardId: number): void {
  const database = initDatabase()
  const count = database.prepare('SELECT COUNT(*) AS c FROM tactics_boards').get() as { c: number }
  if (count.c <= 1) {
    throw new Error('Debe quedar al menos un esquema.')
  }
  database.prepare('DELETE FROM tactics_boards WHERE id = ?').run(boardId)
}

export function getTacticsBoard(boardId: number): TacticsBoardView {
  const database = initDatabase()
  const board = database.prepare(`
    SELECT id, name, notes, updated_at FROM tactics_boards WHERE id = ?
  `).get(boardId) as TacticsBoard | undefined
  if (!board) throw new Error('No se encontró el esquema táctico.')

  const placements = database.prepare(`
    SELECT
      p.id, p.board_id, p.employee_id, e.name AS employee_name, p.x, p.y
    FROM tactics_placements p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.board_id = ?
    ORDER BY e.name COLLATE NOCASE
  `).all(boardId) as TacticsPlacement[]

  const arrows = database.prepare(`
    SELECT id, board_id, x1, y1, x2, y2, curve, style, color, from_employee_id
    FROM tactics_arrows
    WHERE board_id = ?
    ORDER BY id ASC
  `).all(boardId) as TacticsArrow[]

  return {
    board,
    placements,
    arrows: arrows.map(arrow => ({
      ...arrow,
      from_employee_id: arrow.from_employee_id ?? null
    }))
  }
}

export function upsertTacticsPlacement(
  boardId: number,
  employeeId: number,
  x: number,
  y: number
): TacticsPlacement {
  const database = initDatabase()
  const cx = clampCoord(x)
  const cy = clampCoord(y)

  database.prepare(`
    INSERT INTO tactics_placements (board_id, employee_id, x, y)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(board_id, employee_id) DO UPDATE SET
      x = excluded.x,
      y = excluded.y
  `).run(boardId, employeeId, cx, cy)
  touchBoard(boardId)

  return database.prepare(`
    SELECT
      p.id, p.board_id, p.employee_id, e.name AS employee_name, p.x, p.y
    FROM tactics_placements p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.board_id = ? AND p.employee_id = ?
  `).get(boardId, employeeId) as TacticsPlacement
}

/** Mueve un jugador y traslada con él todas las flechas ancladas. */
export function moveTacticsPlayer(
  boardId: number,
  employeeId: number,
  x: number,
  y: number
): TacticsBoardView {
  const database = initDatabase()
  const current = database.prepare(`
    SELECT x, y FROM tactics_placements WHERE board_id = ? AND employee_id = ?
  `).get(boardId, employeeId) as { x: number; y: number } | undefined

  const cx = clampCoord(x)
  const cy = clampCoord(y)

  const move = database.transaction(() => {
    if (!current) {
      database.prepare(`
        INSERT INTO tactics_placements (board_id, employee_id, x, y)
        VALUES (?, ?, ?, ?)
      `).run(boardId, employeeId, cx, cy)
      return
    }

    const dx = cx - current.x
    const dy = cy - current.y
    database.prepare(`
      UPDATE tactics_placements SET x = ?, y = ? WHERE board_id = ? AND employee_id = ?
    `).run(cx, cy, boardId, employeeId)

    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return

    const arrows = database.prepare(`
      SELECT id, x1, y1, x2, y2, from_employee_id
      FROM tactics_arrows
      WHERE board_id = ?
    `).all(boardId) as Array<{
      id: number
      x1: number
      y1: number
      x2: number
      y2: number
      from_employee_id: number | null
    }>

    const updateArrow = database.prepare(`
      UPDATE tactics_arrows
      SET x1 = ?, y1 = ?, x2 = ?, y2 = ?, from_employee_id = ?
      WHERE id = ?
    `)

    for (const arrow of arrows) {
      const anchored = arrow.from_employee_id === employeeId
      const nearStart = Math.hypot(arrow.x1 - current.x, arrow.y1 - current.y) <= 5.5
      if (!anchored && !nearStart) continue
      updateArrow.run(
        clampCoord(arrow.x1 + dx),
        clampCoord(arrow.y1 + dy),
        clampCoord(arrow.x2 + dx),
        clampCoord(arrow.y2 + dy),
        employeeId,
        arrow.id
      )
    }
  })

  move()
  touchBoard(boardId)
  return getTacticsBoard(boardId)
}

export function removeTacticsPlacement(boardId: number, employeeId: number): void {
  const database = initDatabase()
  const remove = database.transaction(() => {
    database.prepare(`
      DELETE FROM tactics_arrows WHERE board_id = ? AND from_employee_id = ?
    `).run(boardId, employeeId)
    database.prepare(`
      DELETE FROM tactics_placements WHERE board_id = ? AND employee_id = ?
    `).run(boardId, employeeId)
  })
  remove()
  touchBoard(boardId)
}

export function clearTacticsBoard(boardId: number): void {
  const database = initDatabase()
  const clear = database.transaction(() => {
    database.prepare('DELETE FROM tactics_placements WHERE board_id = ?').run(boardId)
    database.prepare('DELETE FROM tactics_arrows WHERE board_id = ?').run(boardId)
  })
  clear()
  touchBoard(boardId)
}

export function addTacticsArrow(
  boardId: number,
  payload: {
    x1: number
    y1: number
    x2: number
    y2: number
    curve?: number
    style?: 'move' | 'pass' | 'press'
    color?: string
    from_employee_id?: number | null
  }
): TacticsArrow {
  const database = initDatabase()
  const style = payload.style ?? 'move'
  const color = payload.color?.trim() || (style === 'pass' ? '#38bdf8' : style === 'press' ? '#f97316' : '#f8fafc')
  const fromEmployeeId = payload.from_employee_id ?? null
  const result = database.prepare(`
    INSERT INTO tactics_arrows (board_id, x1, y1, x2, y2, curve, style, color, from_employee_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    boardId,
    clampCoord(payload.x1),
    clampCoord(payload.y1),
    clampCoord(payload.x2),
    clampCoord(payload.y2),
    clampCurve(payload.curve ?? 0),
    style,
    color,
    fromEmployeeId
  )
  touchBoard(boardId)

  return database.prepare(`
    SELECT id, board_id, x1, y1, x2, y2, curve, style, color, from_employee_id
    FROM tactics_arrows WHERE id = ?
  `).get(result.lastInsertRowid) as TacticsArrow
}

export function updateTacticsArrow(
  arrowId: number,
  updates: Partial<{ x1: number; y1: number; x2: number; y2: number; curve: number; style: 'move' | 'pass' | 'press'; color: string }>
): TacticsArrow {
  const database = initDatabase()
  const current = database.prepare(`
    SELECT id, board_id, x1, y1, x2, y2, curve, style, color, from_employee_id
    FROM tactics_arrows WHERE id = ?
  `).get(arrowId) as TacticsArrow | undefined
  if (!current) throw new Error('No se encontró la flecha.')

  const nextStyle = (updates.style ?? current.style) as TacticsArrow['style']
  const next: TacticsArrow = {
    ...current,
    x1: updates.x1 !== undefined ? clampCoord(updates.x1) : current.x1,
    y1: updates.y1 !== undefined ? clampCoord(updates.y1) : current.y1,
    x2: updates.x2 !== undefined ? clampCoord(updates.x2) : current.x2,
    y2: updates.y2 !== undefined ? clampCoord(updates.y2) : current.y2,
    curve: updates.curve !== undefined ? clampCurve(updates.curve) : current.curve,
    style: nextStyle,
    color: updates.color?.trim() || current.color
  }

  database.prepare(`
    UPDATE tactics_arrows
    SET x1 = ?, y1 = ?, x2 = ?, y2 = ?, curve = ?, style = ?, color = ?
    WHERE id = ?
  `).run(next.x1, next.y1, next.x2, next.y2, next.curve, next.style, next.color, arrowId)
  touchBoard(current.board_id)

  return next
}

export function deleteTacticsArrow(arrowId: number): void {
  const database = initDatabase()
  const row = database.prepare('SELECT board_id FROM tactics_arrows WHERE id = ?').get(arrowId) as
    | { board_id: number }
    | undefined
  database.prepare('DELETE FROM tactics_arrows WHERE id = ?').run(arrowId)
  if (row) touchBoard(row.board_id)
}
