import { useEffect, useState } from 'react'
import type {
  EmployeeStats,
  MonthlyStatsResult,
  DepotSettings,
  StretchSale,
  StretchStockResult
} from '../../types'
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

function formatSaleDate(soldOn: string): string {
  const [year, month, day] = soldOn.split('-').map(Number)
  return format(new Date(year, month - 1, day), "d 'de' MMMM yyyy", { locale: es })
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
  const [stock, setStock] = useState<StretchStockResult>({ current: 0, last_sale: null, sales: [] })
  const [monthSales, setMonthSales] = useState<StretchSale[]>([])
  const [confirmSale, setConfirmSale] = useState(false)
  const [selling, setSelling] = useState(false)
  const [saleMessage, setSaleMessage] = useState('')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    const statsPromise = period === 'month'
      ? window.api.stretch.getStats(year, month)
      : window.api.stretch.getAllTimeStats()
    const salesPromise = period === 'month'
      ? window.api.stretch.getSales(year, month)
      : Promise.resolve(null)

    Promise.all([
      statsPromise,
      window.api.settings.getDepotSettings(),
      window.api.stretch.getStock(),
      salesPromise
    ]).then(([data, depots, stockData, monthSaleRows]) => {
      const result = data as MonthlyStatsResult
      setStats(result.employees)
      setUniqueDaysWorked(result.unique_days_worked)
      setTotalStretchBalls(result.total_stretch_balls)
      setDepotSettings(depots)
      setStock(stockData)
      if (monthSaleRows) setMonthSales(monthSaleRows)
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
  const historySales = isMonthView ? monthSales : stock.sales
  const monthSoldTotal = monthSales.reduce((sum, sale) => sum + sale.balls_count, 0)

  const handleSellStock = async () => {
    if (selling || stock.current <= 0) return
    setSelling(true)
    setSaleMessage('')
    try {
      const result = await window.api.stretch.sellStock()
      if (!result.success) {
        setSaleMessage(result.message)
        setConfirmSale(false)
        return
      }
      const [stockData, monthSaleRows] = await Promise.all([
        window.api.stretch.getStock(),
        isMonthView ? window.api.stretch.getSales(year, month) : Promise.resolve(null)
      ])
      setStock(stockData)
      if (monthSaleRows) setMonthSales(monthSaleRows)
      setSaleMessage(result.message)
      setConfirmSale(false)
    } catch (err) {
      setSaleMessage(err instanceof Error ? err.message : 'No se pudo registrar la venta.')
    } finally {
      setSelling(false)
    }
  }

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

      <div className="stats-stock-row">
        <section className="stats-stock-card">
          <div className="stats-stock-main">
            <span className="stats-stock-icon" aria-hidden="true">⚪</span>
            <div className="stats-stock-copy">
              <span className="stats-stock-kicker">Acumulado para venta</span>
              <div className="stats-stock-value-row">
                <span className="stats-stock-value">{stock.current}</span>
                <button
                  type="button"
                  className="btn btn-primary stats-stock-sell-btn"
                  onClick={() => setConfirmSale(true)}
                  disabled={stock.current <= 0}
                >
                  Poner en cero
                </button>
              </div>
              <p className="stats-stock-hint">Desde el último corte · no depende del mes</p>
              {stock.last_sale && (
                <p className="stats-stock-last">
                  Último corte: {formatSaleDate(stock.last_sale.sold_on)} · {stock.last_sale.balls_count} bola{stock.last_sale.balls_count === 1 ? '' : 's'}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="stats-sales-card">
          <div className="stats-sales-header">
            <div>
              <span className="stats-ranking-kicker">Registro de ventas</span>
              <h3>{isMonthView ? `Cortes de ${capitalizeMonth(currentDate)}` : 'Todos los cortes'}</h3>
            </div>
            {isMonthView && (
              <span className="stats-ranking-badge">
                {monthSoldTotal} vendida{monthSoldTotal === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {historySales.length === 0 ? (
            <p className="stats-sales-empty">
              {isMonthView ? 'En este mes todavía no hay cortes.' : 'Todavía no hay ventas registradas.'}
            </p>
          ) : (
            <ul className="stats-sales-list">
              {historySales.map(sale => (
                <li key={sale.id} className="stats-sales-row">
                  <span className="stats-sales-date">{formatSaleDate(sale.sold_on)}</span>
                  <span className="stats-sales-count">{sale.balls_count} bola{sale.balls_count === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {saleMessage && (
        <div className={`alert ${saleMessage.startsWith('Se registró') ? 'alert-success' : 'alert-warning'}`}>
          {saleMessage}
        </div>
      )}

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

      {confirmSale && (
        <div
          className="meal-modal-overlay"
          onClick={() => !selling && setConfirmSale(false)}
        >
          <div
            className="meal-modal schedule-holiday-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stretch-sale-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="meal-modal-header">
              <div>
                <span className="meal-modal-label">Venta de Stretch</span>
                <h3 id="stretch-sale-modal-title">Poner el acumulado en cero</h3>
                <p>
                  Se registra una venta de <strong>{stock.current}</strong> bola{stock.current === 1 ? '' : 's'}
                  y el contador vuelve a 0. Queda guardado en {capitalizeMonth(new Date())}.
                </p>
              </div>
              <button
                type="button"
                className="meal-modal-close"
                onClick={() => !selling && setConfirmSale(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="schedule-holiday-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSellStock}
                disabled={selling}
              >
                {selling ? 'Guardando...' : 'Sí, registrar venta'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmSale(false)}
                disabled={selling}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
