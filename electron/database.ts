import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

export interface Employee {
  id: number
  name: string
  active: number
  in_stretch: number
  in_meals: number
  created_at: string
}

export interface StretchAssignment {
  id: number
  date: string
  employee_id: number
  depot: number
  balls_count: number
  employee_name?: string
  original_employee_id?: number | null
  original_employee_name?: string | null
  is_replacement?: number
}

export interface StretchScheduleDay {
  date: string
  employee1_id: number
  employee1_name: string
  employee2_id: number
  employee2_name: string
  depot1_employee_id: number
}

export interface EmployeeStats {
  employee_id: number
  employee_name: string
  stretch_balls: number
  confirmed_shifts: number
  depot1_days: number
  depot2_days: number
}

let db: Database.Database | null = null

function getDbPath(): string {
  const userData = app.getPath('userData')
  if (!fs.existsSync(userData)) {
    fs.mkdirSync(userData, { recursive: true })
  }
  return path.join(userData, 'organizacion-bodega.db')
}

export function resetAllSchedule(): void {
  const database = initDatabase()
  database.prepare('DELETE FROM stretch_assignments').run()
}

export function initDatabase(): Database.Database {
  if (db) return db

  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS stretch_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      employee_id INTEGER NOT NULL,
      depot INTEGER NOT NULL CHECK(depot IN (1, 2)),
      balls_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(date, employee_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('heavy_depot', '1');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('depot1_name', 'Depósito 1');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('depot2_name', 'Depósito 2');
  `)

  migrateDatabase(db)

  return db
}

function migrateDatabase(database: Database.Database): void {
  const columns = database.prepare('PRAGMA table_info(stretch_assignments)').all() as Array<{ name: string }>
  const columnNames = new Set(columns.map(c => c.name))

  if (!columnNames.has('original_employee_id')) {
    database.exec('ALTER TABLE stretch_assignments ADD COLUMN original_employee_id INTEGER REFERENCES employees(id)')
  }
  if (!columnNames.has('is_replacement')) {
    database.exec('ALTER TABLE stretch_assignments ADD COLUMN is_replacement INTEGER NOT NULL DEFAULT 0')
  }

  database.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('depot1_name', 'Depósito 1')").run()
  database.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('depot2_name', 'Depósito 2')").run()
  database.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark')").run()

  const employeeColumns = database.prepare('PRAGMA table_info(employees)').all() as Array<{ name: string }>
  const employeeColumnNames = new Set(employeeColumns.map(c => c.name))
  if (!employeeColumnNames.has('in_stretch')) {
    database.exec('ALTER TABLE employees ADD COLUMN in_stretch INTEGER NOT NULL DEFAULT 1')
  }
  if (!employeeColumnNames.has('in_meals')) {
    database.exec('ALTER TABLE employees ADD COLUMN in_meals INTEGER NOT NULL DEFAULT 1')
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS stretch_holidays (
      date TEXT PRIMARY KEY
    )
  `)
}

export interface DepotSettings {
  heavyDepot: number
  depot1Name: string
  depot2Name: string
}

export type AppTheme = 'dark' | 'light'

export function getTheme(): AppTheme {
  const value = getSettingValue('theme', 'dark')
  return value === 'light' ? 'light' : 'dark'
}

export function setTheme(theme: AppTheme): AppTheme {
  setSettingValue('theme', theme)
  return theme
}

function getSettingValue(key: string, defaultValue: string): string {
  const database = initDatabase()
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value?.trim() || defaultValue
}

