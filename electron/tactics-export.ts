import { dialog } from 'electron'
import fs from 'fs'

export interface TacticsExportResult {
  success: boolean
  message: string
  filePath?: string
}

function stampForFile(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Guarda un PNG (data URL o base64) de la cancha táctica. */
export async function exportTacticsPng(pngData: string): Promise<TacticsExportResult> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar Mi Equipo',
    defaultPath: `Mi-Equipo-${stampForFile()}.png`,
    filters: [{ name: 'Imagen PNG', extensions: ['png'] }]
  })

  if (canceled || !filePath) {
    return { success: false, message: 'Exportación cancelada.' }
  }

  const base64 = pngData.includes(',')
    ? pngData.slice(pngData.indexOf(',') + 1)
    : pngData

  try {
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
    return {
      success: true,
      message: 'Mi Equipo exportado como imagen.',
      filePath
    }
  } catch {
    return { success: false, message: 'No se pudo guardar la imagen.' }
  }
}
