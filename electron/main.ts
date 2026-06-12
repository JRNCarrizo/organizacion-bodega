import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
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
  getAssignmentsForMonth,
  recordBalls,
  getMonthlyStats,
  getAllTimeStats,
  saveScheduleDay,
  getScheduleForMonth,
  getStretchHolidaysForMonth
} from './database'
import { generateMonthlySchedule, markHolidayAndRebalance } from './scheduler'
import { replaceAbsentEmployee } from './replacements'
import { exportSchedulePdf } from './pdf-export'
import { initMealsSchema, getMealMenu, getMealDays, getMealSelections, setMealSelection } from './meals-database'
import { importMealMenuPdf } from './meals-import'
import { exportMealMenuPdf, exportMealMenuExcel } from './meals-export'
import { bindUpdateWindow, registerUpdaterHandlers, checkForUpdatesOnStartup } from './updater'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Organización Bodega',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

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
  saveScheduleDay(date, employee1Id, employee2Id, depot1EmployeeId)
})
ipcMain.handle('stretch:deleteDay', (_e, date: string) => {
  return markHolidayAndRebalance(getStretchEmployees(), date)
})
ipcMain.handle('stretch:markHoliday', (_e, date: string) => {
  return markHolidayAndRebalance(getStretchEmployees(), date)
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
