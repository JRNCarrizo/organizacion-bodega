import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyCachedTheme } from './lib/theme'
import './styles/global.css'

applyCachedTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
