import { useAppRefresh } from '../../hooks/useAppRefresh'
import EmployeesPanel from './EmployeesPanel'

export default function EmployeesPage() {
  const { refreshKey, refresh } = useAppRefresh()

  return (
    <div>
      <div className="page-header">
        <h2>Empleados</h2>
        <p>Registro general del equipo. Elegí quién participa en Stretch y quién en el Menú de Comidas.</p>
      </div>

      <EmployeesPanel onUpdate={refresh} refreshKey={refreshKey} />
    </div>
  )
}
