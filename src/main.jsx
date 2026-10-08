import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/system/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary variant="page">
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// Service worker: production builds only (it would fight Vite's HMR in dev).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`
      );
      // Hand the worker every asset this page loaded (hashed JS/CSS) so the
      // app shell works offline right after the first visit.
      const ready = await navigator.serviceWorker.ready;
      const urls = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .concat(window.location.href);
      (ready.active || registration.active)?.postMessage({ type: 'CACHE_URLS', urls });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  });
}
