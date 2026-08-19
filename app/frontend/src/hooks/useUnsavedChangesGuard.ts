/**
 * Guardia sulla navigazione quando c'è lavoro non salvato.
 *
 * Perché non `useBlocker` di React Router: quel hook esige un data router
 * (`createBrowserRouter`), mentre l'app monta un `BrowserRouter` classico (`main.tsx`).
 * Migrare il router per una guardia sarebbe un refactoring globale fuori dal task, quindi
 * la guardia copre le due strade con cui si esce davvero dall'editor:
 *
 * 1. **Uscita dal documento** (ricarica, chiusura scheda, URL digitato): `beforeunload`,
 *    che mostra il dialogo nativo del browser — l'unico ammesso, non essendo sostituibile.
 * 2. **Navigazione interna** (voce di menu, breadcrumb, qualunque `<a href>` dell'admin):
 *    un listener in fase di **cattura** intercetta il click prima che React Router lo
 *    trasformi in navigazione, e il chiamante mostra la propria conferma Mantine.
 *
 * **Limite dichiarato**: il tasto Indietro del browser non è coperto — bloccarlo senza data
 * router richiede di riscrivere la cronologia con `pushState`, che lascia l'utente su una
 * voce di cronologia fantasma se qualcosa va storto. Il costo di quel caso è una perdita di
 * modifiche non salvate, lo stesso di oggi; il costo dell'aggiramento sarebbe una cronologia
 * corrotta sempre. Si chiude quando/se il router diventa un data router.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface UnsavedChangesGuard {
  /** Percorso interno trattenuto dalla guardia, `null` se non c'è nulla in sospeso. */
  pendingPath: string | null;
  /** Prosegue verso la destinazione trattenuta, abbandonando le modifiche non salvate. */
  leaveAnyway: () => void;
  /** Annulla la navigazione: si resta dove si è, le modifiche restano in editing. */
  stay: () => void;
}

/**
 * Trattiene le navigazioni finché `enabled` è `true`. Disattivata (`enabled === false`) non
 * registra alcun listener: nessun costo quando non c'è nulla da proteggere.
 */
export function useUnsavedChangesGuard(enabled: boolean): UnsavedChangesGuard {
  const navigate = useNavigate();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      // Nessun browser mostra più un testo personalizzato: conta solo che l'handler
      // chieda conferma.
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    function handleClickCapture(event: MouseEvent): void {
      // Click già gestito, tasto non primario o con modificatori (apri in nuova scheda,
      // scarica): non è una navigazione che porta via da questa pagina.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;

      const url = new URL(anchor.href, window.location.href);
      // Altra origine: se ne occupa `beforeunload`, che il browser mostra comunque.
      if (url.origin !== window.location.origin) return;
      // Stessa pagina (ancora interna, query di una tabella): non si esce dall'editor.
      if (url.pathname === window.location.pathname) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingPath(`${url.pathname}${url.search}${url.hash}`);
    }

    document.addEventListener('click', handleClickCapture, true);
    return () => document.removeEventListener('click', handleClickCapture, true);
  }, [enabled]);

  const leaveAnyway = useCallback(() => {
    const destination = pendingPath;
    setPendingPath(null);
    if (destination) navigate(destination);
  }, [navigate, pendingPath]);

  const stay = useCallback(() => setPendingPath(null), []);

  return { pendingPath, leaveAnyway, stay };
}
