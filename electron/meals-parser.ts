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

const DAY_HEADER = /^(LUNES|MARTES|MIERCOLES|MIÉRCOLES|JUEVES|VIERNES|SÁBADO|SABADO|DOMINGO)\s+(\d{1,2})$/i
const PAGE_BREAK = /^--\s*\d+\s+of\s+\d+\s*--$/i

function normalizeLine(line: string): string {
  return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseCategoryLine(line: string): { category: MealCategory; inlineDescription?: string } | null {
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

function parseDayHeader(line: string): { weekday: string; day: number } | null {
  const match = line.match(DAY_HEADER)
  if (!match) return null
  return {
    weekday: match[1].toUpperCase().replace('MIÉRCOLES', 'MIERCOLES').replace('SÁBADO', 'SABADO'),
    day: parseInt(match[2], 10)
  }
}

function isCarneLeadWrap(line: string): boolean {
  return /^wrap\b/i.test(line)
}

function getDishCategories(categories: CategoryEntry[]): MealCategory[] {
  return categories
    .filter(entry => entry.category !== 'ENSALADA')
    .map(entry => entry.category)
}

/**
 * Asignación en bloques: 1 o 2 platos seguidos por categoría.
 * Toma 2 solo si sobran platos para cubrir al menos 1 en cada categoría restante.
 */
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

/**
 * Algunos días arrancan con "Wrap ..." bajo el encabezado OMELETTE del PDF,
 * pero el plato es de CARNE. Luego sigue el resto en filas intercaladas.
 */
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

function buildDishOptions(
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

interface CategoryEntry {
  category: MealCategory
  inlineDescription?: string
}

export function parseCateringMenuText(text: string, year: number, month: number): ParsedMealDay[] {
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

    // El PDF agrupa encabezados de fila (ej. MARTES 02 + MIERCOLES 03) y luego
    // extrae los menús en orden de columna inverso: primero el de la derecha.
    const current = dayQueue.pop()!
    const ensaladaInline = categories.find(
      entry => entry.category === 'ENSALADA' && entry.inlineDescription
    )?.inlineDescription

    const options = buildDishOptions(categories, dishes, ensaladaInline)

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
    const dayHeader = parseDayHeader(line)
    if (dayHeader) {
      if (phase === 'dishes') flushDay()
      dayQueue.push(dayHeader)
      continue
    }

    const category = parseCategoryLine(line)
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
