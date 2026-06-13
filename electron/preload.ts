import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateStatusPayload } from './updater'

const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
    showItemInFolder: (filePath: string) =>
      ipcRenderer.invoke('app:showItemInFolder', filePath) as Promise<{ success: boolean; message: string }>
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check') as Promise<{ dev?: boolean; ok?: boolean }>,
    download: () => ipcRenderer.invoke('updater:download') as Promise<{ dev?: boolean; ok?: boolean }>,
    install: () => ipcRenderer.invoke('updater:install') as Promise<{ dev?: boolean; ok?: boolean }>,
    onStatus: (callback: (status: UpdateStatusPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatusPayload) => callback(status)
      ipcRenderer.on('updater:status', handler)
      return () => {
        ipcRenderer.removeListener('updater:status', handler)
      }
    }
  },
  employees: {
    getAll: () => ipcRenderer.invoke('employees:getAll'),
    add: (name: string) => ipcRenderer.invoke('employees:add', name),
    update: (id: number, name: string, active: boolean, inStretch: boolean, inMeals: boolean) =>
      ipcRenderer.invoke('employees:update', id, name, active, inStretch, inMeals),
    delete: (id: number) => ipcRenderer.invoke('employees:delete', id)
  },
  settings: {
    getHeavyDepot: () => ipcRenderer.invoke('settings:getHeavyDepot'),
    setHeavyDepot: (depot: number) => ipcRenderer.invoke('settings:setHeavyDepot', depot),
    getDepotSettings: () => ipcRenderer.invoke('settings:getDepotSettings'),
    setDepotSettings: (settings: { heavyDepot?: number; depot1Name?: string; depot2Name?: string }) =>
      ipcRenderer.invoke('settings:setDepotSettings', settings),
    getTheme: () => ipcRenderer.invoke('settings:getTheme') as Promise<'dark' | 'light'>,
    setTheme: (theme: 'dark' | 'light') =>
      ipcRenderer.invoke('settings:setTheme', theme) as Promise<'dark' | 'light'>,
    resetSchedule: () => ipcRenderer.invoke('settings:resetSchedule')
  },
  stretch: {
    getAssignments: (year: number, month: number) =>
      ipcRenderer.invoke('stretch:getAssignments', year, month),
    getSchedule: (year: number, month: number) =>
      ipcRenderer.invoke('stretch:getSchedule', year, month),
    getHolidays: (year: number, month: number) =>
      ipcRenderer.invoke('stretch:getHolidays', year, month),
    recordBalls: (date: string, employeeId: number, depot: number, count: number) =>
      ipcRenderer.invoke('stretch:recordBalls', date, employeeId, depot, count),
    getStats: (year: number, month: number) =>
      ipcRenderer.invoke('stretch:getStats', year, month),
    getAllTimeStats: () => ipcRenderer.invoke('stretch:getAllTimeStats'),
    generateSchedule: (year: number, month: number) =>
      ipcRenderer.invoke('stretch:generateSchedule', year, month),
    saveScheduleDay: (
      date: string,
      employee1Id: number,
      employee2Id: number,
      depot1EmployeeId: number
    ) => ipcRenderer.invoke('stretch:saveScheduleDay', date, employee1Id, employee2Id, depot1EmployeeId),
    deleteDay: (date: string) => ipcRenderer.invoke('stretch:deleteDay', date),
    markHoliday: (date: string) => ipcRenderer.invoke('stretch:markHoliday', date),
    replaceAbsent: (date: string, absentEmployeeId: number, replacementEmployeeId: number) =>
      ipcRenderer.invoke('stretch:replaceAbsent', date, absentEmployeeId, replacementEmployeeId),
    exportPdf: (year: number, month: number) =>
      ipcRenderer.invoke('stretch:exportPdf', year, month)
  },
  meals: {
    getMenu: (year: number, month: number) => ipcRenderer.invoke('meals:getMenu', year, month),
    getDays: (year: number, month: number) => ipcRenderer.invoke('meals:getDays', year, month),
    getSelections: (year: number, month: number) => ipcRenderer.invoke('meals:getSelections', year, month),
    importPdf: (year: number, month: number) => ipcRenderer.invoke('meals:importPdf', year, month),
    setSelection: (
      year: number,
      month: number,
      employeeId: number,
      date: string,
      mealOptionId: number | null
    ) => ipcRenderer.invoke('meals:setSelection', year, month, employeeId, date, mealOptionId),
    exportPdf: (year: number, month: number) => ipcRenderer.invoke('meals:exportPdf', year, month),
    exportExcel: (year: number, month: number) => ipcRenderer.invoke('meals:exportExcel', year, month)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
