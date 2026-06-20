import { useAppTheme } from '../../hooks/useAppTheme'
import SettingsInfoButton from './SettingsInfoButton'

export default function ThemeSection() {
  const { theme, setTheme } = useAppTheme()

  return (
    <section className="app-settings-card">
      <header className="app-settings-card-header">
        <div className="app-settings-card-heading">
          <span className="app-settings-card-icon" aria-hidden="true">🎨</span>
          <div>
            <span className="app-settings-kicker">Interfaz</span>
            <h3>Apariencia</h3>
          </div>
        </div>
        <SettingsInfoButton title="Tema de la app" ariaLabel="Información sobre apariencia">
          <ul className="schedule-help-bubble-list">
            <li>Elegí entre modo oscuro o claro según tu preferencia.</li>
            <li>El tema se guarda en esta computadora.</li>
            <li>Se aplica en todas las secciones de la aplicación.</li>
          </ul>
        </SettingsInfoButton>
      </header>

      <div className="app-theme-toggle" role="group" aria-label="Tema de la aplicación">
        <button
          type="button"
          className={`app-theme-btn ${theme === 'dark' ? 'app-theme-btn-active' : ''}`}
          onClick={() => setTheme('dark')}
        >
          <span className="app-theme-btn-icon" aria-hidden="true">🌙</span>
          Oscuro
        </button>
        <button
          type="button"
          className={`app-theme-btn ${theme === 'light' ? 'app-theme-btn-active' : ''}`}
          onClick={() => setTheme('light')}
        >
          <span className="app-theme-btn-icon" aria-hidden="true">☀️</span>
          Claro
        </button>
      </div>
    </section>
  )
}
