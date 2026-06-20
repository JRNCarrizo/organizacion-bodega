import { useAppRefresh } from '../../hooks/useAppRefresh'
import EmployeesPanel from './EmployeesPanel'

export default function EmployeesPage() {
  const { refreshKey, refresh } = useAppRefresh()

  return (
    <div>
      <header className="employees-page-header">
        <div className="employees-page-badge" aria-hidden="true">👥</div>
        <div className="employees-page-copy">
          <span className="employees-page-kicker">Equipo</span>
          <h2>Empleados</h2>
          <p>Registro general y participación en Stretch y Menú de Comidas</p>
        </div>
      </header>

      <EmployeesPanel onUpdate={refresh} refreshKey={refreshKey} />
    </div>
  )
}
