import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './mobile.css'
import App from './App.jsx'
import AccountPage from './components/AccountPage.jsx'
import InstallPage from './components/InstallPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import MobileAuthPage from './components/MobileAuthPage.jsx'
import ContactPage from './components/ContactPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {window.location.pathname === '/contacto' ? <ContactPage /> : window.location.pathname === '/mobile-auth' ? <MobileAuthPage /> : window.location.pathname === '/instalar' ? <InstallPage /> : window.location.pathname === '/eliminar-cuenta' ? <AccountPage /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.update();
    }).catch(() => {});
  });
}
