export type MealCategory = 'CARNE' | 'POLLO' | 'VEGGIE' | 'ENSALADA' | 'PASTAS' | 'TARTA' | 'OMELETTE'

export interface ParsedMealOption {
  category: MealCategory
  description: string
  optionIndex: number
}

export interface ParsedMealDay {
  date: string
  weekday: string
  dayNum: number
  options: ParsedMealOption[]
}

const PAGE_BREAK = /^--\s*\d+\s+of\s+\d+\s*--$/i
const WEEKDAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO']

const NEW_FORMAT_CATEGORY_ROW =
  /^[\u{1F300}-\u{1FAFF}]?\s*(Carne|Pollo|Veggie|Ensalada|Pasta(?:\s+(?:simple|rellena))?|Tarta(?:\s+rellena)?|Omelette|Tortilla)\s+(.+)$/iu

const HOLIDAY_LINE =
  /(?:Lun|Mar|Mie|Mi[eé]|Jue|Vie|S[aá]b|Dom)\s+(\d{1,2})\b.*SIN\s+SERVICIO/i

/** Segunda opción suele arrancar con estos prefijos (más específicos primero). */
const OPTION2_STARTERS = [
  'Pan de carne relleno',
  'Pan de carne con',
  'Pan de carne',
  'Sandwich de milanesa',
  'Sandwich de pollo',
  'Sandwich de pastr',
  'Sandwich de la',
  'Sandwich de suprema',
  'Sandwich de desmechado',
  'Sanwich de desmechado',
  'Roll de pollo relleno',
  'Roll de pollo fugaz',
  'Roll de carne con',
  'Wrap de pollo americano',
  'Wrap de pollo y espinaca',
  'Wrap de pollo capres',
  'Wrap de pollo caesar',
  'Wrap de pollo teriyaky',
  'Wrap de pollo teriyaki',
  'Wrap de Calabaza',
  'Wrap de calabaza',
  'Wrap americano con',
  'Wrap americano',
  'Wrap norteño con',
  'Wrap norteño',
  'Wrap veggie con',
  'Wrap veggie',
  'Wrap criollo',
  'Arroz amarillo con',
  'Arroz a la cubana',
  'Carne al horno a la',
  'Carne al horno con',
  'Pollo al disco con',
  'Pollo al disco',
  'Pollo al champignon con',
  'Pollo al champignon',
  'Pollo grillé a la',
  'Pollo grille a la',
  'Pollo grillé al',
  'Pollo grille al',
  'Pollo grillé napolitano',
  'Pollo grille napolitano',
  'Pollo grillé solo',
  'Pollo grille solo',
  'Cuarto de pollo al',
  'Cuarto de pollo a la',
  'Hamburguesa de pollo',
  'Hamburguesa argenta',
  'Hamburguesa veggie',
  'Hamburguessa veggie',
  'Hamburguesa completa',
  'Hamburguesa 4 quesos',
  'Milanesa de berenjena',
  'Milanesa de soja',
  'Milanesa de calabaza',
  'Milanesa florentina',
  'Milanesa calabresa',
  'Milanesa provenzal',
  'Milanesa a la suiza',
  'Milanesa a los 4',
  'Milanesa a caballo',
  'Milanesa con ensalada',
  'Milanesa napolitana',
  'Cazuela de arroz',
  'Cazuela de lentejas',
  'Cazuela de fideos',
  'Suprema napolitana',
  'Suprrema napolitana',
  'Suprema provenzal',
  'Suprema a la Suiza',
  'Suprema a la parmesana',
  'Suprema a los 4',
  'Suprema florentina',
  'Suprema calabresa',
  'Suprema fugazzetta',
  'Medallón de pollo',
  'Medallón de carne',
  'Medallón veggie',
  'Empanadas de pollo',
  'Empanadas de humita',
  'Empanadas de calabaza',
  'Empanadas de espinaca',
  'Empanadas de carne',
  'Empanadas capresse',
  'Empanadas caprese',
  'Empanadas fugazzeta',
  'Empanadas jardineras',
  'Albóndigas rellenas',
  'Albóndigas de papa',
  'Albóndigas de ricota',
  'Albóndigas a la',
  'Alitas de pollo',
  'Alita de pollo',
  'Bomba de papa',
  'Budín de calabaza',
  'Budín tricolor',
  'Papa rellena veggie',
  'Papa rellena de carne',
  'Papa rellena de pollo',
  'Zapallitos rellenos',
  'Berenjenas rellenas',
  'Chow Mein de',
  'Chow mien de',
  'Chicken Pie',
  'Chiken Pie',
  'Tacos de pollo',
  'Tacos de carne',
  'Tacos veggie',
  'Bifecitos a la',
  'Strogonoff de carne',
  'Strogonoff de pollo',
  'Matambre a la',
  'Bondiola a la',
  'Ossobuco al disco',
  'Osobuco al disco',
  'Ossobuco ',
  'Osobuco ',
  'Cerdo a la',
  'Pastel de papa',
  'Pastel de cerdo',
  'Guiso de mondongo',
  'Wok de pollo',
  'Wok de carne',
  'Wok veggie',
  'Risotto de hongos',
  'Risotto de albahaca',
  'Risotto de remolacha',
  'Rissoto de hongos',
  'Seitán a la',
  'Seitán al verdeo',
  'Polenta con salsa',
  'Calzón caprese',
  'Calzone capresse',
  'Calzone caprese',
  'Calzone fugazzeto',
  'Calzone de jamón',
  'Calzone de jamon',
  'Bagel de carne',
  'Bagel de pollo',
  'Bagel veggie',
  'Salpicón de ave',
  'Salpicón ',
  'Chorizos a la',
  'Omelette caprese',
  'Omelette completo',
  'Omelette fugazzeto',
  'Omelette veggie',
  'Omelette napolitano',
  'Omelette de verdeo',
  'Omelette de espinaca',
  'Omelette de jamón',
  'Omelette queso azul',
  'Tortilla de zapallito',
  'Tortilla de hojas',
  'Tortilla de papas',
  'Tortilla veggie',
  'Tortilla española',
  'Tarta de espinaca',
  'Tarta de jamón',
  'Tarta de puerro',
  'Tarta de coliflor',
  'Tarta de calabaza',
  'Tarta de brócoli',
  'Tarta de pollo',
  'Tarta de zapallitos',
  'Tarta de humita',
  'Tarta de fugazzeta',
  'Tarta pascualina',
  'Tarta caprese',
  'Tarta criolla',
  'Tarta veggie',
  'Cazuela ',
  'Milanesa ',
  'Hamburguesa ',
  'Hamburguessa ',
  'Matambre ',
  'Bondiola ',
  'Wrap ',
  'Carne ',
  'Pollo ',
  'Roll ',
  'Wok ',
  'Tacos ',
  'Arroz ',
  'Empanadas ',
  'Albóndigas ',
  'Medallón ',
  'Suprema ',
  'Suprrema ',
  'Seitán ',
  'Bomba ',
  'Papa rellena ',
  'Zapallitos ',
  'Berenjenas ',
  'Pastel ',
  'Guiso ',
  'Cerdo ',
  'Bifecitos ',
  'Chow ',
  'Sandwich ',
  'Sanwich ',
  'Chorizos ',
  'Pan de ',
  'Risotto ',
  'Rissoto ',
  'Calzón ',
  'Calzone ',
  'Bagel ',
  'Polenta ',
  'Budín ',
  'Chicken ',
  'Chiken ',
  'Salpicón ',
  'Tortilla ',
  'Omelette ',
  'Tarta '
]