function setSettingValue(key: string, value: string): void {
  const database = initDatabase()
  database.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function getDepotSettings(): DepotSettings {
  return {
    heavyDepot: getHeavyDepot(),
    depot1Name: getSettingValue('depot1_name', 'Depósito 1'),
    depot2Name: getSettingValue('depot2_name', 'Depósito 2')
  }
}

export function setDepotSettings(settings: Partial<DepotSettings>): DepotSettings {
  if (settings.heavyDepot !== undefined) {
    setHeavyDepot(settings.heavyDepot)
  }
  if (settings.depot1Name !== undefined) {
    setSettingValue('depot1_name', settings.depot1Name.trim() || 'Depósito 1')
  }
  if (settings.depot2Name !== undefined) {
    setSettingValue('depot2_name', settings.depot2Name.trim() || 'Depósito 2')
  }
  return getDepotSettings()
}

export function getEmployees(): Employee[] {
  const database = initDatabase()
  return database.prepare('SELECT * FROM employees ORDER BY name').all() as Employee[]
}

export function getStretchEmployees(): Employee[] {
  return getEmployees().filter(e => e.active === 1 && e.in_stretch === 1)
}

export function getMealsEmployees(): Employee[] {
  return getEmployees().filter(e => e.active === 1 && e.in_meals === 1)
}

export function addEmployee(name: string): Employee {
  const database = initDatabase()
  const result = database.prepare('INSERT INTO employees (name) VALUES (?)').run(name.trim())
  return database.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid) as Employee
}

export function updateEmployee(
  id: number,
  name: string,
  active: boolean,
  inStretch: boolean,
  inMeals: boolean
): void {
  const database = initDatabase()
  database.prepare(`
    UPDATE employees
    SET name = ?, active = ?, in_stretch = ?, in_meals = ?
    WHERE id = ?
  `).run(name.trim(), active ? 1 : 0, inStretch ? 1 : 0, inMeals ? 1 : 0, id)
}

export function deleteEmployee(id: number): void {
  const database = initDatabase()
  database.prepare('DELETE FROM employees WHERE id = ?').run(id)
}

export function getHeavyDepot(): number {
  const database = initDatabase()
  const row = database.prepare("SELECT value FROM settings WHERE key = 'heavy_depot'").get() as { value: string }
  return parseInt(row?.value ?? '1', 10)
}

export function setHeavyDepot(depot: number): void {
  const database = initDatabase()
  database.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('heavy_depot', ?)").run(String(depot))
}

export function getAssignmentsForDate(date: string): StretchAssignment[] {
  const database = initDatabase()
  return database.prepare(`
    SELECT sa.*, e.name as employee_name, orig.name as original_employee_name
    FROM stretch_assignments sa
    JOIN employees e ON e.id = sa.employee_id
    LEFT JOIN employees orig ON orig.id = sa.original_employee_id
    WHERE sa.date = ?
    ORDER BY sa.depot
  `).all(date) as StretchAssignment[]
}

export function getAssignmentsForMonth(year: number, month: number): StretchAssignment[] {
  const database = initDatabase()
  const monthStr = String(month).padStart(2, '0')
  return database.prepare(`
    SELECT sa.*, e.name as employee_name, orig.name as original_employee_name
    FROM stretch_assignments sa
    JOIN employees e ON e.id = sa.employee_id
    LEFT JOIN employees orig ON orig.id = sa.original_employee_id
    WHERE sa.date LIKE ?
    ORDER BY sa.date, sa.depot
  `).all(`${year}-${monthStr}-%`) as StretchAssignment[]
}

export function getEmployeeName(id: number): string {
  const database = initDatabase()
  const row = database.prepare('SELECT name FROM employees WHERE id = ?').get(id) as { name: string } | undefined
  return row?.name ?? ''
}

function getTodayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function recordBalls(date: string, employeeId: number, depot: number, ballsCount: number): boolean {
  if (ballsCount > 0 && date > getTodayString()) return false

  const database = initDatabase()
  const existing = database.prepare(`
    SELECT balls_count FROM stretch_assignments WHERE date = ? AND employee_id = ?
  `).get(date, employeeId) as { balls_count: number } | undefined

  if (existing && existing.balls_count > 0 && ballsCount === 0) {
    return false
  }

  database.prepare(`
    INSERT INTO stretch_assignments (date, employee_id, depot, balls_count)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date, employee_id) DO UPDATE SET
      depot = excluded.depot,
      balls_count = excluded.balls_count
  `).run(date, employeeId, depot, ballsCount)

  return true
}

