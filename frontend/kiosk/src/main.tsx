import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * Entry point for EVOLTTOUCH Kiosk.
 * 
 * StrictMode enabled for development safety.
 * Optimized for React 18 concurrent rendering.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
