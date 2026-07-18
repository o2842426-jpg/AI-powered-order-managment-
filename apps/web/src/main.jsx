import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DOCUMENT_TITLE, PRODUCT_NAME } from './lib/brand'
import './styles/tokens.css'
import './index.css'
import App from './App.jsx'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage.jsx'

const path = window.location.pathname.replace(/\/+$/, '')
const isPrivacyRoute = path === '/privacy'

document.title = isPrivacyRoute
  ? `Privacy Policy — ${PRODUCT_NAME}`
  : DOCUMENT_TITLE

createRoot(document.getElementById('root')).render(
  <StrictMode>{isPrivacyRoute ? <PrivacyPolicyPage /> : <App />}</StrictMode>,
)
