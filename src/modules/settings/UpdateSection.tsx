import { useEffect, useState } from 'react'
import SettingsInfoButton from './SettingsInfoButton'

type UpdatePhase = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export default function UpdateSection() {
  const [version, setVersion] = useState('')
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [newVersion, setNewVersion] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.app.getVersion().then(setVersion)
    const unsubscribe = window.api.updater.onStatus(status => {
      switch (status.status) {
        case 'checking':
          setPhase('checking')
          setError('')
          break
        case 'available':
          setPhase('available')
          setNewVersion(status.version)
          setBusy(false)
          break
        case 'not-available':
          setPhase('not-available')
          setBusy(false)
          break
        case 'downloading':
          setPhase('downloading')
          setProgress(status.percent)
          break
        case 'downloaded':
          setPhase('downloaded')
          setNewVersion(status.version)
          setBusy(false)
          break
        case 'error':
          setPhase('error')
          setError(status.message)
          setBusy(false)
          break
      }
    })
    return unsubscribe
  }, [])

  const handleCheck = async () => {
    setBusy(true)
    setError('')
    setPhase('checking')
    const result = await window.api.updater.check()
    if (result.dev) {
      setPhase('idle')
      setError('Las actualizaciones solo funcionan en la app instalada (no en modo desarrollo).')
      setBusy(false)
    }
  }

  const handleDownload = async () => {
    setBusy(true)
    setError('')
    await window.api.updater.download()
  }

  const handleInstall = async () => {
    await window.api.updater.install()
  }

  return (
    <section className="app-settings-card">
      <header className="app-settings-card-header">
        <div className="app-settings-card-heading">
          <span className="app-settings-card-icon" aria-hidden="true">⬆️</span>
          <div>
            <span className="app-settings-kicker">Sistema</span>
            <h3>Actualizaciones</h3>
          </div>
        </div>
        <div className="app-settings-header-actions">
          <span className="app-settings-version-badge">v{version || '…'}</span>
          <SettingsInfoButton title="Actualizaciones" ariaLabel="Información sobre actualizaciones">
            <ul className="schedule-help-bubble-list">
              <li>La app busca actualizaciones al iniciar.</li>
              <li>También podés comprobar manualmente desde acá.</li>
              <li>Las descargas vienen desde GitHub Releases.</li>
              <li>En modo desarrollo (<code>npm run dev</code>) esta función no está disponible.</li>
            </ul>
          </SettingsInfoButton>
        </div>
      </header>

      <div className="app-settings-update-body">
        <div className="app-settings-update-actions">
          <button
            type="button"
            className="app-settings-action-btn app-settings-action-btn-secondary"
            onClick={handleCheck}
            disabled={busy || phase === 'downloading'}
          >
            {phase === 'checking' ? 'Buscando...' : 'Buscar actualizaciones'}
          </button>

          {phase === 'available' && (
            <button
              type="button"
              className="app-settings-action-btn app-settings-action-btn-primary"
              onClick={handleDownload}
              disabled={busy}
            >
              Descargar v{newVersion}
            </button>
          )}

          {phase === 'downloaded' && (
            <button
              type="button"
              className="app-settings-action-btn app-settings-action-btn-primary"
              onClick={handleInstall}
            >
              Instalar v{newVersion} y reiniciar
            </button>
          )}
        </div>

        {phase === 'downloading' && (
          <div className="update-progress">
            <div className="update-progress-bar">
              <div className="update-progress-fill" style={{ width: `${Math.round(progress)}%` }} />
            </div>
            <span className="update-progress-label">Descargando… {Math.round(progress)}%</span>
          </div>
        )}

        {phase === 'not-available' && (
          <div className="alert alert-success">Ya tenés la última versión instalada.</div>
        )}

        {error && <div className="alert alert-warning">{error}</div>}
      </div>
    </section>
  )
}