/** Evita cortar dentro de "Cuarto de Pollo...", "Milanesa a Caballo...", etc. */
const SPLIT_CONNECTOR_BEFORE =
  /(?:^|[\s,.(])(?:de|del|al|a|a la|a los|a las|con|y|e|en|o|u)$/i

/**
 * Finales típicos de la opción 1 (guarnición / aderezo).
 * Sirve para detectar opción 2 aunque el plato sea nuevo.
 */
const OPTION1_SIDE_ENDING =
  /(?:fritas|horno|tomate|lechuga|repollo|papa|papas|arroz|blanco|mixto|crema|cheddar|nachos|huevo|r[uú]cula|remolacha|zanahoria|verdeo|fileto|provenzal|espa[nñ]ola|portuguesa|napolitana|suiza|capresse|fugazzett?[ao]|mostaza|barbacoa|lim[oó]n|naranja|queso|muzarella|muzzarella|ricotta|ricota|batatas|r[uú]sticas|cubana|criolla|riojana)\s*$/i

function normalizeLine(line: string): string {
  return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
}

function getWeekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()]
}

function isCombinedOptionsCateringFormat(text: string): boolean {
  return /Categor[ií]a\s+Opci[oó]n\s+1\s+Opci[oó]n\s+2/i.test(text)
}

