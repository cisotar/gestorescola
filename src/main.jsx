import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  Promise.all([
    import('./lib/firebase/index.js'),
    import('firebase/auth'),
  ]).then(([{ auth }, { signInWithCustomToken, signOut }]) => {
    window.__e2eFirebase = { auth, signInWithCustomToken, signOut }
  })
}

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,       // 'production' | 'development' | 'staging'
  tracesSampleRate: 0.1,                   // 10% de traces — mantém dentro da cota gratuita (RN-M2)
  enabled: import.meta.env.PROD,           // false em dev/test — sem eventos para Sentry (RN-M1)
  beforeSend(event) {
    // Allowlist: manter apenas uid — descartar email, username, ip_address (LGPD RN-M3)
    if (event.user) {
      event.user = { id: event.user.id }
    }
    return event
  },
})

// PWA Handler: Register Service Worker
function PWAHandler() {
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    navigator.serviceWorker
      .register('/sw.js')
      .then(registration => {
        if (import.meta.env.DEV) {
          console.log('Service Worker registrado com sucesso:', registration)
        }
      })
      .catch(error => {
        console.error('Erro ao registrar Service Worker:', error)
        // App continua funcionando sem SW
      })
  }
}

// Listen for beforeinstallprompt event (future UX improvements)
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault()
  // Store the event for potential custom UI later
  window.deferredPrompt = e
})

// Initialize PWA
PWAHandler()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
