export interface Employee {
  id: number
  name: string
  active: number
  in_stretch: number
  in_meals: number
  created_at: string
}

export interface StretchAssignment {
  id: number
  date: string
  employee_id: number
  depot: number
  balls_count: number
  employee_name?: string
  original_employee_id?: number | null
  original_employee_name?: string | null
  is_replacement?: number
}

export interface ReplacementResult {
  success: boolean
  message: string
  swapDate: string | null
}

export interface ExportPdfResult {
  success: boolean
  message: string
  filePath?: string
}

export interface StretchScheduleDay {
  date: string
  employee1_id: number
  employee1_name: string
  employee2_id: number
  employee2_name: string
  depot1_employee_id: number
}

export interface EmployeeStats {
  employee_id: number
  employee_name: string
  stretch_balls: number
  confirmed_shifts: number
  depot1_days: number
  depot2_days: number
}

export interface DepotSettings {
  heavyDepot: number
  depot1Name: string
  depot2Name: string
}

export interface MealMenuSummary {
  id: number
  year: number
  month: number
  source_filename: string | null
  imported_at: string
  day_count: number
}

export interface MealDayOption {
  id: number
  category: string
  description: string
  option_index: number
}

export interface MealDayView {
  id: number
  date: string
  weekday: string
  options: MealDayOption[]
}

export interface MealSelectionView {
  employee_id: number
  employee_name: string
  date: string
  category: string
  meal_option_id: number
  description: string
}

export interface MealImportResult {
  success: boolean
  message: string
  dayCount?: number
}

export interface MealExportResult {
  success: boolean
  message: string
  filePath?: string
}

export interface MonthlyStatsResult {
  employees: EmployeeStats[]
  unique_days_worked: number
  total_stretch_balls: number
}
