/**
 * Entry point React.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App';
import { initSentry } from './libs/sentry';
import { ThemeColorProvider } from './hooks/useThemeColor';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/tiptap/styles.css';
import 'driver.js/dist/driver.css';
import './styles/headings.css';

// No-op se VITE_SENTRY_ENABLED non è "true" (ADR-15).
initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <ThemeColorProvider>
      <>
      {/*
        `zIndex={1100}`: stesso valore/stesso motivo di ogni altro `zIndex` esplicito
        introdotto per la chrome full-screen dell'editor (`FullScreenEditorLayout.tsx`,
        `position: fixed; z-index: 1000`, ADR-32) — `PagePageDetail.tsx` (tendina di
        stato, `Tabs.List`), `EditorBlockWrapper.tsx`/`BlockEditorPanel.tsx`
        (`ConfirmModal`). Senza questo, l'INTERO sistema di notifiche (globale,
        montato una sola volta qui) resterebbe dietro l'overlay ogni volta che la
        scheda "Contenuto" è attiva: non solo invisibile, i suoi bottoni di azione
        (es. "Ricarica la Pagina" del conflitto di editing) non sarebbero mai
        cliccabili — verificato in E2E (`page-editor-conflitto.spec.ts`).
      */}
      <Notifications position="top-right" zIndex={1100} />
      <BrowserRouter>
        <App />
      </BrowserRouter>
      </>
    </ThemeColorProvider>
  </React.StrictMode>,
);
