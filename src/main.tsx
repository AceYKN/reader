import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/reset.css'
import './styles/tokens.css'
import './styles/global.css'
import { registerSW } from 'virtual:pwa-register'

const updateIntervalMs = 15 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(_serviceWorkerUrl, registration) {
    if (!registration) return

    const checkForUpdate = () => {
      if (navigator.onLine && !registration.installing) {
        void registration.update()
      }
    }

    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })
    window.setInterval(checkForUpdate, updateIntervalMs)
  },
})

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
