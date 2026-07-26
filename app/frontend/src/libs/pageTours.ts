/**
 * Tour contestuali per-pagina (driver.js), distinti dal tour generale di onboarding
 * (`tourSteps.ts`, avviato automaticamente al primo accesso).
 *
 * Ogni voce del registro è associata al pathname esatto della pagina; la voce
 * "Guida" della sidebar (`LayoutProtected`) è visibile solo se la pagina corrente
 * ha un tour registrato qui — vedi `getPageTourSteps`.
 *
 * Alcuni step pilotano azioni reali sulla pagina (apertura/chiusura del drawer di
 * creazione) tramite `popover.onNextClick`: simulano un click sull'elemento già
 * presente nel DOM (stesso `onClick` usato dall'utente) e poi avanzano il tour con
 * `driver.moveNext()` dopo l'attesa della transizione del Drawer Mantine.
 */
import type { DriveStep } from 'driver.js';

/** Durata approssimativa della transizione di apertura/chiusura del Drawer Mantine (ms). */
const DRAWER_TRANSITION_MS = 350;

/** Tour contestuale della pagina Utenti (esempio CRUD): ricerca, creazione, elenco, colonne, azioni di riga. */
const USERS_TOUR: DriveStep[] = [
  {
    element: '[data-tour="list-search"]',
    popover: {
      title: 'Ricerca',
      description: 'Cerca un utente per nome, cognome o email: la lista si aggiorna mentre digiti.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="list-pagination"]',
    popover: {
      title: 'Paginazione',
      description:
        'Naviga tra le pagine dei risultati; il numero di righe per pagina è impostabile dal menu a destra.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="btn-nuovo"]',
    popover: {
      title: 'Crea un nuovo utente',
      description: 'Apre il form di creazione. Premi "Avanti" per vederlo in azione.',
      side: 'bottom',
      onNextClick: (element, _step, { driver }) => {
        (element as HTMLElement | undefined)?.click();
        setTimeout(() => driver.moveNext(), DRAWER_TRANSITION_MS);
      },
    },
  },
  {
    element: '[data-tour="user-form"]',
    // Non esiste a inizio tour: il drawer viene aperto dallo step precedente.
    // Senza questo flag il filtro di AppTour scarterebbe lo step (e quello
    // successivo, che lo richiude) lasciando il drawer aperto per il resto del tour.
    data: { dynamic: true },
    popover: {
      title: 'Dati anagrafici',
      description:
        "Nome ed email sono obbligatori. Il ruolo determina i permessi dell'utente nell'applicazione.",
      side: 'left',
    },
  },
  {
    element: '[data-tour="user-form-actions"]',
    // Stesso motivo dello step precedente: esiste solo a drawer aperto.
    data: { dynamic: true },
    popover: {
      title: 'Salva o annulla',
      description:
        '"Salva" si attiva solo quando il form è valido e crea l\'utente. "Annulla" chiude il form senza salvare nulla — lo usiamo ora per tornare all\'elenco.',
      side: 'top',
      onNextClick: (element, _step, { driver }) => {
        const cancelButton = (element as HTMLElement | undefined)?.querySelector<HTMLElement>(
          '[data-tour="user-form-cancel"]',
        );
        cancelButton?.click();
        setTimeout(() => driver.moveNext(), DRAWER_TRANSITION_MS);
      },
    },
  },
  {
    element: '[data-tour="data-table"]',
    popover: {
      title: 'Elenco utenti',
      description:
        "Nome, email, ruolo e stato di ciascun utente. Le colonne ordinabili si riconoscono cliccando sull'intestazione.",
      side: 'top',
    },
  },
  {
    element: '[data-tour="column-selector"]',
    popover: {
      title: 'Colonne visibili',
      description:
        "Mostra o nascondi le colonne dell'elenco; la scelta viene ricordata per le prossime visite.",
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="row-actions"]',
    popover: {
      title: 'Modifica o disattiva',
      description:
        "Per ogni utente puoi modificarne i dati o disattivarlo. La disattivazione è una soft delete (l'utente non viene eliminato fisicamente).",
      side: 'left',
    },
  },
];

/** Registro dei tour contestuali per-pagina, indicizzato per pathname esatto. */
const PAGE_TOURS: Record<string, DriveStep[]> = {
  '/users': USERS_TOUR,
};

/** Restituisce gli step del tour contestuale della pagina corrente, se definito. */
export function getPageTourSteps(pathname: string): DriveStep[] | undefined {
  return PAGE_TOURS[pathname];
}
