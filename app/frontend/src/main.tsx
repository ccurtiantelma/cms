/**
 * Entry point React.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App';
import { ThemeColorProvider } from './hooks/useThemeColor';
import { initSentry } from './libs/sentry';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import 'driver.js/dist/driver.css';
import './styles/headings.css';

// No-op se VITE_SENTRY_ENABLED non è "true" (ADR-15).
initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <ThemeColorProvider>
      <Notifications position="top-right" />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeColorProvider>
  </React.StrictMode>,
);