export function getLastDepotForEmployee(employeeId: number, beforeDate?: string): number | null {
  const database = initDatabase()
  if (beforeDate) {
    const row = database.prepare(`
      SELECT depot FROM stretch_assignments
      WHERE employee_id = ? AND date < ?
      ORDER BY date DESC LIMIT 1
    `).get(employeeId, beforeDate) as { depot: number } | undefined
    return row?.depot ?? null
  }
  const row = database.prepare(`
    SELECT depot FROM stretch_assignments
    WHERE employee_id = ?
    ORDER BY date DESC LIMIT 1
  `).get(employeeId) as { depot: number } | undefined
  return row?.depot ?? null
}

export function getAssignmentCountInMonth(employeeId: number, year: number, month: number): number {
  const database = initDatabase()
  const monthStr = String(month).padStart(2, '0')
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM stretch_assignments
    WHERE employee_id = ? AND date LIKE ?
  `).get(employeeId, `${year}-${monthStr}-%`) as { count: number }
  return row.count
}

export function getTotalAssignmentsBefore(date: string): number {
  const database = initDatabase()
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM stretch_assignments WHERE date < ?
  `).get(date) as { count: number }
  return row.count
}

export function getDaysSinceLastAssignment(employeeId: number, beforeDate: string): number {
  const database = initDatabase()
  const row = database.prepare(`
    SELECT date FROM stretch_assignments
    WHERE employee_id = ? AND date < ?
    ORDER BY date DESC LIMIT 1
  `).get(employeeId, beforeDate) as { date: string } | undefined

  if (!row) return 999

  const [y1, m1, d1] = beforeDate.split('-').map(Number)
  const [y2, m2, d2] = row.date.split('-').map(Number)
  const current = new Date(y1, m1 - 1, d1).getTime()
  const last = new Date(y2, m2 - 1, d2).getTime()
  return Math.floor((current - last) / (1000 * 60 * 60 * 24))
}

export interface MonthlyStatsResult {
  employees: EmployeeStats[]
  unique_days_worked: number
  total_stretch_balls: number
}

function queryStats(monthPattern: string | null): MonthlyStatsResult {
  const database = initDatabase()
  const joinClause = monthPattern
    ? 'sa.employee_id = e.id AND sa.date LIKE ?'
    : 'sa.employee_id = e.id'
  const joinParam = monthPattern ? [monthPattern] : []

  const employees = database.prepare(`
    SELECT
      e.id as employee_id,
      e.name as employee_name,
      COALESCE(SUM(CASE WHEN sa.balls_count > 0 THEN sa.balls_count ELSE 0 END), 0) as stretch_balls,
      COALESCE(SUM(CASE WHEN sa.balls_count > 0 THEN 1 ELSE 0 END), 0) as confirmed_shifts,
      COALESCE(SUM(CASE WHEN sa.balls_count > 0 AND sa.depot = 1 THEN 1 ELSE 0 END), 0) as depot1_days,
      COALESCE(SUM(CASE WHEN sa.balls_count > 0 AND sa.depot = 2 THEN 1 ELSE 0 END), 0) as depot2_days
    FROM employees e
    LEFT JOIN stretch_assignments sa ON ${joinClause}
    WHERE e.active = 1 AND e.in_stretch = 1
    GROUP BY e.id, e.name
    ORDER BY stretch_balls DESC, confirmed_shifts DESC, e.name
  `).all(...joinParam) as EmployeeStats[]

  const dateFilter = monthPattern ? 'date LIKE ? AND balls_count > 0' : 'balls_count > 0'
  const dateParams = monthPattern ? [monthPattern] : []

  const uniqueDays = database.prepare(`
    SELECT COUNT(DISTINCT date) as count
    FROM stretch_assignments
    WHERE ${dateFilter}
  `).get(...dateParams) as { count: number }

  const totalBalls = database.prepare(`
    SELECT COALESCE(SUM(balls_count), 0) as total
    FROM stretch_assignments
    WHERE ${dateFilter}
  `).get(...dateParams) as { total: number }

  return {
    employees,
    unique_days_worked: uniqueDays?.count ?? 0,
    total_stretch_balls: totalBalls?.total ?? 0
  }
}

