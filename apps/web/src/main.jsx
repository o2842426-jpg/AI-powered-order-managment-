import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DOCUMENT_TITLE } from './lib/brand'
import './styles/tokens.css'
import './index.css'
import App from './App.jsx'

document.title = DOCUMENT_TITLE

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
