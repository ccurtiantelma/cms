/**
 * Editor visivo dei blocchi (PLAN-F04-editor-visivo.md T2/T4/T5), montato nella scheda
 * "Contenuto" del dettaglio Pagina.
 *
 * **Non è una rotta a sé.** L'editor resta montato dentro il dettaglio Pagina (nessuna
 * voce di `App.tsx`, nessun caricamento proprio della Pagina: arriva come prop dal
 * dettaglio) e nessun pulsante di pubblicazione: la transizione di stato è una sola, nella
 * tendina di stato dell'intestazione del dettaglio, non duplicata qui. Ciò che è cambiato è
 * la *presentazione*: mentre la scheda "Contenuto" è attiva, `FullScreenEditorLayout` copre
 * la chrome admin standard con una chrome full-screen propria (topbar, viewport switcher,
 * pannello struttura) — un overlay `position: fixed`, non una nuova destinazione.
 *
 * Resta qui la sola azione che appartiene al contenuto: il salvataggio della bozza, con
 * il lock ottimistico e la traduzione del `400` di validazione nel blocco colpevole.
 * L'albero vive nello store Zustand e **non** è sottoscritto da questo componente: viene
 * letto in modo imperativo (`getState()`) al solo momento del salvataggio, così una
 * modifica di proprietà non ri-renderizza la barra delle azioni (NFR § Performance —
 * editor).
 */
import { useEffect, useMemo, useState } from 'react';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { AxiosError } from 'axios';
import { getErrorMessage } from '../../../utils/api.utils';
import { updatePage } from '../../../services/pages.service';
import type { PageRecord, PagesErrorData } from '../../../types/pages.types';
import { ENVELOPE_VERSION } from '../../../types/blocks.types';
import { useBlockEditorStore, useHasUnsavedChanges } from '../../../hooks/useBlockEditorStore';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';
import ConfirmModal from '../../../components/ConfirmModal';
import {
  blockLabel,
  propNameFromPath,
  resolveNodeByPath,
  toEditorBlocks,
  toPersistableBlocks,
} from './block-content.serialization';
import EditorCanvas from './EditorCanvas';
import { InvalidBlockProvider } from './EditorBlockWrapper';
import FullScreenEditorLayout from './FullScreenEditorLayout';
import EditorStructureNavigator from './EditorStructureNavigator';

interface BlockEditorPanelProps {
  /** La Pagina in editing, già caricata dal dettaglio. */
  page: PageRecord;
  /** Propaga al dettaglio la Pagina restituita da un salvataggio riuscito (nuova `version`). */
  onPageUpdated: (page: PageRecord) => void;
  /** Notifica di conflitto di editing del dettaglio: mai sovrascrittura silenziosa. */
  onVersionConflict: () => void;
  /**
   * Genera e apre l'anteprima in una nuova scheda (delegato al dettaglio, che possiede il
   * token effimero, ADR-25). `undefined` quando la Pagina non è in bozza — il pulsante
   * "Anteprima" della topbar full-screen resta nascosto in quel caso.
   */
  onPreview?: () => void;
  /** Stato di caricamento della generazione del token di anteprima. */
  previewLoading?: boolean;
  /** Registra il salvataggio della bozza per le transizioni avviate dall'intestazione. */
  onSaveDraftReady?: (saveDraft: () => Promise<PageRecord | null>) => void;
  /**
   * `true` quando la scheda "Contenuto" è quella nominalmente selezionata in
   * `PagePageDetail.tsx` — inoltrato a `FullScreenEditorLayout`, che lo usa per rendersi
   * `display:none` sul proprio nodo quando `false`, invece di affidarsi soltanto al
   * `display:none` che Mantine applica al `Tabs.Panel` antenato (bug corretto, vedi
   * `FullScreenEditorLayout.tsx`).
   */
  active: boolean;
  /**
   * Distanza in pixel dal bordo superiore del viewport da cui l'overlay a piena finestra
   * inizia a coprire, misurata dal dettaglio sul bordo inferiore di `Tabs.List` — non
   * inoltrato oltre `FullScreenEditorLayout`.
   */
}