export function getMonthlyStats(year: number, month: number): MonthlyStatsResult {
  const monthStr = String(month).padStart(2, '0')
  return queryStats(`${year}-${monthStr}-%`)
}

export function getAllTimeStats(): MonthlyStatsResult {
  return queryStats(null)
}

export function saveScheduleDay(
  date: string,
  employee1Id: number,
  employee2Id: number,
  depot1EmployeeId: number
): boolean {
  if (hasConfirmedAssignments(date)) return false
  if (employee1Id === employee2Id) return false

  const database = initDatabase()

  const insert = database.prepare(`
    INSERT INTO stretch_assignments (date, employee_id, depot, balls_count, is_replacement, original_employee_id)
    VALUES (?, ?, ?, 0, 0, NULL)
    ON CONFLICT(date, employee_id) DO UPDATE SET
      depot = excluded.depot,
      balls_count = 0,
      is_replacement = 0,
      original_employee_id = NULL
  `)

  const transaction = database.transaction(() => {
    database.prepare(`
      DELETE FROM stretch_assignments
      WHERE date = ? AND employee_id NOT IN (?, ?)
    `).run(date, employee1Id, employee2Id)

    insert.run(date, employee1Id, depot1EmployeeId === employee1Id ? 1 : 2)
    insert.run(date, employee2Id, depot1EmployeeId === employee1Id ? 2 : 1)
  })
  transaction()
  return true
}

export function hasConfirmedAssignments(date: string): boolean {
  const database = initDatabase()
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM stretch_assignments
    WHERE date = ? AND balls_count > 0
  `).get(date) as { count: number }
  return row.count > 0
}

export function deleteAssignmentForDate(date: string): boolean {
  if (hasConfirmedAssignments(date)) return false

  const database = initDatabase()
  database.prepare('DELETE FROM stretch_assignments WHERE date = ?').run(date)
  return true
}

export function getStretchHolidaysForMonth(year: number, month: number): string[] {
  const database = initDatabase()
  const monthStr = String(month).padStart(2, '0')
  const rows = database.prepare(`
    SELECT date FROM stretch_holidays
    WHERE date LIKE ?
    ORDER BY date
  `).all(`${year}-${monthStr}-%`) as Array<{ date: string }>
  return rows.map(row => row.date)
}

export function isStretchHoliday(date: string): boolean {
  const database = initDatabase()
  const row = database.prepare('SELECT 1 as ok FROM stretch_holidays WHERE date = ?').get(date) as { ok: number } | undefined
  return row?.ok === 1
}

export function markStretchHoliday(date: string): void {
  const database = initDatabase()
  database.prepare('INSERT OR IGNORE INTO stretch_holidays (date) VALUES (?)').run(date)
}

export function unmarkStretchHoliday(date: string): boolean {
  const database = initDatabase()
  const result = database.prepare('DELETE FROM stretch_holidays WHERE date = ?').run(date)
  return result.changes > 0
}

export function getScheduleForMonth(year: number, month: number): StretchScheduleDay[] {
  const database = initDatabase()
  const monthStr = String(month).padStart(2, '0')
  const assignments = database.prepare(`
    SELECT sa.date, sa.employee_id, sa.depot, e.name as employee_name
    FROM stretch_assignments sa
    JOIN employees e ON e.id = sa.employee_id
    WHERE sa.date LIKE ?
    ORDER BY sa.date, sa.depot
  `).all(`${year}-${monthStr}-%`) as Array<{
    date: string
    employee_id: number
    depot: number
    employee_name: string
  }>

  const byDate = new Map<string, StretchScheduleDay>()
  for (const a of assignments) {
    if (!byDate.has(a.date)) {
      byDate.set(a.date, {
        date: a.date,
        employee1_id: 0,
        employee1_name: '',
        employee2_id: 0,
        employee2_name: '',
        depot1_employee_id: 0
      })
    }
    const day = byDate.get(a.date)!
    if (a.depot === 1) {
      day.depot1_employee_id = a.employee_id
      day.employee1_id = a.employee_id
      day.employee1_name = a.employee_name
    } else if (a.depot === 2) {
      day.employee2_id = a.employee_id
      day.employee2_name = a.employee_name
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}
