import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateStatusPayload } from './updater'
import type { StretchSale, StretchSaleResult, StretchStockResult } from '../src/types'

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
    getStock: () => ipcRenderer.invoke('stretch:getStock') as Promise<StretchStockResult>,
    sellStock: () => ipcRenderer.invoke('stretch:sellStock') as Promise<StretchSaleResult>,
    getSales: (year: number, month: number) =>
      ipcRenderer.invoke('stretch:getSales', year, month) as Promise<StretchSale[]>,
    generateSchedule: (year: number, month: number) =>
      ipcRenderer.invoke('stretch:generateSchedule', year, month),
    saveScheduleDay: (
      date: string,
      employee1Id: number,
      employee2Id: number,
      depot1EmployeeId: number
    ) =>
      ipcRenderer.invoke('stretch:saveScheduleDay', date, employee1Id, employee2Id, depot1EmployeeId) as Promise<boolean>,
    deleteDay: (date: string) => ipcRenderer.invoke('stretch:deleteDay', date),
    markHoliday: (date: string) => ipcRenderer.invoke('stretch:markHoliday', date),
    unmarkHoliday: (date: string) => ipcRenderer.invoke('stretch:unmarkHoliday', date),
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
  },
  supplies: {
    getItems: () => ipcRenderer.invoke('supplies:getItems'),
    getOrder: (year: number, month: number) => ipcRenderer.invoke('supplies:getOrder', year, month),
    getHistory: () => ipcRenderer.invoke('supplies:getHistory'),
    addLine: (year: number, month: number, name: string, quantity: number, unit: string, note = '') =>
      ipcRenderer.invoke('supplies:addLine', year, month, name, quantity, unit, note),
    updateLine: (
      lineId: number,
      updates: { quantity?: number; unit?: string; requested?: boolean; note?: string }
    ) => ipcRenderer.invoke('supplies:updateLine', lineId, updates),
    removeLine: (lineId: number) => ipcRenderer.invoke('supplies:removeLine', lineId),
    setNotes: (year: number, month: number, notes: string) =>
      ipcRenderer.invoke('supplies:setNotes', year, month, notes),
    setIssuedAt: (year: number, month: number, issuedAt: string | null) =>
      ipcRenderer.invoke('supplies:setIssuedAt', year, month, issuedAt) as Promise<string | null>,
    copyPrevious: (year: number, month: number) =>
      ipcRenderer.invoke('supplies:copyPrevious', year, month),
    deactivateItem: (id: number) => ipcRenderer.invoke('supplies:deactivateItem', id),
    exportPdf: (year: number, month: number) => ipcRenderer.invoke('supplies:exportPdf', year, month)
  },
  tactics: {
    listBoards: () => ipcRenderer.invoke('tactics:listBoards'),
    createBoard: (name: string) => ipcRenderer.invoke('tactics:createBoard', name),
    renameBoard: (boardId: number, name: string) => ipcRenderer.invoke('tactics:renameBoard', boardId, name),
    deleteBoard: (boardId: number) => ipcRenderer.invoke('tactics:deleteBoard', boardId),
    getBoard: (boardId: number) => ipcRenderer.invoke('tactics:getBoard', boardId),
    upsertPlacement: (boardId: number, employeeId: number, x: number, y: number) =>
      ipcRenderer.invoke('tactics:upsertPlacement', boardId, employeeId, x, y),
    movePlayer: (boardId: number, employeeId: number, x: number, y: number) =>
      ipcRenderer.invoke('tactics:movePlayer', boardId, employeeId, x, y),
    removePlacement: (boardId: number, employeeId: number) =>
      ipcRenderer.invoke('tactics:removePlacement', boardId, employeeId),
    clearBoard: (boardId: number) => ipcRenderer.invoke('tactics:clearBoard', boardId),
    addArrow: (
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
    ) => ipcRenderer.invoke('tactics:addArrow', boardId, payload),
    updateArrow: (
      arrowId: number,
      updates: Partial<{ x1: number; y1: number; x2: number; y2: number; curve: number; style: 'move' | 'pass' | 'press'; color: string }>
    ) => ipcRenderer.invoke('tactics:updateArrow', arrowId, updates),
    deleteArrow: (arrowId: number) => ipcRenderer.invoke('tactics:deleteArrow', arrowId),
    exportPng: (pngData: string) => ipcRenderer.invoke('tactics:exportPng', pngData)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
