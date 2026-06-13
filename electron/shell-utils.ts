import { shell } from 'electron'
import fs from 'fs'

export interface OpenPathResult {
  success: boolean
  message: string
}

export function showFileInExplorer(filePath: string): OpenPathResult {
  if (!fs.existsSync(filePath)) {
    return { success: false, message: 'El archivo no se encontró.' }
  }

  shell.showItemInFolder(filePath)
  return { success: true, message: 'Carpeta abierta con el archivo seleccionado.' }
}
