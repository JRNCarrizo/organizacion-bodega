import { useEffect, useState } from 'react'

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
    <div className="settings-section">
      <div className="settings-section-header">
        <span className="settings-section-icon">⬆️</span>
        <div>
          <h3>Actualizaciones</h3>
          <p>Descargá e instalá la última versión desde GitHub Releases</p>
        </div>
      </div>

      <div className="settings-info-box">
        Versión instalada: <strong>v{version || '…'}</strong>.
        La app busca actualizaciones al iniciar. También podés comprobar manualmente acá.
      </div>

      <div className="update-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleCheck}
          disabled={busy || phase === 'downloading'}
        >
          {phase === 'checking' ? 'Buscando...' : 'Buscar actualizaciones'}
        </button>

        {phase === 'available' && (
          <button type="button" className="btn btn-primary" onClick={handleDownload} disabled={busy}>
            Descargar v{newVersion}
          </button>
        )}

        {phase === 'downloaded' && (
          <button type="button" className="btn btn-primary" onClick={handleInstall}>
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
  )
}
