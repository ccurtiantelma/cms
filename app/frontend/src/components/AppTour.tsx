/**
 * Tour guidato generale dell'applicazione (driver.js).
 *
 * Parte automaticamente al primo accesso (localStorage non contiene
 * `tour_completed=true`) e può essere riavviato in qualsiasi momento
 * tramite il metodo `restart()` esposto via ref (usato da `LayoutProtected`
 * per la voce "Guida" della sidebar, sia per il tour generale che per i tour
 * contestuali per-pagina di `libs/pageTours.ts`).
 * Non blocca mai l'uso dell'app: è sempre interrompibile chiudendo il popover.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { driver, type Driver, type DriveStep } from 'driver.js';
import classes from './AppTour.module.css';
import { tourSteps } from '../libs/tourSteps';

const TOUR_COMPLETED_KEY = 'tour_completed';

/** Metodi imperativi esposti da AppTour al componente padre. */
export interface AppTourRef {
  /** Avvia il tour indicato (default: tour generale), indipendentemente dallo stato salvato. */
  restart: (steps?: DriveStep[]) => void;
}

/** Wrapper di driver.js per i tour guidati dell'app (generale e per-pagina). */
const AppTour = forwardRef<AppTourRef>(function AppTour(_props, ref): null {
  const driverRef = useRef<Driver | null>(null);

  useImperativeHandle(ref, () => ({
    restart: (steps) => startTour(steps ?? tourSteps, { markCompletedOnDestroy: false }),
  }));

  /**
   * Avvia un tour filtrando gli step i cui target non sono presenti nel DOM corrente.
   * Gli step marcati `data: { dynamic: true }` (es. campi di un drawer che lo step
   * precedente apre via `onNextClick`) NON esistono ancora a inizio tour e vanno
   * sempre mantenuti, altrimenti il filtro li scarterebbe assieme alla logica che
   * richiude il drawer, lasciandolo aperto per il resto del tour.
   * `markCompletedOnDestroy` deve restare `true` solo per l'avvio automatico al primo
   * accesso: un riavvio manuale (tour generale o contestuale) non deve marcare come
   * "visto" l'onboarding generale se l'utente non l'ha mai effettivamente visto.
   */
  const startTour = (
    allSteps: DriveStep[],
    { markCompletedOnDestroy }: { markCompletedOnDestroy: boolean },
  ): void => {
    const steps = allSteps.filter(
      (step) =>
        step.data?.dynamic === true ||
        (typeof step.element === 'string' && document.querySelector(step.element) !== null),
    );
    if (steps.length === 0) {
      return;
    }

    driverRef.current?.destroy();
    driverRef.current = driver({
      steps,
      showProgress: true,
      popoverClass: classes.popover,
      nextBtnText: 'Avanti',
      prevBtnText: 'Indietro',
      doneBtnText: 'Fine',
      progressText: '{{current}} di {{total}}',
      onDestroyed: () => {
        if (markCompletedOnDestroy) {
          localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
        }
      },
    });
    driverRef.current.drive();
  };

  useEffect(() => {
    if (localStorage.getItem(TOUR_COMPLETED_KEY) !== 'true') {
      startTour(tourSteps, { markCompletedOnDestroy: true });
    }
    return () => driverRef.current?.destroy();
    // Avvio solo al mount: `startTour` è ricreata a ogni render ma non deve
    // rientrare tra le dipendenze (non vogliamo riavviare il tour ad ogni render).
  }, []);

  return null;
});

export default AppTour;