/** Formato Septiembre+: cada opción en su propia línea (Carne×2, Pollo×2, …). */
function isSplitOptionsCateringFormat(text: string): boolean {
  if (isCombinedOptionsCateringFormat(text)) return false
  const lines = text.split('\n').map(normalizeLine).filter(Boolean)
  let prevWasCarne = false
  for (const line of lines) {
    if (PAGE_BREAK.test(line)) {
      prevWasCarne = false
      continue
    }
    const isCarne = /^[\u{1F300}-\u{1FAFF}]?\s*Carne\s+/iu.test(line)
    if (isCarne && prevWasCarne) return true
    prevWasCarne = isCarne
  }
  return false
}

function isNewCateringFormat(text: string): boolean {
  return isCombinedOptionsCateringFormat(text)
    || /^[\u{1F300}-\u{1FAFF}]?\s*Carne\s+/mu.test(text)
}

function mapCategory(raw: string): MealCategory {
  const upper = raw.toUpperCase().trim()
  if (upper.startsWith('PASTA')) return 'PASTAS'
  if (upper.startsWith('TARTA')) return 'TARTA'
  if (upper === 'TORTILLA') return 'OMELETTE'
  return upper as MealCategory
}

function indexOfIgnoreCase(haystack: string, needle: string): number {
  return haystack.toLowerCase().indexOf(needle.toLowerCase())
}

function isWordStart(text: string, idx: number): boolean {
  if (idx <= 0) return true
  return !/[\p{L}\p{N}_]/u.test(text[idx - 1])
}

function isFalsePositiveOptionSplit(text: string, idx: number): boolean {
  if (!isWordStart(text, idx)) return true
  const before = text.slice(0, idx).replace(/\s+$/, '')
  return SPLIT_CONNECTOR_BEFORE.test(before)
}

/** Posibles inicios de opción 2: palabra con mayúscula después de un espacio. */
function findOption2Candidates(text: string, minFirst: number): number[] {
  const candidates: number[] = []
  const re = /[A-ZÁÉÍÓÚÜÑ]/gu
  for (let i = minFirst; i < text.length; i++) {
    if (!re.test(text[i])) continue
    if (!isWordStart(text, i)) continue
    if (isFalsePositiveOptionSplit(text, i)) continue
    candidates.push(i)
  }
  return candidates
}

function startsWithKnownDish(text: string): boolean {
  const lower = text.toLowerCase()
  return OPTION2_STARTERS.some(starter => lower.startsWith(starter.toLowerCase()))
}

/**
 * Separa opción 1 y 2 en la misma línea.
 * 1) Prefiere un corte que coincida con un plato conocido.
 * 2) Si el plato es nuevo, corta después de una guarnición típica
 *    (fritas, horno, tomate, etc.) ante una palabra con mayúscula.
 */
