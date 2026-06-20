import UpdateSection from './UpdateSection'
import ThemeSection from './ThemeSection'
import SettingsInfoButton from './SettingsInfoButton'

export default function SettingsPage() {
  return (
    <div>
      <header className="app-settings-page-header">
        <div className="app-settings-page-badge" aria-hidden="true">⚙</div>
        <div className="app-settings-page-copy">
          <span className="app-settings-page-kicker">Aplicación</span>
          <h2>Configuración general</h2>
          <p>Ajustes de apariencia, actualizaciones y datos locales</p>
        </div>
      </header>

      <div className="app-settings-panel">
        <ThemeSection />
        <UpdateSection />

        <section className="app-settings-card app-settings-card-span">
          <header className="app-settings-card-header">
            <div className="app-settings-card-heading">
              <span className="app-settings-card-icon" aria-hidden="true">💾</span>
              <div>
                <span className="app-settings-kicker">Almacenamiento</span>
                <h3>Datos locales</h3>
              </div>
            </div>
            <SettingsInfoButton title="Datos locales" ariaLabel="Información sobre datos locales">
              <ul className="schedule-help-bubble-list">
                <li>Toda la información se guarda en esta computadora.</li>
                <li>
                  La base de datos está en <strong>%APPDATA%\organizacion-bodega\</strong>.
                </li>
                <li>
                  Si instalás la app en otra PC, los datos no se sincronizan solos: hay que copiar ese archivo manualmente si querés llevarlos.
                </li>
              </ul>
            </SettingsInfoButton>
          </header>

          <div className="app-settings-data-body">
            <div className="app-settings-data-path">
              <span className="app-settings-data-label">Ubicación</span>
              <code className="app-settings-data-code">%APPDATA%\organizacion-bodega\</code>
            </div>
            <p className="app-settings-data-note">
              Empleados, turnos, comidas y configuración viven en un archivo local de SQLite.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
