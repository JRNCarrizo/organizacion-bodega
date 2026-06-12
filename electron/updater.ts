import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

export type UpdateStatusPayload =
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

let mainWindow: BrowserWindow | null = null

function isDev(): boolean {
  return Boolean(process.env.VITE_DEV_SERVER_URL)
}

function sendStatus(payload: UpdateStatusPayload) {
  mainWindow?.webContents.send('updater:status', payload)
}

export function bindUpdateWindow(win: BrowserWindow) {
  mainWindow = win
}

export function registerUpdaterHandlers() {
  autoUpdater.logger = log
  autoUpdater.autoDownload = false

  autoUpdater.on('checking-for-update', () => sendStatus({ status: 'checking' }))
  autoUpdater.on('update-available', info => {
    sendStatus({ status: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => sendStatus({ status: 'not-available' }))
  autoUpdater.on('download-progress', progress => {
    sendStatus({ status: 'downloading', percent: progress.percent })
  })
  autoUpdater.on('update-downloaded', info => {
    sendStatus({ status: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', err => {
    sendStatus({ status: 'error', message: err.message })
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('updater:check', async () => {
    if (isDev()) {
      return { dev: true as const }
    }
    await autoUpdater.checkForUpdates()
    return { ok: true as const }
  })

  ipcMain.handle('updater:download', async () => {
    if (isDev()) return { dev: true as const }
    await autoUpdater.downloadUpdate()
    return { ok: true as const }
  })

  ipcMain.handle('updater:install', () => {
    if (isDev()) return { dev: true as const }
    autoUpdater.quitAndInstall()
    return { ok: true as const }
  })
}

export function checkForUpdatesOnStartup() {
  if (isDev()) return
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      log.warn('Startup update check failed:', err.message)
    })
  }, 4000)
}
