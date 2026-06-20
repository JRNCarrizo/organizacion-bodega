import { useEffect, useState } from 'react'
import type { EmployeeStats, MonthlyStatsResult, DepotSettings } from '../../types'
import { getDepotName } from '../../utils/depot'
import { format, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'

interface Props {
  refreshKey: number
}

type StatsPeriod = 'month' | 'all'

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

function capitalizeMonth(date: Date): string {
  const formatted = format(date, 'MMMM yyyy', { locale: es })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function sortStandings(employees: EmployeeStats[]): EmployeeStats[] {
  return [...employees].sort((a, b) => {
    if (b.stretch_balls !== a.stretch_balls) return b.stretch_balls - a.stretch_balls
    if (b.confirmed_shifts !== a.confirmed_shifts) return b.confirmed_shifts - a.confirmed_shifts
    return a.employee_name.localeCompare(b.employee_name, 'es')
  })
}

export default function StatsPanel({ refreshKey }: Props) {
  const [period, setPeriod] = useState<StatsPeriod>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [stats, setStats] = useState<EmployeeStats[]>([])
  const [uniqueDaysWorked, setUniqueDaysWorked] = useState(0)
  const [totalStretchBalls, setTotalStretchBalls] = useState(0)
  const [depotSettings, setDepotSettings] = useState<DepotSettings>({
    heavyDepot: 1,
    depot1Name: 'Depósito 1',
    depot2Name: 'Depósito 2'
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    const statsPromise = period === 'month'
      ? window.api.stretch.getStats(year, month)
      : window.api.stretch.getAllTimeStats()

    Promise.all([statsPromise, window.api.settings.getDepotSettings()]).then(([data, depots]) => {
      const result = data as MonthlyStatsResult
      setStats(result.employees)
      setUniqueDaysWorked(result.unique_days_worked)
      setTotalStretchBalls(result.total_stretch_balls)
      setDepotSettings(depots)
    })
  }, [period, year, month, refreshKey])

  const sortedStats = sortStandings(stats)
  const employeesWithData = sortedStats.filter(s => s.stretch_balls > 0 || s.confirmed_shifts > 0)
  const maxStretchBalls = Math.max(...sortedStats.map(s => s.stretch_balls), 1)
  const totalShifts = sortedStats.reduce((sum, s) => sum + s.confirmed_shifts, 0)
  const avgBallsPerEmployee = employeesWithData.length > 0
    ? (totalStretchBalls / employeesWithData.length).toFixed(1)
    : '0'

  const heavyDepot = depotSettings.heavyDepot
  const lightDepot = heavyDepot === 1 ? 2 : 1
  const heavyDepotName = getDepotName(heavyDepot, depotSettings)
  const lightDepotName = getDepotName(lightDepot, depotSettings)
  const isMonthView = period === 'month'

  const getHeavyDays = (s: EmployeeStats) => heavyDepot === 1 ? s.depot1_days : s.depot2_days
  const getLightDays = (s: EmployeeStats) => heavyDepot === 1 ? s.depot2_days : s.depot1_days

  return (
    <div className="stats-panel">
      <div className="stats-toolbar">
        <div className="stats-period-toggle" role="tablist" aria-label="Período de estadísticas">
          <button
            type="button"
            role="tab"
            aria-selected={isMonthView}
            className={`stats-period-btn ${isMonthView ? 'stats-period-btn-active' : ''}`}
            onClick={() => setPeriod('month')}
          >
            <span className="stats-period-btn-icon" aria-hidden="true">📅</span>
            Por mes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isMonthView}
            className={`stats-period-btn ${!isMonthView ? 'stats-period-btn-active' : ''}`}
            onClick={() => setPeriod('all')}
          >
            <span className="stats-period-btn-icon" aria-hidden="true">📈</span>
            Total acumulado
          </button>
        </div>

        {isMonthView ? (
          <div className="stats-month-nav">
            <button
              type="button"
              className="stats-toolbar-nav-btn"
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <div className="stats-month-info">
              <span className="stats-month-label">Estadísticas del mes</span>
              <h2>{capitalizeMonth(currentDate)}</h2>
            </div>
            <button
              type="button"
              className="stats-toolbar-nav-btn"
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>
        ) : (
          <div className="stats-month-nav stats-month-nav-all">
            <div className="stats-month-info">
              <span className="stats-month-label">Histórico completo</span>
              <h2>Total acumulado</h2>
            </div>
          </div>
        )}
      </div>

      <div className="stats-summary">
        <div className="stats-summary-card stats-summary-balls">
          <span className="stats-summary-icon" aria-hidden="true">⚪</span>
          <div className="stats-summary-copy">
            <span className="stats-summary-value">{totalStretchBalls}</span>
            <span className="stats-summary-label">Unidades confirmadas</span>
          </div>
        </div>
        <div className="stats-summary-card stats-summary-primary">
          <span className="stats-summary-icon" aria-hidden="true">✓</span>
          <div className="stats-summary-copy">
            <span className="stats-summary-value">{totalShifts}</span>
            <span className="stats-summary-label">Turnos confirmados</span>
          </div>
        </div>
        <div className="stats-summary-card stats-summary-days">
          <span className="stats-summary-icon" aria-hidden="true">📅</span>
          <div className="stats-summary-copy">
            <span className="stats-summary-value">{uniqueDaysWorked}</span>
            <span className="stats-summary-label">Días confirmados</span>
          </div>
        </div>
        <div className="stats-summary-card stats-summary-accent">
          <span className="stats-summary-icon" aria-hidden="true">≈</span>
          <div className="stats-summary-copy">
            <span className="stats-summary-value">{avgBallsPerEmployee}</span>
            <span className="stats-summary-label">Promedio por persona</span>
          </div>
        </div>
      </div>

      {sortedStats.length === 0 ? (
        <div className="stats-empty">
          <span className="stats-empty-icon" aria-hidden="true">📊</span>
          <p>{isMonthView ? 'Sin datos para este mes' : 'Sin datos acumulados'}</p>
          <span>Generá turnos y confirmá los completados para ver estadísticas</span>
        </div>
      ) : (
        <div className="stats-ranking-section">
          <div className="stats-ranking-header">
            <div>
              <span className="stats-ranking-kicker">Ranking del equipo</span>
              <h3>Tabla de posiciones</h3>
              <p className="stats-ranking-subtitle">
                Ordenada por unidades confirmadas · {isMonthView ? capitalizeMonth(currentDate) : 'Total histórico'}
              </p>
            </div>
            <span className="stats-ranking-badge">{totalStretchBalls} unidades</span>
          </div>

          <div className="stats-employee-list">
            {sortedStats.map((s, index) => {
              const rank = index + 1
              const heavyDays = getHeavyDays(s)
              const lightDays = getLightDays(s)
              const depotTotal = heavyDays + lightDays
              const heavyPct = depotTotal > 0 ? (heavyDays / depotTotal) * 100 : 50
              const hasNoData = s.stretch_balls === 0 && s.confirmed_shifts === 0
              const topClass = !hasNoData && rank <= 3 ? `stats-employee-card-top stats-employee-card-top-${rank}` : ''

              return (
                <div
                  key={s.employee_id}
                  className={`stats-employee-card ${topClass} ${hasNoData ? 'stats-employee-card-empty' : ''}`}
                >
                  <div className="stats-employee-top">
                    <div className="stats-employee-identity">
                      {!hasNoData && (
                        <span className={`stats-rank ${rank <= 3 ? `stats-rank-${rank}` : 'stats-rank-default'}`}>
                          {rank}
                        </span>
                      )}
                      <div className="stats-employee-avatar">{getInitials(s.employee_name)}</div>
                      <div className="stats-employee-info">
                        <span className="stats-employee-name">{s.employee_name}</span>
                        {hasNoData && <span className="stats-empty-badge">Sin registros</span>}
                      </div>
                    </div>
                    <div className="stats-employee-total">
                      <span className="stats-employee-total-value">{s.stretch_balls}</span>
                      <span className="stats-employee-total-label">unidades</span>
                    </div>
                  </div>

                  <div className="stats-employee-metrics">
                    <div className="stats-metric">
                      <span className="stats-metric-value">{s.confirmed_shifts}</span>
                      <span className="stats-metric-label">Turnos</span>
                    </div>
                    <div className="stats-metric">
                      <span className={`stats-metric-value depot-heavy-text`}>{heavyDays}</span>
                      <span className="stats-metric-label">{heavyDepotName}</span>
                    </div>
                    <div className="stats-metric">
                      <span className="stats-metric-value depot-light-text">{lightDays}</span>
                      <span className="stats-metric-label">{lightDepotName}</span>
                    </div>
                  </div>

                  <div className="stats-distribution">
                    <div className="stats-distribution-labels">
                      <span>Distribución por depósito</span>
                      <span>{heavyDays} / {lightDays}</span>
                    </div>
                    <div className="stats-depot-bar">
                      <div
                        className="stats-depot-bar-heavy"
                        style={{ width: `${heavyPct}%` }}
                      />
                      <div
                        className="stats-depot-bar-light"
                        style={{ width: `${100 - heavyPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="stats-progress-section">
                    <div className="stats-progress-labels">
                      <span>Unidades relativas al equipo</span>
                      <span>{Math.round((s.stretch_balls / maxStretchBalls) * 100)}%</span>
                    </div>
                    <div className="stats-progress-bar">
                      <div
                        className="stats-progress-fill"
                        style={{ width: `${(s.stretch_balls / maxStretchBalls) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
