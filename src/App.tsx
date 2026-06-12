import { HashRouter, Routes, Route } from 'react-router-dom'
import StretchBalls from './modules/stretch-balls/StretchBalls'
import EmployeesPage from './modules/employees/EmployeesPage'
import MealsPage from './modules/meals/MealsPage'
import SettingsPage from './modules/settings/SettingsPage'
import Sidebar from './components/Sidebar'

function App() {
  return (
    <HashRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/empleados" element={<EmployeesPage />} />
            <Route path="/" element={<StretchBalls />} />
            <Route path="/comidas" element={<MealsPage />} />
            <Route path="/configuracion" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

export default App