function splitTwoOptions(text: string): [string, string] {
  const minFirst = 10
  const candidates = findOption2Candidates(text, minFirst)

  for (const idx of candidates) {
    if (startsWithKnownDish(text.slice(idx))) {
      return [text.slice(0, idx).trim(), text.slice(idx).trim()]
    }
  }

  const afterSide = candidates.filter(idx =>
    OPTION1_SIDE_ENDING.test(text.slice(0, idx).replace(/\s+$/, ''))
  )
  if (afterSide.length > 0) {
    const idx = afterSide[afterSide.length - 1]
    return [text.slice(0, idx).trim(), text.slice(idx).trim()]
  }

  // Fallback: starters aunque no haya mayúscula clara (platos en minúscula)
  let bestIdx = -1
  for (const starter of OPTION2_STARTERS) {
    let from = 0
    while (from < text.length) {
      const rel = indexOfIgnoreCase(text.slice(from), starter)
      if (rel < 0) break
      const idx = from + rel
      if (idx >= minFirst && !isFalsePositiveOptionSplit(text, idx)) {
        if (bestIdx < 0 || idx < bestIdx) bestIdx = idx
        break
      }
      from = idx + 1
    }
  }

  if (bestIdx >= 0) {
    return [text.slice(0, bestIdx).trim(), text.slice(bestIdx).trim()]
  }
  return [text.trim(), '']
}

function stripRepeatedCategoryPrefix(content: string, category: MealCategory): string {
  let result = content.trim()
  if (category === 'TARTA') {
    result = result.replace(/^rellena\s+/i, '')
    // Solo saca el prefijo redundante si no es "Tarta de ..."
    if (/^Tarta\s+(?!de\b)/i.test(result)) {
      result = result.replace(/^Tarta\s+/i, '')
    }
    return result
  }
  if (category === 'OMELETTE') {
    // "Omelette Omelette Completo" / "Omelette Jamón..."; conservar "Tortilla de ..."
    while (/^(?:Tortilla|Omelette)\s+(?!de\b)/i.test(result)) {
      result = result.replace(/^(?:Tortilla|Omelette)\s+/i, '')
    }
    return result
  }
  if (category === 'PASTAS') {
    return result
      .replace(/^Pasta\s+(?:simple|rellena)\s+/i, '')
      .replace(/^Pasta\s+/i, '')
  }
  // No sacar "Carne/Pollo/…" del plato ("Carne al Horno", "Pollo grille…")
  return result
}

function parseCategoryRow(line: string): ParsedMealOption[] {
  const match = line.match(NEW_FORMAT_CATEGORY_ROW)
  if (!match) return []

  const category = mapCategory(match[1])
  let content = stripRepeatedCategoryPrefix(match[2].trim(), category)
  const options: ParsedMealOption[] = []

  // Ensalada / pastas / tarta / omelette: una sola opción en el PDF del catering.
  if (
    category === 'ENSALADA'
    || category === 'PASTAS'
    || category === 'TARTA'
    || category === 'OMELETTE'
  ) {
    options.push({ category, description: content, optionIndex: 1 })
    return options
  }

  const [opt1, opt2] = splitTwoOptions(content)
  options.push({ category, description: opt1, optionIndex: 1 })
  if (opt2) {
    options.push({ category, description: opt2, optionIndex: 2 })
  }
  return options
}

function extractSkipDays(lines: string[]): Set<number> {
  const skip = new Set<number>()
  for (const line of lines) {
    const match = line.match(HOLIDAY_LINE)
    if (match) skip.add(parseInt(match[1], 10))
  }
  return skip
}

function getServiceDays(year: number, month: number, skipDays: Set<number>): string[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const dates: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    if (skipDays.has(d)) continue
    const dow = new Date(year, month - 1, d).getDay()
    if (dow >= 1 && dow <= 5) {
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }
  return dates
}

function extractCategoryLines(lines: string[]): string[] {
  const rows: string[] = []
  for (const line of lines) {
    if (PAGE_BREAK.test(line)) continue
    if (line.startsWith('Categoría') || line.startsWith('Categoria')) continue
    if (NEW_FORMAT_CATEGORY_ROW.test(line)) rows.push(line)
  }
  return rows
}

const SPLIT_DAY_LABEL =
  /^(LUNES|MARTES|MI[EÉ]RCOLES|JUEVES|VIERNES|S[AÁ]BADO|DOMINGO)\s+(\d{1,2})\s*\/\s*(\d{1,2})\b/i

function extractSplitDayLabels(lines: string[]): Array<{ weekday: string; day: number; month: number }> {
  const labels: Array<{ weekday: string; day: number; month: number }> = []
  for (const line of lines) {
    const match = line.match(SPLIT_DAY_LABEL)
    if (!match) continue
    labels.push({
      weekday: match[1]
        .toUpperCase()
        .replace('MIÉRCOLES', 'MIERCOLES')
        .replace('SÁBADO', 'SABADO'),
      day: parseInt(match[2], 10),
      month: parseInt(match[3], 10)
    })
  }
  return labels
}

