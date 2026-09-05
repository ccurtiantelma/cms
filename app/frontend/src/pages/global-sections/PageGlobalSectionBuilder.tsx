/**
 * Visual Builder di una Sezione Globale (F06, ADR-40).
 *
 * Come l'editor di Pagina (`/studio/:guid`, ADR-54) questa **è** una rotta a sé
 * (`/global-sections/:guid/builder`), dentro `LayoutProtected` (a differenza di
 * `/studio/:guid`, che ne è fuori): una Sezione Globale non ha un dettaglio con
 * schede SEO/revisioni/stato in cui innestarsi, il suo unico contenuto è l'albero
 * di blocchi. Da qui la destinazione dedicata invece di una scheda su una pagina
 * che non esiste.
 *
 * Tutto il resto è deliberatamente lo stesso dell'editor di Pagina, non una
 * seconda implementazione: stessa chrome (`FullScreenEditorLayout`), stesso store
 * Zustand (`useBlockEditorStore`), stesso canvas, stessa serializzazione
 * dell'albero (`block-content.serialization.ts`), stessa traduzione del `400` di
 * validazione nel blocco colpevole. Le sole differenze sono l'entità salvata
 * (`PATCH /app/global-sections/:guid`) e l'assenza di Locale Switcher e Anteprima:
 * una Sezione Globale non ha `locale`, non ha gruppo di traduzione e non ha bozza
 * distinta dal pubblicato — ciò che si salva è già ciò che il sito pubblico serve.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Center, Loader } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { AxiosError } from 'axios';
import { useParams } from 'react-router-dom';
import { getErrorMessage } from '../../utils/api.utils';
import { fetchGlobalSection, updateGlobalSection } from '../../services/global-sections.service';
import type {
  GlobalSectionRecord,
  GlobalSectionsErrorData,
} from '../../types/global-sections.types';
import { ENVELOPE_VERSION } from '../../types/blocks.types';
import { useBlockEditorStore, useHasUnsavedChanges } from '../../hooks/useBlockEditorStore';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import ConfirmModal from '../../components/ConfirmModal';
import PageNotFound from '../../components/PageNotFound';
import {
  blockLabel,
  propNameFromPath,
  resolveNodeByPath,
  toEditorBlocks,
  toPersistableBlocks,
} from '../pages/editor/block-content.serialization';
import EditorCanvas from '../pages/editor/EditorCanvas';
import { InvalidBlockProvider } from '../pages/editor/EditorBlockWrapper';
import FullScreenEditorLayout from '../pages/editor/FullScreenEditorLayout';
import EditorStructureNavigator from '../pages/editor/EditorStructureNavigator';

/** Builder a piena finestra dell'albero di blocchi di una Sezione Globale. */
export default function PageGlobalSectionBuilder(): JSX.Element {
  const { guid } = useParams<{ guid: string }>();

  const [section, setSection] = useState<GlobalSectionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Nodo respinto dall'ultima validazione server-side, evidenziato nel canvas. */
  const [invalidBlockId, setInvalidBlockId] = useState<string | null>(null);

  const initTree = useBlockEditorStore((state) => state.initTree);
  const undo = useBlockEditorStore((state) => state.undo);
  const redo = useBlockEditorStore((state) => state.redo);
  const hasUnsavedChanges = useHasUnsavedChanges();

  const guard = useUnsavedChangesGuard(hasUnsavedChanges);

  useHotkeys([
    ['mod+Z', () => undo()],
    ['mod+shift+Z', () => redo()],
    ['mod+Y', () => redo()],
  ]);

  const load = useCallback(async (): Promise<void> => {
    if (!guid) return;
    setLoading(true);
    try {
      setSection(await fetchGlobalSection(guid));
      setNotFound(false);
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status === 404) {
        setNotFound(true);
      } else {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel caricamento della Sezione Globale'),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [guid]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Firma del contenuto servito dal caricamento: stessa ragione di
   * `BlockEditorPanel.tsx` — la dipendenza dell'effetto è il **valore** del
   * contenuto, non l'identità dell'oggetto, così l'albero in editing si
   * reinizializza solo quando il contenuto è davvero cambiato lato server (primo
   * caricamento e ritorno di un salvataggio riuscito), mai per un `setSection`
   * che non tocca i blocchi.
   */
  const contentSignature = useMemo(
    () => JSON.stringify(section?.content ?? {}),
    [section?.content],
  );

  // Prima del caricamento la firma è `{}` e l'albero risulta vuoto: nessun ramo
  // condizionale qui, il canvas non è comunque montato finché `section` è `null`.
  useEffect(() => {
    initTree(toEditorBlocks(JSON.parse(contentSignature)));
    setInvalidBlockId(null);
  }, [initTree, contentSignature]);

  /**
   * Traduce un `400` di validazione dell'albero nel blocco colpevole: lo evidenzia
   * nel canvas e nomina tipo e prop nella notifica. Ritorna `false` se l'errore non
   * è riconducibile a un nodo, lasciando al chiamante la notifica generica.
   */
  function handleTreeValidationError(error: AxiosError<GlobalSectionsErrorData>): boolean {
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

  /** Salva l'albero corrente (`PATCH /app/global-sections/:guid`, lock ottimistico). */
  async function handleSave(): Promise<void> {
    if (!section) return;
    setSaving(true);
    setInvalidBlockId(null);
    // Fotografato **prima** della richiesta: ciò che si modifica mentre il
    // salvataggio è in volo non è stato salvato, e deve continuare a risultare tale.
    const savePoint = useBlockEditorStore.getState().currentSavePoint();
    try {
      const updated = await updateGlobalSection(section.guid, {
        version: section.version,
        content: {
          version: ENVELOPE_VERSION,
          blocks: toPersistableBlocks(useBlockEditorStore.getState().tree),
        },
      });
      // Si riparte da ciò che è stato davvero salvato: il server sanitizza il rich
      // text prima di persistere, quindi la risposta è il contenuto reale e non la
      // versione pre-sanitizzazione digitata dall'utente.
      useBlockEditorStore.getState().markSaved(savePoint);
      setSection(updated);
      notifications.show({ color: 'green', message: 'Sezione Globale salvata' });
    } catch (err) {
      const error = err as AxiosError<GlobalSectionsErrorData>;
      if (error.response?.data?.code === 'GLOBAL_SECTION_VERSION_CONFLICT') {
        notifications.show({
          color: 'red',
          autoClose: false,
          title: 'Modifica concorrente',
          message:
            'La Sezione Globale è stata modificata da un altro utente. Ricarica per ripartire dal contenuto aggiornato: le modifiche non salvate andranno perse.',
        });
      } else if (!handleTreeValidationError(error)) {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel salvataggio della Sezione Globale'),
        });
      }
    } finally {
      setSaving(false);
    }
  }

  if (notFound) return <PageNotFound />;

  if (loading || !section) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  return (
    <>
      <FullScreenEditorLayout
        pageTitle={section.title}
        backHref="/global-sections"
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onSaveDraft={() => void handleSave()}
        structurePanel={<EditorStructureNavigator />}
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
          // Sopra la chrome full-screen dell'editor (z-index 1000): di default il
          // Modal monterebbe sotto, restando invisibile dietro l'overlay.
          zIndex={1100}
        >
          Le modifiche ai blocchi di questa Sezione Globale non sono ancora state salvate: uscendo
          ora vanno perse.
        </ConfirmModal>
      )}
    </>
  );
}
