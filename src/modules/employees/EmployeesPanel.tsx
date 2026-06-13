import { useEffect, useState } from 'react'
import type { Employee } from '../../types'

interface Props {
  onUpdate: () => void
  refreshKey: number
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

function isInStretch(emp: Employee): boolean {
  return emp.in_stretch !== 0
}

function isInMeals(emp: Employee): boolean {
  return emp.in_meals !== 0
}

function moduleTooltip(emp: Employee, included: boolean, moduleName: string): string {
  if (!emp.active) return 'Activá al empleado primero'
  return included
    ? `Quitar de ${moduleName}`
    : `Incluir en ${moduleName}`
}

export default function EmployeesPanel({ onUpdate, refreshKey }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const load = async () => {
    const data = await window.api.employees.getAll()
    setEmployees(data)
  }

  useEffect(() => { load() }, [refreshKey])

  const saveEmployee = async (
    emp: Employee,
    updates: { name?: string; active?: boolean; inStretch?: boolean; inMeals?: boolean }
  ) => {
    await window.api.employees.update(
      emp.id,
      updates.name ?? emp.name,
      updates.active ?? !!emp.active,
      updates.inStretch ?? isInStretch(emp),
      updates.inMeals ?? isInMeals(emp)
    )
    await load()
    onUpdate()
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    await window.api.employees.add(newName)
    setNewName('')
    await load()
    onUpdate()
  }

  const handleToggleActive = async (emp: Employee) => {
    await saveEmployee(emp, { active: !emp.active })
  }

  const handleToggleStretch = async (emp: Employee) => {
    await saveEmployee(emp, { inStretch: !isInStretch(emp) })
  }

  const handleToggleMeals = async (emp: Employee) => {
    await saveEmployee(emp, { inMeals: !isInMeals(emp) })
  }

  const handleSaveEdit = async (id: number) => {
    const emp = employees.find(e => e.id === id)
    if (!emp || !editName.trim()) return
    await saveEmployee(emp, { name: editName })
    setEditingId(null)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este empleado? Se borrarán sus registros.')) return
    await window.api.employees.delete(id)
    await load()
    onUpdate()
  }

  const activeCount = employees.filter(e => e.active).length
  const stretchCount = employees.filter(e => e.active && isInStretch(e)).length
  const mealsCount = employees.filter(e => e.active && isInMeals(e)).length
  const inactiveCount = employees.length - activeCount

  return (
    <div className="employees-panel">
      <div className="employees-summary">
        <div className="employees-stat">
          <span className="employees-stat-value">{employees.length}</span>
          <span className="employees-stat-label">Total</span>
        </div>
        <div className="employees-stat employees-stat-active">
          <span className="employees-stat-value">{activeCount}</span>
          <span className="employees-stat-label">Activos</span>
        </div>
        <div className="employees-stat">
          <span className="employees-stat-value">{stretchCount}</span>
          <span className="employees-stat-label">En Stretch</span>
        </div>
        <div className="employees-stat">
          <span className="employees-stat-value">{mealsCount}</span>
          <span className="employees-stat-label">En Menú</span>
        </div>
        <div className="employees-stat">
          <span className="employees-stat-value">{inactiveCount}</span>
          <span className="employees-stat-label">Inactivos</span>
        </div>
      </div>

      <div className="employees-add-card">
        <div className="employees-add-header">
          <span className="employees-add-icon">+</span>
          <div>
            <h3>Agregar empleado</h3>
            <p>Nuevas personas entran activas en Stretch y Menú. Podés cambiarlo después.</p>
          </div>
        </div>
        <div className="employees-add-form">
          <input
            type="text"
            className="input employees-input"
            placeholder="Nombre y apellido"
            value={newName}
            autoComplete="off"
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
          />
          <button className="btn btn-primary" onClick={handleAdd} disabled={!newName.trim()}>
            Agregar
          </button>
        </div>
        {stretchCount < 2 && (
          <div className="alert alert-warning employees-alert">
            Para turnos de stretch necesitás al menos 2 empleados activos en esa sección.
          </div>
        )}
      </div>

      <div className="employees-list-section">
        <div className="employees-list-header">
          <h3>Equipo</h3>
          <span className="employees-count-badge">{activeCount} activos</span>
        </div>

        {employees.length === 0 ? (
          <div className="employees-empty">
            <span className="employees-empty-icon">👥</span>
            <p>No hay empleados cargados</p>
            <span>Agregá personas y elegí en qué secciones participan</span>
          </div>
        ) : (
          <div className="employee-grid">
            {employees.map(emp => (
              <div
                key={emp.id}
                className={`employee-card ${!emp.active ? 'employee-card-inactive' : ''}`}
              >
                {editingId === emp.id ? (
                  <div className="employee-edit-form">
                    <input
                      className="input employees-input"
                      value={editName}
                      autoFocus
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEdit(emp.id)}
                    />
                    <div className="employee-edit-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(emp.id)}>
                        Guardar
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="employee-card-top">
                      <div className={`employee-avatar ${emp.active ? '' : 'employee-avatar-inactive'}`}>
                        {getInitials(emp.name)}
                      </div>
                      <div className="employee-card-info">
                        <span className="employee-card-name">{emp.name}</span>
                        <span className={`employee-status ${emp.active ? 'employee-status-active' : 'employee-status-inactive'}`}>
                          {emp.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>

                    <div className="employee-modules">
                      <span className="employee-modules-label">Participa en</span>
                      <div className="employee-modules-list">
                        <button
                          type="button"
                          className={`employee-module-chip ${isInStretch(emp) ? 'employee-module-chip-on' : 'employee-module-chip-off'}`}
                          onClick={() => handleToggleStretch(emp)}
                          disabled={!emp.active}
                          aria-pressed={isInStretch(emp)}
                          title={moduleTooltip(emp, isInStretch(emp), 'Stretch')}
                        >
                          <span className={`employee-module-indicator ${isInStretch(emp) ? 'employee-module-indicator-on' : 'employee-module-indicator-off'}`}>
                            {isInStretch(emp) ? '✓' : '✕'}
                          </span>
                          <span className="employee-module-icon">♻️</span>
                          <span className="employee-module-name">Stretch</span>
                        </button>
                        <button
                          type="button"
                          className={`employee-module-chip ${isInMeals(emp) ? 'employee-module-chip-on' : 'employee-module-chip-off'}`}
                          onClick={() => handleToggleMeals(emp)}
                          disabled={!emp.active}
                          aria-pressed={isInMeals(emp)}
                          title={moduleTooltip(emp, isInMeals(emp), 'Menú de Comidas')}
                        >
                          <span className={`employee-module-indicator ${isInMeals(emp) ? 'employee-module-indicator-on' : 'employee-module-indicator-off'}`}>
                            {isInMeals(emp) ? '✓' : '✕'}
                          </span>
                          <span className="employee-module-icon">🍽️</span>
                          <span className="employee-module-name">Menú</span>
                        </button>
                      </div>
                    </div>

                    <div className="employee-card-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setEditingId(emp.id); setEditName(emp.name) }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleToggleActive(emp)}
                      >
                        {emp.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(emp.id)}>
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
