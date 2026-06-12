import { useEffect, useState } from 'react'
import type { DepotSettings } from '../../types'
import { getDepotName, getDepotWorkloadLabel } from '../../utils/depot'
import UpdateSection from './UpdateSection'

interface Props {
  onUpdate: () => void
}

export default function SettingsPanel({ onUpdate }: Props) {
  const [settings, setSettings] = useState<DepotSettings>({
    heavyDepot: 1,
    depot1Name: 'Depósito 1',
    depot2Name: 'Depósito 2'
  })
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.getDepotSettings().then(setSettings)
  }, [])

  const saveSettings = async (patch: Partial<DepotSettings>) => {
    const updated = await window.api.settings.setDepotSettings(patch)
    setSettings(updated)
    setSaved(true)
    onUpdate()
    setTimeout(() => setSaved(false), 2000)
  }

  const handleHeavyChange = (depot: number) => {
    saveSettings({ heavyDepot: depot })
  }

  const handleNameBlur = (depot: 1 | 2, value: string) => {
    const key = depot === 1 ? 'depot1Name' : 'depot2Name'
    const current = depot === 1 ? settings.depot1Name : settings.depot2Name
    if (value.trim() === current.trim()) return
    saveSettings({ [key]: value.trim() || `Depósito ${depot}` })
  }

  const handleReset = async () => {
    const confirmed = confirm(
      '¿Borrar todos los turnos?\n\nSe eliminarán las asignaciones y confirmaciones del mes.\nLos empleados NO se borran.'
    )
    if (!confirmed) return

    setResetting(true)
    setMessage('')
    try {
      await window.api.settings.resetSchedule()
      setMessage('Turnos eliminados. Los empleados se mantuvieron. Podés generar turnos nuevos.')
      onUpdate()
    } catch {
      setMessage('Error al reiniciar los turnos.')
    } finally {
      setResetting(false)
    }
  }

  const lightDepot = settings.heavyDepot === 1 ? 2 : 1

  const renderDepotCard = (depot: 1 | 2) => {
    const isHeavy = settings.heavyDepot === depot
    const name = getDepotName(depot, settings)
    const nameKey = depot === 1 ? 'depot1Name' : 'depot2Name'

    return (
      <div className={`settings-depot-card ${isHeavy ? 'settings-depot-card-heavy' : 'settings-depot-card-light'}`}>
        <div className="settings-depot-card-top">
          <span className={`depot-badge ${isHeavy ? 'depot-heavy' : 'depot-light'}`}>
            {isHeavy ? 'Más pesado' : 'Más liviano'}
          </span>
        </div>

        <label className="settings-depot-label" htmlFor={`depot-name-${depot}`}>
          Nombre del depósito
        </label>
        <input
          id={`depot-name-${depot}`}
          className="input settings-depot-input"
          defaultValue={settings[nameKey]}
          key={`${depot}-${settings[nameKey]}`}
          placeholder={`Depósito ${depot}`}
          onBlur={e => handleNameBlur(depot, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />

        <p className="settings-depot-preview">
          Se verá como: <strong>{name}</strong> · {getDepotWorkloadLabel(depot, settings)}
        </p>

        <button
          type="button"
          className={`btn btn-sm ${isHeavy ? 'btn-secondary' : 'btn-primary'}`}
          disabled={isHeavy}
          onClick={() => handleHeavyChange(depot)}
        >
          {isHeavy ? 'Es el más pesado' : 'Marcar como más pesado'}
        </button>
      </div>
    )
  }

  return (
    <div className="settings-panel">
      <UpdateSection />

      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-icon">🏭</span>
          <div>
            <h3>Depósitos</h3>
            <p>Personalizá los nombres y definí cuál requiere más trabajo físico</p>
          </div>
          {saved && <span className="settings-saved-badge">Guardado</span>}
        </div>

        <div className="settings-info-box">
          El sistema rota automáticamente a los empleados entre depósitos para equilibrar el trabajo pesado.
          Los nombres que elijas aparecen en turnos, estadísticas y PDF.
        </div>

        <div className="settings-depot-grid">
          {renderDepotCard(1)}
          {renderDepotCard(2)}
        </div>

        <div className="settings-preview-row">
          <span className="depot-badge depot-heavy">{getDepotName(settings.heavyDepot, settings)}</span>
          <span className="settings-preview-arrow">↔</span>
          <span className="depot-badge depot-light">{getDepotName(lightDepot, settings)}</span>
        </div>
      </div>

      <div className="settings-section settings-section-danger">
        <div className="settings-section-header">
          <span className="settings-section-icon settings-section-icon-danger">⚠</span>
          <div>
            <h3>Reiniciar turnos</h3>
            <p>Acción irreversible sobre asignaciones y confirmaciones</p>
          </div>
        </div>

        <div className="settings-danger-box">
          <p>Borra todos los turnos asignados y confirmaciones de todos los meses.</p>
          <p>Los empleados cargados y la configuración de depósitos se mantienen.</p>
        </div>

        <button
          className="btn btn-danger"
          onClick={handleReset}
          disabled={resetting}
        >
          {resetting ? 'Borrando...' : 'Borrar todos los turnos'}
        </button>

        {message && (
          <div className={`alert ${message.includes('Error') ? 'alert-warning' : 'alert-success'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
