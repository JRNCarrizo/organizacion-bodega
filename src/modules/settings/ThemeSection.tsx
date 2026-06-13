import { useAppTheme } from '../../hooks/useAppTheme'

export default function ThemeSection() {
  const { theme, setTheme } = useAppTheme()

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <span className="settings-section-icon">🎨</span>
        <div>
          <h3>Apariencia</h3>
          <p>Elegí cómo se ve la aplicación en tu pantalla</p>
        </div>
      </div>

      <div className="theme-toggle" role="group" aria-label="Tema de la aplicación">
        <button
          type="button"
          className={`theme-toggle-btn ${theme === 'dark' ? 'theme-toggle-btn-active' : ''}`}
          onClick={() => setTheme('dark')}
        >
          🌙 Oscuro
        </button>
        <button
          type="button"
          className={`theme-toggle-btn ${theme === 'light' ? 'theme-toggle-btn-active' : ''}`}
          onClick={() => setTheme('light')}
        >
          ☀️ Claro
        </button>
      </div>

      <div className="settings-info-box">
        El tema se guarda en esta computadora y se aplica en todas las secciones de la app.
      </div>
    </div>
  )
}
