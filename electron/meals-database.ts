import { initDatabase } from './database'
import type { ParsedMealDay } from './meals-parser'

export interface MealMenuSummary {
  id: number
  year: number
  month: number
  source_filename: string | null
  imported_at: string
  day_count: number
}

export interface MealDayView {
  id: number
  date: string
  weekday: string
  options: Array<{ id: number; category: string; description: string; option_index: number }>
}

export interface MealSelectionView {
  employee_id: number
  employee_name: string
  date: string
  category: string
  meal_option_id: number
  description: string
}

export function initMealsSchema(): void {
  const database = initDatabase()
  database.exec(`
    CREATE TABLE IF NOT EXISTS meal_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      source_filename TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(year, month)
    );

    CREATE TABLE IF NOT EXISTS meal_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      weekday TEXT NOT NULL,
      FOREIGN KEY (menu_id) REFERENCES meal_menus(id) ON DELETE CASCADE,
      UNIQUE(menu_id, date)
    );

    CREATE TABLE IF NOT EXISTS meal_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      option_index INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (day_id) REFERENCES meal_days(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meal_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      meal_option_id INTEGER,
      FOREIGN KEY (menu_id) REFERENCES meal_menus(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (meal_option_id) REFERENCES meal_options(id) ON DELETE SET NULL,
      UNIQUE(menu_id, employee_id, date)
    );
  `)

  const columns = database.prepare('PRAGMA table_info(meal_options)').all() as Array<{ name: string }>
  if (!columns.some(c => c.name === 'option_index')) {
    database.exec('ALTER TABLE meal_options ADD COLUMN option_index INTEGER NOT NULL DEFAULT 1')
  }

  const selectionColumns = database.prepare('PRAGMA table_info(meal_selections)').all() as Array<{ name: string }>
  if (!selectionColumns.some(c => c.name === 'meal_option_id')) {
    database.exec('ALTER TABLE meal_selections ADD COLUMN meal_option_id INTEGER')
  }
}

export function getMealMenu(year: number, month: number): MealMenuSummary | null {
  const database = initDatabase()
  const row = database.prepare(`
    SELECT
      m.id, m.year, m.month, m.source_filename, m.imported_at,
      (SELECT COUNT(*) FROM meal_days d WHERE d.menu_id = m.id) as day_count
    FROM meal_menus m
    WHERE m.year = ? AND m.month = ?
  `).get(year, month) as MealMenuSummary | undefined
  return row ?? null
}

export function getMealDays(year: number, month: number): MealDayView[] {
  const database = initDatabase()
  const menu = getMealMenu(year, month)
  if (!menu) return []

  const days = database.prepare(`
    SELECT id, date, weekday FROM meal_days WHERE menu_id = ? ORDER BY date
  `).all(menu.id) as Array<{ id: number; date: string; weekday: string }>

  const optionsStmt = database.prepare(`
    SELECT id, category, description, option_index FROM meal_options
    WHERE day_id = ? ORDER BY category, option_index, sort_order, id
  `)

  return days.map(day => ({
    ...day,
    options: optionsStmt.all(day.id) as MealDayView['options']
  }))
}

export function getMealSelections(year: number, month: number): MealSelectionView[] {
  const database = initDatabase()
  const menu = getMealMenu(year, month)
  if (!menu) return []

  return database.prepare(`
    SELECT
      s.employee_id,
      e.name as employee_name,
      s.date,
      s.category,
      s.meal_option_id,
      COALESCE(mo.description, '') as description
    FROM meal_selections s
    JOIN employees e ON e.id = s.employee_id
    LEFT JOIN meal_options mo ON mo.id = s.meal_option_id
    WHERE s.menu_id = ?
    ORDER BY e.name, s.date
  `).all(menu.id) as MealSelectionView[]
}

export function saveMealMenu(
  year: number,
  month: number,
  sourceFilename: string | null,
  days: ParsedMealDay[]
): MealMenuSummary {
  const database = initDatabase()

  const transaction = database.transaction(() => {
    database.prepare('DELETE FROM meal_menus WHERE year = ? AND month = ?').run(year, month)

    const menuResult = database.prepare(`
      INSERT INTO meal_menus (year, month, source_filename) VALUES (?, ?, ?)
    `).run(year, month, sourceFilename)

    const menuId = Number(menuResult.lastInsertRowid)
    const insertDay = database.prepare(`
      INSERT INTO meal_days (menu_id, date, weekday) VALUES (?, ?, ?)
    `)
    const insertOption = database.prepare(`
      INSERT INTO meal_options (day_id, category, description, option_index, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `)

    for (const day of days) {
      const dayResult = insertDay.run(menuId, day.date, day.weekday)
      const dayId = Number(dayResult.lastInsertRowid)
      day.options.forEach((option, index) => {
        insertOption.run(dayId, option.category, option.description, option.optionIndex, index)
      })
    }
  })

  transaction()
  return getMealMenu(year, month)!
}

export function setMealSelection(
  year: number,
  month: number,
  employeeId: number,
  date: string,
  mealOptionId: number | null
): void {
  const database = initDatabase()
  const menu = getMealMenu(year, month)
  if (!menu) return

  if (!mealOptionId) {
    database.prepare(`
      DELETE FROM meal_selections WHERE menu_id = ? AND employee_id = ? AND date = ?
    `).run(menu.id, employeeId, date)
    return
  }

  const option = database.prepare(`
    SELECT category FROM meal_options mo
    JOIN meal_days md ON md.id = mo.day_id
    WHERE mo.id = ? AND md.menu_id = ? AND md.date = ?
  `).get(mealOptionId, menu.id, date) as { category: string } | undefined

  if (!option) return

  database.prepare(`
    INSERT INTO meal_selections (menu_id, employee_id, date, category, meal_option_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(menu_id, employee_id, date) DO UPDATE SET
      category = excluded.category,
      meal_option_id = excluded.meal_option_id
  `).run(menu.id, employeeId, date, option.category, mealOptionId)
}
