import UpdateSection from './UpdateSection'

export default function SettingsPage() {
  return (
    <div>
      <div className="page-header">
        <h2>Configuración</h2>
        <p>Ajustes generales de la aplicación</p>
      </div>

      <div className="settings-panel">
        <UpdateSection />

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-icon">💾</span>
            <div>
              <h3>Datos locales</h3>
              <p>Toda la información se guarda en esta computadora</p>
            </div>
          </div>
          <div className="settings-info-box">
            La base de datos está en <strong>%APPDATA%\organizacion-bodega\</strong>.
            Si instalás la app en otra PC, los datos no se sincronizan solos: hay que copiar ese archivo manualmente si querés llevarlos.
          </div>
        </div>
      </div>
    </div>
  )
}