/** Una línea = una opción (formato Septiembre+). */
function parseSplitCategoryLine(line: string): ParsedMealOption | null {
  const match = line.match(NEW_FORMAT_CATEGORY_ROW)
  if (!match) return null
  const category = mapCategory(match[1])
  const description = stripRepeatedCategoryPrefix(match[2].trim(), category)
  if (!description) return null
  return { category, description, optionIndex: 1 }
}

function groupSplitDayMenus(categoryLines: string[]): ParsedMealOption[][] {
  const menus: ParsedMealOption[][] = []
  let current: ParsedMealOption[] = []

  for (const line of categoryLines) {
    const parsed = parseSplitCategoryLine(line)
    if (!parsed) continue

    const carneCount = current.filter(option => option.category === 'CARNE').length
    const startedOtherCategories = current.some(option => option.category !== 'CARNE')
    if (
      parsed.category === 'CARNE'
      && current.length > 0
      && (carneCount >= 2 || startedOtherCategories)
    ) {
      menus.push(current)
      current = []
    }

    const optionIndex = current.filter(option => option.category === parsed.category).length + 1
    current.push({ ...parsed, optionIndex })
  }

  if (current.length > 0) menus.push(current)
  return menus
}

function sortDayLabels(labels: Array<{ weekday: string; day: number; month: number }>) {
  return [...labels].sort((a, b) => {
    if (a.month !== b.month) return a.month - b.month
    return a.day - b.day
  })
}

function labelToDate(
  label: { day: number; month: number },
  importYear: number,
  importMonth: number
): string {
  const labelYear = label.month === 1 && importMonth === 12 ? importYear + 1 : importYear
  return `${labelYear}-${String(label.month).padStart(2, '0')}-${String(label.day).padStart(2, '0')}`
}

function splitLinesByPage(lines: string[]): string[][] {
  const pages: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    if (PAGE_BREAK.test(line)) {
      if (current.length > 0) pages.push(current)
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) pages.push(current)
  return pages
}

function parseSplitOptionsMenuText(text: string, year: number, month: number): ParsedMealDay[] {
  const lines = text.split('\n').map(normalizeLine).filter(Boolean)
  const skipDays = extractSkipDays(lines)
  const serviceDays = getServiceDays(year, month, skipDays)
  const result: ParsedMealDay[] = []

  // Por página: bloques de menú arriba, fechas abajo (a veces desordenadas en el PDF).
  for (const pageLines of splitLinesByPage(lines)) {
    const menus = groupSplitDayMenus(extractCategoryLines(pageLines))
    const labels = sortDayLabels(extractSplitDayLabels(pageLines))
    if (menus.length === 0 || labels.length === 0) continue

    const count = Math.min(menus.length, labels.length)
    for (let i = 0; i < count; i++) {
      const label = labels[i]
      const date = labelToDate(label, year, month)
      result.push({
        date,
        weekday: getWeekdayLabel(date),
        dayNum: label.day,
        options: menus[i]
      })
    }
  }

  if (result.length > 0) {
    return result.sort((a, b) => a.date.localeCompare(b.date))
  }

  // Fallback sin etiquetas de fecha en el PDF
  const menus = groupSplitDayMenus(extractCategoryLines(lines))
  const count = Math.min(menus.length, serviceDays.length)
  for (let i = 0; i < count; i++) {
    const date = serviceDays[i]
    result.push({
      date,
      weekday: getWeekdayLabel(date),
      dayNum: parseInt(date.split('-')[2], 10),
      options: menus[i]
    })
  }
  return result
}

