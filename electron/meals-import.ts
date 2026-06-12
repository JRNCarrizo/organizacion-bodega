import { dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { PDFParse } from 'pdf-parse'
import { parseCateringMenuText, inferMonthFromFilename } from './meals-parser'
import { saveMealMenu } from './meals-database'

export interface MealImportResult {
  success: boolean
  message: string
  dayCount?: number
}

function getMealsDir(): string {
  const dir = path.join(app.getPath('userData'), 'meals')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function importMealMenuPdf(
  year: number,
  month: number
): Promise<MealImportResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Importar menú del catering (PDF)',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile']
  })

  if (canceled || filePaths.length === 0) {
    return { success: false, message: 'Importación cancelada.' }
  }

  const sourcePath = filePaths[0]
  const filename = path.basename(sourcePath)

  let resolvedYear = year
  let resolvedMonth = month

  const inferredMonth = inferMonthFromFilename(filename)
  if (inferredMonth) resolvedMonth = inferredMonth

  try {
    const buffer = fs.readFileSync(sourcePath)
    const parser = new PDFParse({ data: buffer })
    const textResult = await parser.getText()
    await parser.destroy()
    const days = parseCateringMenuText(textResult.text, resolvedYear, resolvedMonth)

    if (days.length === 0) {
      return {
        success: false,
        message: 'No se pudieron detectar días en el PDF. Verificá el formato del archivo.'
      }
    }

    const destPath = path.join(getMealsDir(), `${resolvedYear}-${String(resolvedMonth).padStart(2, '0')}-${filename}`)
    fs.copyFileSync(sourcePath, destPath)

    saveMealMenu(resolvedYear, resolvedMonth, filename, days)

    return {
      success: true,
      message: `Menú importado: ${days.length} días detectados (${filename}).`,
      dayCount: days.length
    }
  } catch (error) {
    console.error(error)
    return { success: false, message: 'Error al leer el PDF. Probá con otro archivo.' }
  }
}
