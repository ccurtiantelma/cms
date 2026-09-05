/**
 * Logica di transizione di stato di una Pagina (menu "Cambia Stato" + conferma +
 * programmazione data/ora), condivisa fra `PagePageDetail.tsx` (tendina di stato
 * dell'intestazione) e `PageStudio.tsx` (voce "Cambia Stato" della topbar dell'editor
 * full-screen, ADR-54): stessa macchina a stati, un solo punto che decide come reagire a
 * ciascun target — mai due copie della stessa diramazione `scheduled`/resto.
 */
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { AxiosError } from 'axios';
import { getErrorMessage } from '../../../utils/api.utils';
import { changePageStatus } from '../../../services/pages.service';
import {
  PAGE_STATUS_LABELS,
  PAGE_STATUS_TRANSITIONS,
  type ChangeStatusPayload,
  type PageRecord,
  type PagesErrorData,
  type PageStatus,
} from '../../../types/pages.types';
import { AppUserRoles } from '../../../types/common.types';

/**
 * Filtra le transizioni ammesse dallo stato corrente in base al ruolo (`docs/business-rules.md`
 * § Permessi editoriali): un `User` può solo inviare in revisione (`review`) — mai pubblicare,
 * programmare, archiviare o riportare in bozza. Gli altri ruoli (Manager/Admin/SuperAdmin) vedono
 * tutte le transizioni ammesse. La barriera reale resta il backend (guard RBAC + ownership per
 * riga, ADR-18): questo filtro evita solo di mostrare un'azione che il server rifiuterebbe.
 */
export function visibleTransitionsForRole(
  transitions: readonly PageStatus[],
  role: AppUserRoles | undefined,
): readonly PageStatus[] {
  if (role !== AppUserRoles.User) return transitions;
  return transitions.filter((target) => target === 'review');
}

interface UsePageStatusTransitionOptions {
  /**
   * La Pagina corrente — la fonte dello stato e del `guid`/`version` da inviare. `null`
   * finché il chiamante non l'ha ancora caricata (le regole dei Hook impongono di invocare
   * questo hook incondizionatamente, anche prima del guard `loading || !page` del render):
   * in quel caso non ci sono transizioni visibili e ogni azione è un no-op.
   */
  page: PageRecord | null;
  /** Propaga la `PageRecord` restituita da una transizione riuscita (nuova `version`/`status`). */
  setPage: (page: PageRecord) => void;
  /** Notifica dedicata di conflitto di editing (`409 PAGE_VERSION_CONFLICT`), mai overwrite silenzioso. */
  onVersionConflict: () => void;
  /** Ruolo dell'utente corrente, per `visibleTransitionsForRole`. */
  role: AppUserRoles | undefined;
  /** Ricarica la Pagina dal server — invocata dopo un `403` per riallineare lo stato mostrato. */
  onReload?: () => void;
  /**
   * Salva la bozza pendente prima di una pubblicazione. Presente solo dove il salvataggio
   * dell'albero di blocchi esiste davvero (`PageStudio.tsx`, che monta `BlockEditorPanel`):
   * `PagePageDetail.tsx` non ha più accesso all'editor dopo ADR-54 (rotta `/studio/:guid`
   * separata) e pubblica sempre la bozza già salvata sul server. Ritorna la `PageRecord` da
   * usare per la transizione, o `null` per abortire (es. salvataggio fallito).
   */
  presaveDraft?: () => Promise<PageRecord | null>;
}

export interface PageStatusTransitionApi {
  /** Transizioni ammesse dallo stato corrente, filtrate per ruolo. */
  visibleTransitions: readonly PageStatus[];
  /** Transizione di stato (o salvataggio metadati) in corso. */
  submitting: boolean;
  /** Target in attesa di conferma nel `ConfirmModal`, `null` se nessuna. */
  transitionTarget: PageStatus | null;
  /** Il modal di programmazione data/ora (`scheduled`) è aperto. */
  scheduleOpened: boolean;
  scheduledAt: Date | null;
  setScheduledAt: (value: Date | null) => void;
  /** Avvia una transizione: apre il selettore di data (`scheduled`) o il `ConfirmModal` (ogni altro target). */
  requestStatusTransition: (target: PageStatus) => void;
  /** Esegue la transizione (`POST /app/pages/:guid/status`). */
  doChangeStatus: (target: PageStatus, scheduledAtIso?: string) => Promise<void>;
  closeTransitionModal: () => void;
  closeScheduleModal: () => void;
}

/** Stato e azioni della macchina a stati di una Pagina, riusabili da più chrome (dettaglio/Studio). */
export function usePageStatusTransition({
  page,
  setPage,
  onVersionConflict,
  role,
  onReload,
  presaveDraft,
}: UsePageStatusTransitionOptions): PageStatusTransitionApi {
  const [submitting, setSubmitting] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<PageStatus | null>(null);
  const [scheduleOpened, setScheduleOpened] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);

  const status = page ? (page.status as PageStatus) : null;
  const allowedTransitions = status ? (PAGE_STATUS_TRANSITIONS[status] ?? []) : [];
  const visibleTransitions = visibleTransitionsForRole(allowedTransitions, role);

  function requestStatusTransition(target: PageStatus): void {
    if (target === 'scheduled') {
      setScheduledAt(null);
      setScheduleOpened(true);
    } else {
      setTransitionTarget(target);
    }
  }

  async function doChangeStatus(target: PageStatus, scheduledAtIso?: string): Promise<void> {
    if (!page) return;
    setSubmitting(true);
    try {
      const payload: ChangeStatusPayload = { status: target, scheduledAt: scheduledAtIso };
      const pageToTransition = target === 'published' && presaveDraft ? await presaveDraft() : page;
      if (!pageToTransition) return;
      const updated = await changePageStatus(pageToTransition.guid, payload);
      setPage(updated);
      notifications.show({
        color: 'green',
        message: `Stato aggiornato a "${PAGE_STATUS_LABELS[target]}"`,
      });
      setTransitionTarget(null);
      setScheduleOpened(false);
      setScheduledAt(null);
    } catch (err) {
      const error = err as AxiosError<PagesErrorData>;
      const code = error.response?.data?.code;
      if (code === 'PAGE_VERSION_CONFLICT') {
        onVersionConflict();
        setTransitionTarget(null);
        setScheduleOpened(false);
      } else if (error.response?.status === 403) {
        // Il ruolo/ownership non consente questa transizione: il filtro in UI (`visibleTransitionsForRole`)
        // la esclude già dal menu in condizioni normali — questo resta il caso limite (ruolo
        // cambiato o ownership persa a sessione già aperta). Si ricarica la Pagina per riallineare
        // lo stato mostrato a quello reale sul server.
        notifications.show({
          color: 'red',
          title: 'Operazione non consentita',
          message: 'Non hai i permessi per eseguire questo cambio di stato su questa Pagina.',
        });
        setTransitionTarget(null);
        setScheduleOpened(false);
        onReload?.();
      } else if (error.response?.status === 400 && error.response.data?.details?.transition) {
        notifications.show({
          color: 'red',
          message: `Transizione non ammessa: ${error.response.data.details.transition}`,
        });
      } else {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel cambio di stato'),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return {
    visibleTransitions,
    submitting,
    transitionTarget,
    scheduleOpened,
    scheduledAt,
    setScheduledAt,
    requestStatusTransition,
    doChangeStatus,
    closeTransitionModal: () => setTransitionTarget(null),
    closeScheduleModal: () => setScheduleOpened(false),
  };
}