function parseNewCateringMenuText(text: string, year: number, month: number): ParsedMealDay[] {
  const lines = text.split('\n').map(normalizeLine).filter(Boolean)
  const skipDays = extractSkipDays(lines)
  const serviceDays = getServiceDays(year, month, skipDays)
  const categoryLines = extractCategoryLines(lines)

  const menus: ParsedMealOption[][] = []
  for (let i = 0; i < categoryLines.length; i += 7) {
    const chunk = categoryLines.slice(i, i + 7)
    if (chunk.length === 0) continue
    const dayOptions: ParsedMealOption[] = []
    for (const row of chunk) {
      dayOptions.push(...parseCategoryRow(row))
    }
    if (dayOptions.length > 0) menus.push(dayOptions)
  }

  const result: ParsedMealDay[] = []
  const count = Math.min(menus.length, serviceDays.length)
  for (let i = 0; i < count; i++) {
    const date = serviceDays[i]
    const dayNum = parseInt(date.split('-')[2], 10)
    result.push({
      date,
      weekday: getWeekdayLabel(date),
      dayNum,
      options: menus[i]
    })
  }
  return result
}

// --- Formato anterior (columnas por día) ---

const LEGACY_DAY_HEADER = /^(LUNES|MARTES|MIERCOLES|MIÉRCOLES|JUEVES|VIERNES|SÁBADO|SABADO|DOMINGO)\s+(\d{1,2})$/i

function parseLegacyCategoryLine(line: string): { category: MealCategory; inlineDescription?: string } | null {
  const upper = line.toUpperCase().trim()

  if (upper === 'OMELETTE' || upper === 'TORTILLA') {
    return { category: 'OMELETTE' }
  }

  for (const category of ['CARNE', 'POLLO', 'VEGGIE', 'PASTAS', 'TARTA'] as const) {
    if (upper === category) {
      return { category }
    }
  }

  if (upper.startsWith('ENSALADA')) {
    const rest = line
      .slice('ENSALADA'.length)
      .trim()
      .replace(/^[:.\s]+/, '')
      .replace(/^De:\s*/i, '')
      .trim()
    return { category: 'ENSALADA', inlineDescription: rest || undefined }
  }

  return null
}

function parseLegacyDayHeader(line: string): { weekday: string; day: number } | null {
  const match = line.match(LEGACY_DAY_HEADER)
  if (!match) return null
  return {
    weekday: match[1].toUpperCase().replace('MIÉRCOLES', 'MIERCOLES').replace('SÁBADO', 'SABADO'),
    day: parseInt(match[2], 10)
  }
}

function isCarneLeadWrap(line: string): boolean {
  return /^wrap\b/i.test(line)
}

interface CategoryEntry {
  category: MealCategory
  inlineDescription?: string
}

function getDishCategories(categories: CategoryEntry[]): MealCategory[] {
  return categories
    .filter(entry => entry.category !== 'ENSALADA')
    .map(entry => entry.category)
}

function assignPairedSequential(
  categories: MealCategory[],
  dishes: string[]
): ParsedMealOption[] {
  const options: ParsedMealOption[] = []
  let index = 0

  for (let catIndex = 0; catIndex < categories.length && index < dishes.length; catIndex++) {
    const category = categories[catIndex]
    const remaining = dishes.length - index
    const categoriesLeft = categories.length - catIndex
    const canTakeTwo = remaining > categoriesLeft

    if (canTakeTwo) {
      options.push({ category, description: dishes[index++], optionIndex: 1 })
      if (index < dishes.length) {
        options.push({ category, description: dishes[index++], optionIndex: 2 })
      }
    } else {
      options.push({ category, description: dishes[index++], optionIndex: 1 })
    }
  }

  return options
}

function assignCarneLeadWrapLayout(
  categories: MealCategory[],
  dishes: string[]
): ParsedMealOption[] {
  const options: ParsedMealOption[] = []
  let index = 0

  options.push({ category: 'CARNE', description: dishes[index++], optionIndex: 1 })
  if (index < dishes.length) {
    options.push({ category: 'CARNE', description: dishes[index++], optionIndex: 2 })
  }

  const orderCats = categories.filter(category => category !== 'OMELETTE' && category !== 'CARNE')
  const tailDishes = dishes.slice(index)
  const extras = Math.max(0, tailDishes.length - orderCats.length)
  const omeletteOption = categories.includes('OMELETTE') ? Math.min(1, extras) : 0
  const rowExtras = extras - omeletteOption
  let tailIndex = 0

  for (let row = 0; row < orderCats.length && tailIndex < tailDishes.length; row++) {
    options.push({
      category: orderCats[row],
      description: tailDishes[tailIndex++],
      optionIndex: 1
    })

    if (row < rowExtras && tailIndex < tailDishes.length) {
      options.push({
        category: orderCats[row],
        description: tailDishes[tailIndex++],
        optionIndex: 2
      })
    }
  }

  if (omeletteOption > 0 && tailIndex < tailDishes.length) {
    options.push({
      category: 'OMELETTE',
      description: tailDishes[tailIndex++],
      optionIndex: 1
    })
  }

  return options
}

