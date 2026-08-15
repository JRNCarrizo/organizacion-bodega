import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import {
  initDatabase,
  resetAllSchedule,
  getEmployees,
  getStretchEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getHeavyDepot,
  setHeavyDepot,
  getDepotSettings,
  setDepotSettings,
  getTheme,
  setTheme,
  getAssignmentsForMonth,
  recordBalls,
  getMonthlyStats,
  getAllTimeStats,
  saveScheduleDay,
  getScheduleForMonth,
  getStretchHolidaysForMonth
} from './database'
import { generateMonthlySchedule, markHolidayAndRebalance, unmarkHolidayAndRebalance } from './scheduler'
import { replaceAbsentEmployee } from './replacements'
import { exportSchedulePdf } from './pdf-export'
import { initMealsSchema, getMealMenu, getMealDays, getMealSelections, setMealSelection } from './meals-database'
import { importMealMenuPdf } from './meals-import'
import { exportMealMenuPdf, exportMealMenuExcel } from './meals-export'
import {
  initSuppliesSchema,
  getSupplyItems,
  getSupplyOrder,
  getSupplyHistory,
  addSupplyLine,
  updateSupplyLine,
  removeSupplyLine,
  setSupplyOrderNotes,
  copyPreviousSupplyOrder,
  deactivateSupplyItem
} from './supplies-database'
import { exportSupplyOrderPdf } from './supplies-export'
import { bindUpdateWindow, registerUpdaterHandlers, checkForUpdatesOnStartup } from './updater'
import { showFileInExplorer } from './shell-utils'

let mainWindow: BrowserWindow | null = null

if (process.platform === 'win32') {
  app.setAppUserModelId('com.organizacionbodega.app')
}

function resolveWindowIcon() {
  const candidates = [
    path.join(process.resourcesPath, 'icon.png'),
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../build/icon.ico')
  ]
  const filePath = candidates.find(candidate => fs.existsSync(candidate))
  if (!filePath) return undefined
  const image = nativeImage.createFromPath(filePath)
  return image.isEmpty() ? undefined : image
}

function createWindow() {
  const icon = resolveWindowIcon()
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Organización Bodega',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (icon) {
    mainWindow.setIcon(icon)
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  bindUpdateWindow(mainWindow)
}

