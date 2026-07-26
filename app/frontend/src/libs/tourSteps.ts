/**
 * Step del tour guidato generale (driver.js).
 *
 * I target "btn-nuovo" e "notifications-area" sono selettori convenzionali:
 * ogni progetto che eredita lo starter-kit li aggiunge ai propri componenti
 * (pulsante "Nuovo" nelle liste, area notifiche nell'header). driver.js, a
 * differenza di react-joyride, non salta automaticamente gli step con target
 * assente dal DOM: il filtro viene applicato da `AppTour` all'avvio del tour.
 */
import type { DriveStep } from 'driver.js';

/** Step del tour generale, mostrati nell'ordine in cui sono definiti. */
export const tourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-nav"]',
    popover: {
      title: 'Navigazione',
      description:
        "Da qui puoi raggiungere tutte le sezioni dell'applicazione: dashboard, utenti e audit log.",
      side: 'right',
    },
  },
  {
    element: '[data-tour="dashboard-kpi"]',
    popover: {
      title: 'Dashboard',
      description:
        'La dashboard mostra una panoramica delle aree principali, con accesso rapido alle relative pagine.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="btn-nuovo"]',
    popover: {
      title: 'Crea un nuovo elemento',
      description:
        'Nelle pagine elenco, questo pulsante permette di creare un nuovo elemento (es. un utente).',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="notifications-area"]',
    popover: {
      title: 'Notifiche',
      description: "In quest'area trovi le notifiche relative alle tue attività.",
      side: 'bottom',
    },
  },
];
