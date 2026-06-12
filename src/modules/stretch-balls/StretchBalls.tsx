import { useState } from 'react'
import { useAppRefresh } from '../../hooks/useAppRefresh'
import SchedulePanel from './SchedulePanel'
import StatsPanel from './StatsPanel'
import SettingsPanel from './SettingsPanel'

type Tab = 'schedule' | 'stats' | 'settings'

export default function StretchBalls() {
  const [tab, setTab] = useState<Tab>('schedule')
  const { refreshKey, refresh } = useAppRefresh()

  return (
    <div>
      <div className="page-header">
        <h2>Stretch</h2>
        <p>Asignación de turnos, rotación entre depósitos y confirmación de trabajo realizado</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'schedule' ? 'active' : ''}`} onClick={() => setTab('schedule')}>
          Turnos del mes
        </button>
        <button className={`tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
          Estadísticas
        </button>
        <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
          Configuración
        </button>
      </div>

      {tab === 'schedule' && <SchedulePanel refreshKey={refreshKey} onUpdate={refresh} />}
      {tab === 'stats' && <StatsPanel refreshKey={refreshKey} />}
      {tab === 'settings' && <SettingsPanel onUpdate={refresh} />}
    </div>
  )
}
