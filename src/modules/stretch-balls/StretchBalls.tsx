import { useState } from 'react'
import { useAppRefresh } from '../../hooks/useAppRefresh'
import SchedulePanel from './SchedulePanel'
import StatsPanel from './StatsPanel'
import SettingsPanel from './SettingsPanel'
import appIcon from '../../assets/app-icon.png'

type Tab = 'schedule' | 'stats' | 'settings'

export default function StretchBalls() {
  const [tab, setTab] = useState<Tab>('schedule')
  const { refreshKey, refresh } = useAppRefresh()

  return (
    <div>
      <header className="stretch-page-header">
        <img className="stretch-page-header-badge" src={appIcon} alt="" />
        <div className="stretch-page-header-copy">
          <span className="stretch-page-header-kicker">Gestión de turnos</span>
          <h2 className="stretch-page-header-title">Stretch</h2>
          <p className="stretch-page-header-subtitle">
            Asignación de turnos, rotación entre depósitos y confirmación de trabajo realizado
          </p>
        </div>
      </header>

      <div className="stretch-tabs" role="tablist" aria-label="Secciones de Stretch">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'schedule'}
          className={`stretch-tab ${tab === 'schedule' ? 'stretch-tab-active' : ''}`}
          onClick={() => setTab('schedule')}
        >
          <span className="stretch-tab-icon" aria-hidden="true">📅</span>
          Turnos del mes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'stats'}
          className={`stretch-tab ${tab === 'stats' ? 'stretch-tab-active' : ''}`}
          onClick={() => setTab('stats')}
        >
          <span className="stretch-tab-icon" aria-hidden="true">📊</span>
          Estadísticas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'settings'}
          className={`stretch-tab ${tab === 'settings' ? 'stretch-tab-active' : ''}`}
          onClick={() => setTab('settings')}
        >
          <span className="stretch-tab-icon" aria-hidden="true">⚙</span>
          Configuración
        </button>
      </div>

      {tab === 'schedule' && <SchedulePanel refreshKey={refreshKey} onUpdate={refresh} />}
      {tab === 'stats' && <StatsPanel refreshKey={refreshKey} />}
      {tab === 'settings' && <SettingsPanel onUpdate={refresh} />}
    </div>
  )
}