function buildLegacyDishOptions(
  categories: CategoryEntry[],
  dishes: string[],
  ensaladaInline?: string
): ParsedMealOption[] {
  const options: ParsedMealOption[] = []

  if (ensaladaInline) {
    options.push({ category: 'ENSALADA', description: ensaladaInline, optionIndex: 1 })
  }

  if (dishes.length === 0) return options

  const dishCategories = getDishCategories(categories)
  if (dishCategories.length === 0) return options

  const list = [...dishes]
  const carneLeadWrap = list.length > 0 && isCarneLeadWrap(list[0])

  const assigned = carneLeadWrap
    ? assignCarneLeadWrapLayout(dishCategories, list)
    : assignPairedSequential(dishCategories, list)

  options.push(...assigned)
  return options
}

interface DayQueueItem {
  weekday: string
  day: number
}

function parseLegacyCateringMenuText(text: string, year: number, month: number): ParsedMealDay[] {
  const lines = text
    .split('\n')
    .map(normalizeLine)
    .filter(line => line.length > 0 && !PAGE_BREAK.test(line))

  const result: ParsedMealDay[] = []
  let dayQueue: DayQueueItem[] = []
  let categories: CategoryEntry[] = []
  let dishes: string[] = []
  let phase: 'idle' | 'categories' | 'dishes' = 'idle'

  const buildDate = (day: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const flushDay = () => {
    if (dayQueue.length === 0 || categories.length === 0) return

    const current = dayQueue.pop()!
    const ensaladaInline = categories.find(
      entry => entry.category === 'ENSALADA' && entry.inlineDescription
    )?.inlineDescription

    const options = buildLegacyDishOptions(categories, dishes, ensaladaInline)

    result.push({
      date: buildDate(current.day),
      weekday: current.weekday,
      dayNum: current.day,
      options
    })

    categories = []
    dishes = []
    phase = 'idle'
  }

  for (const line of lines) {
    const dayHeader = parseLegacyDayHeader(line)
    if (dayHeader) {
      if (phase === 'dishes') flushDay()
      dayQueue.push(dayHeader)
      continue
    }

    const category = parseLegacyCategoryLine(line)
    if (category) {
      if (category.category === 'CARNE' && phase === 'dishes') {
        flushDay()
      }

      categories.push({
        category: category.category,
        inlineDescription: category.inlineDescription
      })
      phase = 'categories'
      continue
    }

    if (categories.length > 0) {
      phase = 'dishes'
      dishes.push(line)
    }
  }

  while (dayQueue.length > 0 && categories.length > 0) {
    flushDay()
  }

  return result.sort((a, b) => a.date.localeCompare(b.date))
}

export function parseCateringMenuText(text: string, year: number, month: number): ParsedMealDay[] {
  if (isSplitOptionsCateringFormat(text)) {
    return parseSplitOptionsMenuText(text, year, month)
  }
  if (isNewCateringFormat(text)) {
    return parseNewCateringMenuText(text, year, month)
  }
  return parseLegacyCateringMenuText(text, year, month)
}

export function inferMonthFromFilename(filename: string): number | null {
  const months: Record<string, number> = {
    ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
    JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12
  }
  const upper = filename.toUpperCase()
  for (const [name, num] of Object.entries(months)) {
    if (upper.includes(name)) return num
  }
  return null
}

export function inferYearFromMenuText(text: string): number | null {
  const match = text.match(/\b(20\d{2})\b/)
  return match ? parseInt(match[1], 10) : null
}
