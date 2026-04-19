import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

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
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
