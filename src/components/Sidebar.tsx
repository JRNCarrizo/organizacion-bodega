import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'

const STORAGE_KEY = 'sidebar-collapsed'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <>
            <h1>Organización Bodega</h1>
            <p>Gestión de bodega</p>
          </>
        )}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>
      <nav className="sidebar-nav">
        <NavLink
          to="/empleados"
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          title="Empleados"
        >
          <span className="nav-icon">👥</span>
          <span className="nav-label">Empleados</span>
        </NavLink>
        <NavLink
          to="/"
          end
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          title="Stretch"
        >
          <span className="nav-icon">📦</span>
          <span className="nav-label">Stretch</span>
        </NavLink>
        <NavLink
          to="/comidas"
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          title="Menú de Comidas"
        >
          <span className="nav-icon">🍽️</span>
          <span className="nav-label">Menú de Comidas</span>
        </NavLink>
      </nav>
    </aside>
  )
}
