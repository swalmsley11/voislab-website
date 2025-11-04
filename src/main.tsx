import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import { registerSW } from './utils/serviceWorker';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>
);

// Register service worker for offline capability and caching
registerSW({
  onSuccess: () => {
    console.log('VoisLab: App is ready for offline use');
  },
  onUpdate: () => {
    console.log('VoisLab: New content available, please refresh');
  },
  onOfflineReady: () => {
    console.log('VoisLab: App is ready to work offline');
  }
});