/** Superficie di editing dell'albero di blocchi della bozza corrente, in chrome full-screen. */
export default function BlockEditorPanel({
  page,
  onPageUpdated,
  onVersionConflict,
  onPreview,
  previewLoading,
  onSaveDraftReady,
  active,
}: BlockEditorPanelProps): JSX.Element {
  const [saving, setSaving] = useState(false);
  /** Nodo respinto dall'ultima validazione server-side, evidenziato nel canvas. */
  const [invalidBlockId, setInvalidBlockId] = useState<string | null>(null);

  const initTree = useBlockEditorStore((state) => state.initTree);
  const undo = useBlockEditorStore((state) => state.undo);
  const redo = useBlockEditorStore((state) => state.redo);
  const hasUnsavedChanges = useHasUnsavedChanges();

  /**
   * Guardia sull'uscita: finché l'albero diverge dalla bozza salvata, lasciare la scheda
   * (o l'admin) chiede conferma. Senza, le modifiche ai blocchi sparivano senza un segnale
   * — l'unica traccia era accorgersi, dopo, che il contenuto era quello di prima.
   */
  const guard = useUnsavedChangesGuard(hasUnsavedChanges);

  // Le scorciatoie standard. `useHotkeys` ignora per default gli eventi originati da
  // input/textarea/select: dentro un campo dell'ispettore Ctrl+Z resta l'annulla del
  // campo, non quello dell'albero.
  useHotkeys([
    ['mod+Z', () => undo()],
    ['mod+shift+Z', () => redo()],
    ['mod+Y', () => redo()],
  ]);

  /**
   * Firma del contenuto servito dal dettaglio. La dipendenza dell'effetto è il **valore**
   * della bozza, non l'identità dell'oggetto: ogni `setPage` del dettaglio (anche quello
   * di un salvataggio dei soli metadati SEO) produce un `draftContent` nuovo di zecca, e
   * usarlo come dipendenza azzererebbe l'albero in editing buttando via le modifiche ai
   * blocchi non ancora salvate. Con la firma, l'albero si reinizializza solo quando il
   * contenuto è davvero cambiato lato server.
   */
  const contentSignature = useMemo(
    () => JSON.stringify(page.draftContent ?? {}),
    [page.draftContent],
  );

  // L'albero si (ri)carica quando cambia la bozza servita dal dettaglio — al primo
  // montaggio, dopo un "Ricarica" e dopo un salvataggio riuscito (dove il server
  // restituisce il contenuto sanitizzato, che è quello vero).
  useEffect(() => {
    initTree(toEditorBlocks(JSON.parse(contentSignature)));
    setInvalidBlockId(null);
  }, [initTree, contentSignature]);

  /**
   * Traduce un `400` di validazione dell'albero nel blocco colpevole: lo evidenzia nel
   * canvas e nomina tipo e prop nella notifica. Ritorna `false` se l'errore non è
   * riconducibile a un nodo (limiti d'albero, envelope), lasciando al chiamante la
   * notifica generica.
   */
  function handleTreeValidationError(error: AxiosError<PagesErrorData>): boolean {
    const path = error.response?.data?.details?.path;
    if (error.response?.status !== 400 || !path) return false;

    const node = resolveNodeByPath(useBlockEditorStore.getState().tree, path);
    setInvalidBlockId(node?.id ?? null);

    const propName = propNameFromPath(path);
    const target = node
      ? `Blocco "${blockLabel(node.type)}"${propName ? ` — proprietà "${propName}"` : ''}`
      : `Blocco in "${path}"`;
    notifications.show({
      color: 'red',
      autoClose: false,
      title: 'Blocco non valido',
      message: `${target}: ${getErrorMessage(error, 'contenuto rifiutato dalla validazione')}`,
    });
    return true;
  }

  /** Salva l'albero corrente come bozza (`PATCH /app/pages/:guid`, lock ottimistico). */
  async function handleSaveDraft(): Promise<PageRecord | null> {
    setSaving(true);
    setInvalidBlockId(null);
    // Fotografato **prima** della richiesta: ciò che si modifica mentre il salvataggio è in
    // volo non è stato salvato, e deve continuare a risultare tale.
    const savePoint = useBlockEditorStore.getState().currentSavePoint();
    try {
      const updated = await updatePage(page.guid, {
        version: page.version,
        draftContent: {
          version: ENVELOPE_VERSION,
          blocks: toPersistableBlocks(useBlockEditorStore.getState().tree),
        },
      });
      // Il server sanitizza il rich text prima di persistere: si riparte da ciò che è
      // stato davvero salvato, così l'editor mostra il contenuto reale e non la versione
      // pre-sanitizzazione digitata dall'utente. Il rimontaggio dell'albero avviene
      // nell'effetto sopra, alla nuova `draftContent`.
      useBlockEditorStore.getState().markSaved(savePoint);
      onPageUpdated(updated);
      notifications.show({ color: 'green', message: 'Bozza salvata' });
      return updated;
    } catch (err) {
      const error = err as AxiosError<PagesErrorData>;
      const code = error.response?.data?.code;
      if (code === 'PAGE_VERSION_CONFLICT') {
        onVersionConflict();
      } else if (!handleTreeValidationError(error)) {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel salvataggio della bozza'),
        });
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    onSaveDraftReady?.(handleSaveDraft);
    // La funzione viene rinnovata a ogni render; la registrazione deve invece seguire
    // solo il callback esterno e la versione della bozza catturata dal salvataggio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSaveDraftReady, page.guid, page.version]);

  return (
    <>
      {/*
        Chrome full-screen (`position: fixed`, z-index sopra `LayoutProtected`): finché la
        scheda "Contenuto" è montata, l'editor copre per intero sidebar/topbar admin — non è
        una destinazione separata nel routing, solo la sua presentazione mentre è attiva.
      */}
      <FullScreenEditorLayout
        pageTitle={page.title}
        page={page}
        // Torna al dettaglio della Pagina in modifica, non alla lista generica: la lista
        // perde il contesto (quale Pagina si stava editando) senza alcun vantaggio (bug T5).
        backHref={`/pages/${page.guid}`}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onSaveDraft={() => void handleSaveDraft()}
        onPreview={onPreview}
        previewLoading={previewLoading}
        structurePanel={<EditorStructureNavigator />}
        active={active}
      >
        <InvalidBlockProvider invalidBlockId={invalidBlockId}>
          <EditorCanvas />
        </InvalidBlockProvider>
      </FullScreenEditorLayout>

      {guard.pendingPath !== null && (
        <ConfirmModal
          opened
          onClose={guard.stay}
          onConfirm={guard.leaveAnyway}
          title="Modifiche non salvate"
          confirmLabel="Esci senza salvare"
          confirmColor="red"
          // Sopra la chrome full-screen dell'editor (z-index 1000, FullScreenEditorLayout.module.css):
          // di default il Modal monterebbe sotto, restando invisibile dietro l'overlay.
          zIndex={1100}
        >
          Le modifiche ai blocchi non sono ancora state salvate come bozza: uscendo ora vanno perse.
        </ConfirmModal>
      )}
    </>
  );
}
