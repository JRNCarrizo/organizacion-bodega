import { useEffect, useRef, useState } from 'react'
import type { DepotSettings } from '../../types'
import { getDepotName, getDepotWorkloadLabel } from '../../utils/depot'

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
  const [showDepotHelp, setShowDepotHelp] = useState(false)
  const [showResetHelp, setShowResetHelp] = useState(false)
  const depotHelpRef = useRef<HTMLDivElement>(null)
  const resetHelpRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.settings.getDepotSettings().then(setSettings)
  }, [])

  useEffect(() => {
    if (!showDepotHelp && !showResetHelp) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDepotHelp(false)
        setShowResetHelp(false)
      }
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (showDepotHelp && depotHelpRef.current && !depotHelpRef.current.contains(target)) {
        setShowDepotHelp(false)
      }
      if (showResetHelp && resetHelpRef.current && !resetHelpRef.current.contains(target)) {
        setShowResetHelp(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [showDepotHelp, showResetHelp])

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
      <div className={`stretch-settings-depot-card ${isHeavy ? 'stretch-settings-depot-card-heavy' : 'stretch-settings-depot-card-light'}`}>
        <div className="stretch-settings-depot-card-top">
          <span className={`depot-badge ${isHeavy ? 'depot-heavy' : 'depot-light'}`}>
            {isHeavy ? 'Más pesado' : 'Más liviano'}
          </span>
        </div>

        <label className="stretch-settings-field-label" htmlFor={`depot-name-${depot}`}>
          Nombre del depósito
        </label>
        <input
          id={`depot-name-${depot}`}
          className="input stretch-settings-input"
          defaultValue={settings[nameKey]}
          key={`${depot}-${settings[nameKey]}`}
          placeholder={`Depósito ${depot}`}
          onBlur={e => handleNameBlur(depot, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />

        <p className="stretch-settings-depot-preview">
          Se verá como: <strong>{name}</strong> · {getDepotWorkloadLabel(depot, settings)}
        </p>

        <button
          type="button"
          className={`stretch-settings-depot-btn ${isHeavy ? 'stretch-settings-depot-btn-active' : ''}`}
          disabled={isHeavy}
          onClick={() => handleHeavyChange(depot)}
        >
          {isHeavy ? '✓ Es el más pesado' : 'Marcar como más pesado'}
        </button>
      </div>
    )
  }

  return (
    <div className="stretch-settings-panel">
      <section className="stretch-settings-card">
        <header className="stretch-settings-card-header">
          <div className="stretch-settings-card-heading">
            <span className="stretch-settings-card-icon" aria-hidden="true">🏭</span>
            <div>
              <span className="stretch-settings-kicker">Stretch</span>
              <h3>Depósitos</h3>
            </div>
          </div>

          <div className="stretch-settings-header-actions">
            {saved && <span className="stretch-settings-saved-badge">Guardado</span>}
            <div className="schedule-help-wrap" ref={depotHelpRef}>
              <button
                type="button"
                className={`schedule-help-btn ${showDepotHelp ? 'schedule-help-btn-open' : ''}`}
                onClick={() => {
                  setShowResetHelp(false)
                  setShowDepotHelp(open => !open)
                }}
                aria-expanded={showDepotHelp}
                aria-label="Ayuda sobre depósitos"
                title="Información sobre depósitos"
              >
                !
              </button>
              {showDepotHelp && (
                <div className="schedule-help-bubble stretch-settings-help-bubble" role="dialog" aria-label="Ayuda depósitos">
                  <p className="schedule-help-bubble-title">Depósitos y rotación</p>
                  <ul className="schedule-help-bubble-list">
                    <li>Personalizá los nombres de cada depósito.</li>
                    <li>Definí cuál es el <strong>más pesado</strong> para equilibrar el trabajo físico.</li>
                    <li>El sistema rota automáticamente a los empleados entre depósitos.</li>
                    <li>Los nombres se usan en turnos, estadísticas y PDF.</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="stretch-settings-depot-grid">
          {renderDepotCard(1)}
          {renderDepotCard(2)}
        </div>

        <div className="stretch-settings-preview-row">
          <span className="depot-badge depot-heavy">{getDepotName(settings.heavyDepot, settings)}</span>
          <span className="stretch-settings-preview-arrow">↔</span>
          <span className="depot-badge depot-light">{getDepotName(lightDepot, settings)}</span>
          <span className="stretch-settings-preview-note">Rotación automática entre ambos</span>
        </div>
      </section>

      <section className="stretch-settings-card stretch-settings-card-danger">
        <header className="stretch-settings-card-header">
          <div className="stretch-settings-card-heading">
            <span className="stretch-settings-card-icon stretch-settings-card-icon-danger" aria-hidden="true">⚠</span>
            <div>
              <span className="stretch-settings-kicker stretch-settings-kicker-danger">Zona crítica</span>
              <h3>Reiniciar turnos</h3>
            </div>
          </div>

          <div className="stretch-settings-header-actions">
            <div className="schedule-help-wrap" ref={resetHelpRef}>
              <button
                type="button"
                className={`schedule-help-btn stretch-settings-help-btn-danger ${showResetHelp ? 'schedule-help-btn-open' : ''}`}
                onClick={() => {
                  setShowDepotHelp(false)
                  setShowResetHelp(open => !open)
                }}
                aria-expanded={showResetHelp}
                aria-label="Ayuda sobre reinicio de turnos"
                title="Información sobre reinicio"
              >
                !
              </button>
              {showResetHelp && (
                <div className="schedule-help-bubble stretch-settings-help-bubble stretch-settings-help-bubble-danger" role="dialog" aria-label="Ayuda reinicio">
                  <p className="schedule-help-bubble-title">Reiniciar turnos</p>
                  <ul className="schedule-help-bubble-list">
                    <li>Borra <strong>todos los turnos</strong> asignados y confirmaciones de todos los meses.</li>
                    <li>Los <strong>empleados</strong> cargados se mantienen.</li>
                    <li>La configuración de depósitos también se mantiene.</li>
                    <li>Esta acción no se puede deshacer.</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="stretch-settings-danger-body">
          <p className="stretch-settings-danger-lead">
            Eliminá todas las asignaciones y confirmaciones para empezar de cero.
          </p>

          <button
            type="button"
            className="stretch-settings-reset-btn"
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
      </section>
    </div>
  )
}
