import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import appIcon from '../assets/app-icon.png'

const STORAGE_KEY = 'sidebar-collapsed'

const MODULE_LINKS = [
  { to: '/empleados', end: false, icon: '👥', label: 'Empleados' },
  { to: '/', end: true, icon: '♻️', label: 'Stretch' },
  { to: '/comidas', end: false, icon: '🍽️', label: 'Menú de Comidas' },
  { to: '/pedidos', end: false, icon: '🛒', label: 'Pedidos' }
] as const

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-main">
          <img className="sidebar-brand-badge" src={appIcon} alt="" />
          {!collapsed && (
            <div className="sidebar-brand-copy">
              <h1>Organización Bodega</h1>
              <p>Gestión de actividades</p>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setCollapsed(current => !current)}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Navegación principal">
        <div className="sidebar-nav-section">
          {!collapsed && <span className="sidebar-nav-label">Módulos</span>}
          <div className="sidebar-nav-modules">
            {MODULE_LINKS.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                title={link.label}
              >
                <span className="nav-icon-wrap">
                  <span className="nav-icon" aria-hidden="true">{link.icon}</span>
                </span>
                <span className="nav-label">{link.label}</span>
              </NavLink>
            ))}
          </div>
        </div>

        <div className="sidebar-nav-section sidebar-nav-global">
          {!collapsed && <span className="sidebar-nav-label">General</span>}
          <NavLink
            to="/configuracion"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            title="Configuración"
          >
            <span className="nav-icon-wrap">
              <span className="nav-icon" aria-hidden="true">⚙️</span>
            </span>
            <span className="nav-label">Configuración</span>
          </NavLink>
        </div>
      </nav>
    </aside>
  )
}