app.whenReady().then(() => {
  registerUpdaterHandlers()
  initDatabase()
  initMealsSchema()
  initSuppliesSchema()
  createWindow()
  checkForUpdatesOnStartup()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('employees:getAll', () => getEmployees())
ipcMain.handle('employees:add', (_e, name: string) => addEmployee(name))
ipcMain.handle('employees:update', (
  _e,
  id: number,
  name: string,
  active: boolean,
  inStretch: boolean,
  inMeals: boolean
) => {
  updateEmployee(id, name, active, inStretch, inMeals)
})
ipcMain.handle('employees:delete', (_e, id: number) => deleteEmployee(id))

ipcMain.handle('settings:getHeavyDepot', () => getHeavyDepot())
ipcMain.handle('settings:setHeavyDepot', (_e, depot: number) => setHeavyDepot(depot))
ipcMain.handle('settings:getDepotSettings', () => getDepotSettings())
ipcMain.handle('settings:setDepotSettings', (_e, settings: { heavyDepot?: number; depot1Name?: string; depot2Name?: string }) =>
  setDepotSettings(settings)
)
ipcMain.handle('settings:getTheme', () => getTheme())
ipcMain.handle('settings:setTheme', (_e, theme: 'dark' | 'light') => setTheme(theme))
ipcMain.handle('settings:resetSchedule', () => {
  resetAllSchedule()
  return true
})

ipcMain.handle('stretch:getAssignments', (_e, year: number, month: number) =>
  getAssignmentsForMonth(year, month)
)
ipcMain.handle('stretch:getSchedule', (_e, year: number, month: number) =>
  getScheduleForMonth(year, month)
)
ipcMain.handle('stretch:getHolidays', (_e, year: number, month: number) =>
  getStretchHolidaysForMonth(year, month)
)
ipcMain.handle('stretch:recordBalls', (_e, date: string, employeeId: number, depot: number, count: number) => {
  return recordBalls(date, employeeId, depot, count)
})
ipcMain.handle('stretch:getStats', (_e, year: number, month: number) =>
  getMonthlyStats(year, month)
)
ipcMain.handle('stretch:getAllTimeStats', () => getAllTimeStats())
ipcMain.handle('stretch:generateSchedule', (_e, year: number, month: number) => {
  return generateMonthlySchedule(getStretchEmployees(), year, month)
})
ipcMain.handle('stretch:saveScheduleDay', (
  _e,
  date: string,
  employee1Id: number,
  employee2Id: number,
  depot1EmployeeId: number
) => {
  return saveScheduleDay(date, employee1Id, employee2Id, depot1EmployeeId)
})
ipcMain.handle('stretch:deleteDay', (_e, date: string) => {
  return markHolidayAndRebalance(getStretchEmployees(), date)
})
ipcMain.handle('stretch:markHoliday', (_e, date: string) => {
  return markHolidayAndRebalance(getStretchEmployees(), date)
})
ipcMain.handle('stretch:unmarkHoliday', (_e, date: string) => {
  return unmarkHolidayAndRebalance(getStretchEmployees(), date)
})
ipcMain.handle('stretch:exportPdf', (_e, year: number, month: number) =>
  exportSchedulePdf(year, month)
)
ipcMain.handle('stretch:replaceAbsent', (
  _e,
  date: string,
  absentEmployeeId: number,
  replacementEmployeeId: number
) => replaceAbsentEmployee(date, absentEmployeeId, replacementEmployeeId))

ipcMain.handle('meals:getMenu', (_e, year: number, month: number) => getMealMenu(year, month))
ipcMain.handle('meals:getDays', (_e, year: number, month: number) => getMealDays(year, month))
ipcMain.handle('meals:getSelections', (_e, year: number, month: number) => getMealSelections(year, month))
ipcMain.handle('meals:importPdf', (_e, year: number, month: number) => importMealMenuPdf(year, month))
ipcMain.handle('meals:setSelection', (
  _e,
  year: number,
  month: number,
  employeeId: number,
  date: string,
  mealOptionId: number | null
) => {
  setMealSelection(year, month, employeeId, date, mealOptionId)
  return true
})
ipcMain.handle('meals:exportPdf', (_e, year: number, month: number) => exportMealMenuPdf(year, month))
ipcMain.handle('meals:exportExcel', (_e, year: number, month: number) => exportMealMenuExcel(year, month))

ipcMain.handle('supplies:getItems', () => getSupplyItems())
ipcMain.handle('supplies:getOrder', (_e, year: number, month: number) => getSupplyOrder(year, month))
ipcMain.handle('supplies:getHistory', () => getSupplyHistory())
ipcMain.handle('supplies:addLine', (
  _e,
  year: number,
  month: number,
  name: string,
  quantity: number,
  unit: string,
  note: string
) => addSupplyLine(year, month, name, quantity, unit, note))
ipcMain.handle('supplies:updateLine', (
  _e,
  lineId: number,
  updates: { quantity?: number; unit?: string; requested?: boolean; note?: string }
) => {
  updateSupplyLine(lineId, updates)
  return true
})
ipcMain.handle('supplies:removeLine', (_e, lineId: number) => {
  removeSupplyLine(lineId)
  return true
})
ipcMain.handle('supplies:setNotes', (_e, year: number, month: number, notes: string) => {
  setSupplyOrderNotes(year, month, notes)
  return true
})
ipcMain.handle('supplies:copyPrevious', (_e, year: number, month: number) =>
  copyPreviousSupplyOrder(year, month)
)
ipcMain.handle('supplies:deactivateItem', (_e, id: number) => {
  deactivateSupplyItem(id)
  return true
})
ipcMain.handle('supplies:exportPdf', (_e, year: number, month: number) => exportSupplyOrderPdf(year, month))

ipcMain.handle('app:showItemInFolder', (_e, filePath: string) => showFileInExplorer(filePath))
