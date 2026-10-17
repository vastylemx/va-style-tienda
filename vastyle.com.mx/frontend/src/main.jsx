import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './seasonal.css'
import { getChristmasDecorations } from './seasonalConfig.js'
import App from './App.jsx'

document.documentElement.classList.toggle('ve-snowflake-cursor', getChristmasDecorations().snowflakeCursor)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
