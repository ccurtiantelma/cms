/**
 * Template Editor (Theme Builder) a schermo intero di un Template di Sito
 * (`/site-templates/:guid/builder`, RFC-40 Opzione B). Stesso principio del builder delle
 * Sezioni Globali (`PageGlobalSectionBuilder.tsx`, F06/ADR-40), qui adattato ai Template di
 * Sito: stesso store dell'albero di blocchi (`useBlockEditorStore`), stessa serializzazione
 * (`block-content.serialization.ts`), stessa traduzione del `400` di validazione nel blocco
 * colpevole, stessa guardia "modifiche non salvate". Le differenze sono l'entità salvata
 * (`PATCH /app/site-templates/:guid`, `409 SITE_TEMPLATE_VERSION_CONFLICT`) e la chrome:
 * `FullScreenEditorLayout.tsx` non offre gli slot necessari alla topbar richiesta qui (badge
 * tipo/lingua, "Salva Bozza"/"Pubblica" distinti, "Condizioni di Visualizzazione", switch
 * viewport con etichette dedicate) — questo componente costruisce quindi il proprio guscio
 * full-screen (`PageSiteTemplateBuilder.module.css`, stesso `position: fixed; inset: 0;
 * z-index: 1000` di `FullScreenEditorLayout.module.css`, mai quel file toccato: è condiviso
 * con l'editor di Pagina e delle Sezioni Globali) componendo `BuilderTopBar` + `BuilderSidebar`
 * + lo stesso `EditorCanvas`/`DndContext` (stessi sensori/collisione).
 *
 * **Caricamento**: `useSiteTemplatesStore().selectTemplate(guid)` (sempre una GET fresca, per
 * una `version` aggiornata) invece di una chiamata diretta al service — lo store esiste già
 * per questo modulo. Il risultato è però copiato in uno **stato locale** (`template`) letto
 * una sola volta dopo l'`await`, non un selettore reattivo su `useSiteTemplatesStore
 * .selectedTemplate`: quel campo dello store è condiviso anche da `DisplayConditionsModal.tsx`
 * (aperta da qui per "Condizioni di Visualizzazione"), che ad ogni apertura lo **sovrascrive**
 * con una propria GET fresca — un selettore reattivo qui re-inizializzerebbe l'albero in
 * editing (`initTree`, sotto) ogni volta che quella modale si apre, buttando via modifiche non
 * salvate. Lo stato locale resta quindi l'unica fonte di verità di questo componente dopo il
 * caricamento iniziale.
 *
 * **Salvataggio**: non passa da `saveCurrentTemplate()` dello store — quell'azione invia
 * `selectedTemplate.contentTree` **dello store**, che qui non viene mai tenuto sincronizzato
 * con l'albero in editing di `useBlockEditorStore` (lo store espone un solo metodo per
 * farlo, `updateDraftContentTree`, di fatto non consumato da alcuna UI reale — sincronizzarlo
 * solo per poi richiamare `saveCurrentTemplate()` duplicherebbe la costruzione del DTO senza
 * guadagnare nulla). Il DTO si costruisce quindi a mano, con `update()` del service
 * (`site-templates.service.ts`, mai toccato) chiamato direttamente: stesso schema di campi di
 * `saveCurrentTemplate`, `contentTree` however preso da
 * `toPersistableBlocks(useBlockEditorStore.getState().tree)` (il `v` ristampato dal registro,
 * le props ripulite — la forma canonica del wire, ADR-21). Il cast a `ContentBlockNode[]`
 * attraversa il confine fra la forma di editing (senza `v`) e quella persistibile: `update()`
 * si limita a incapsularla in `{ version, blocks }` (`encodeContentTree`), indifferente alla
 * presenza di `v` per elemento.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Center, Loader } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { AxiosError } from 'axios';
import { useParams } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { getErrorMessage } from '../../utils/api.utils';
import { update as updateSiteTemplate } from '../../services/site-templates.service';
import { useSiteTemplatesStore } from '../../hooks/useSiteTemplatesStore';
import type { ContentBlockNode, SiteTemplate, SiteTemplatesErrorData } from '../../types/site-templates.types';
import {
  useActiveViewport,
  useBlockEditorStore,
  useCanRedo,
  useCanUndo,
  useHasUnsavedChanges,
  type EditorViewport,
} from '../../hooks/useBlockEditorStore';
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
import BuilderTopBar from './components/builder/BuilderTopBar';
import BuilderSidebar from './components/builder/BuilderSidebar';
import DisplayConditionsModal from './components/DisplayConditionsModal';
import styles from './PageSiteTemplateBuilder.module.css';

/** Classe del contenitore del canvas per viewport simulato — stessa idea di `FullScreenEditorLayout.module.css`. */
const VIEWPORT_CLASS: Record<EditorViewport, string> = {
  desktop: styles.viewportDesktop,
  tablet: styles.viewportTablet,
  mobile: styles.viewportMobile,
};

/** Payload di una zona di rilascio del canvas (`EditorBlockWrapper.tsx`): dove inserire/spostare il nodo trascinato. */
interface DropTarget {
  parentId: string | null;
  index: number;
}

/** Builder a piena finestra dell'albero di blocchi di un Template di Sito. */
export default function PageSiteTemplateBuilder(): JSX.Element {
  const { guid } = useParams<{ guid: string }>();

  const selectTemplate = useSiteTemplatesStore((state) => state.selectTemplate);

  const [template, setTemplate] = useState<SiteTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conditionsOpened, setConditionsOpened] = useState(false);
  /** Nodo respinto dall'ultima validazione server-side, evidenziato nel canvas. */
  const [invalidBlockId, setInvalidBlockId] = useState<string | null>(null);

  const initTree = useBlockEditorStore((state) => state.initTree);
  const undo = useBlockEditorStore((state) => state.undo);
  const redo = useBlockEditorStore((state) => state.redo);
  const moveNodeToAction = useBlockEditorStore((state) => state.moveNodeToAction);
  const activeViewport = useActiveViewport();
  const setActiveViewport = useBlockEditorStore((state) => state.setActiveViewport);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
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
    // `selectTemplate` normalizza già i propri errori (notifica + `error` nello store, vedi
    // `useSiteTemplatesStore.ts`): qui non c'è un `AxiosError` da ispezionare per distinguere
    // un 404 da un altro errore, quindi "il Template atteso non è quello caricato" resta
    // l'unico segnale disponibile senza toccare quello store.
    await selectTemplate(guid);
    const loaded = useSiteTemplatesStore.getState().selectedTemplate;
    if (loaded && loaded.guid === guid) {
      setTemplate(loaded);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [guid, selectTemplate]);

  useEffect(() => {
    void load();
    return () => {
      // Il prossimo consumatore dello store (es. `DisplayConditionsModal` aperta dalla
      // lista) non deve ereditare la selezione di questo Template.
      void useSiteTemplatesStore.getState().selectTemplate(null);
    };
  }, [load]);

  /**
   * Firma del contenuto servito dal caricamento (stessa ragione di
   * `PageGlobalSectionBuilder.tsx`): la dipendenza dell'effetto è il **valore** dell'albero,
   * non l'identità dell'oggetto, così l'editor si reinizializza solo quando il contenuto è
   * davvero cambiato lato server (primo caricamento e ritorno di un salvataggio riuscito).
   */
  const contentSignature = useMemo(
    () => JSON.stringify(template?.contentTree ?? []),
    [template?.contentTree],
  );

  useEffect(() => {
    // `toEditorBlocks` si aspetta l'envelope `{ blocks }`: `template.contentTree` è già
    // decodificato dal service (`decodeContentTree`) alla sola lista `blocks`, va reincapsulata
    // per riusare la stessa normalizzazione (props responsive avvolte, nodi malformati
    // scartati) dell'editor di Pagina/Sezioni Globali.
    initTree(toEditorBlocks({ blocks: JSON.parse(contentSignature) }));
    setInvalidBlockId(null);
  }, [initTree, contentSignature]);

  /** Traduce un `400` di validazione dell'albero nel blocco colpevole (stesso pattern di `PageGlobalSectionBuilder.tsx`). */
  function handleTreeValidationError(error: AxiosError<SiteTemplatesErrorData>): boolean {
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

  /**
   * Salva l'albero corrente (`PATCH /app/site-templates/:guid`, lock ottimistico).
   * `isPublished`: `false`/invariato per "Salva Bozza", `true` per "Pubblica" — mai lo stesso
   * pulsante ambiguo (CLAUDE.md § dominio CMS).
   */
  async function persist(isPublished: boolean): Promise<void> {
    if (!template) return;
    setSaving(true);
    setInvalidBlockId(null);
    // Fotografato **prima** della richiesta: ciò che si modifica mentre il salvataggio è in
    // volo non è stato salvato, e deve continuare a risultare tale.
    const savePoint = useBlockEditorStore.getState().currentSavePoint();
    try {
      const persistableBlocks = toPersistableBlocks(useBlockEditorStore.getState().tree);
      const updated = await updateSiteTemplate(template.guid, {
        version: template.version,
        title: template.title,
        type: template.type,
        language: template.language,
        priority: template.priority,
        displayConditions: template.displayConditions,
        isPublished,
        // Vedi il commento di testa del file: forma persistibile del wire (`v` ristampato,
        // props ripulite), non la forma di editing che `UpdateSiteTemplateDto` dichiara.
        contentTree: persistableBlocks as unknown as ContentBlockNode[],
      });
      useBlockEditorStore.getState().markSaved(savePoint);
      setTemplate(updated);
      notifications.show({
        color: 'green',
        message: isPublished ? 'Template di tema pubblicato' : 'Bozza del Template salvata',
      });
    } catch (err) {
      const error = err as AxiosError<SiteTemplatesErrorData>;
      if (error.response?.data?.code === 'SITE_TEMPLATE_VERSION_CONFLICT') {
        notifications.show({
          color: 'red',
          autoClose: false,
          title: 'Modifica concorrente',
          message:
            'Il Template è stato modificato da un altro utente. Ricarica per ripartire dal contenuto aggiornato: le modifiche non salvate andranno perse.',
        });
      } else if (!handleTreeValidationError(error)) {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel salvataggio del Template di tema'),
        });
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * Chiude "Condizioni di Visualizzazione": quella modale può aver salvato una nuova
   * `version` (il proprio `saveCurrentTemplate()`, interno a `DisplayConditionsModal.tsx`) —
   * riallinea qui `version`/`displayConditions` locali, altrimenti il prossimo salvataggio da
   * questo builder userebbe una `version` obsoleta e otterrebbe un `409` spurio (concettualmente
   * corretto — nessun overwrite silenzioso — ma evitabile).
   */
  function handleCloseDisplayConditions(): void {
    const latest = useSiteTemplatesStore.getState().selectedTemplate;
    if (latest && guid && latest.guid === guid) {
      setTemplate((previous) =>
        previous
          ? { ...previous, version: latest.version, displayConditions: latest.displayConditions }
          : previous,
      );
    }
    setConditionsOpened(false);
  }

  // Puntatore + tastiera, `pointerWithin`: stessa configurazione di
  // `FullScreenEditorLayout.tsx` (le drop-zone di `EditorBlockWrapper.tsx` sono strisce
  // sottili annidate in contenitori grandi — `closestCenter` sceglierebbe spesso il
  // contenitore anche col puntatore sopra la striscia del figlio).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  /** Riordino/spostamento di un nodo già nell'albero (`EditorBlockWrapper.tsx`) — nessuna sorgente "nuovo blocco" qui: `BuilderSidebar` inserisce per click, non per drag. */
  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) return;
    const target = over.data.current as DropTarget | undefined;
    if (!target) return;
    moveNodeToAction(String(active.id), target.parentId, target.index);
  }

  if (notFound) return <PageNotFound />;

  if (loading || !template) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  return (
    <>
      <div className={styles.root}>
        <BuilderTopBar
          title={template.title}
          type={template.type}
          language={template.language}
          hasUnsavedChanges={hasUnsavedChanges}
          saving={saving}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          activeViewport={activeViewport}
          onViewportChange={setActiveViewport}
          onSaveDraft={() => void persist(template.isPublished)}
          onPublish={() => void persist(true)}
          onOpenDisplayConditions={() => setConditionsOpened(true)}
        />

        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
          <div className={styles.workArea}>
            <aside className={styles.sidebar}>
              <BuilderSidebar templateType={template.type} />
            </aside>

            <div className={styles.canvasArea}>
              <div
                className={`${styles.viewportContainer} ${VIEWPORT_CLASS[activeViewport]}`}
                data-viewport={activeViewport}
              >
                <InvalidBlockProvider invalidBlockId={invalidBlockId}>
                  <EditorCanvas />
                </InvalidBlockProvider>
              </div>
            </div>
          </div>
        </DndContext>
      </div>

      <DisplayConditionsModal
        opened={conditionsOpened}
        onClose={handleCloseDisplayConditions}
        guid={guid ?? null}
      />

      {guard.pendingPath !== null && (
        <ConfirmModal
          opened
          onClose={guard.stay}
          onConfirm={guard.leaveAnyway}
          title="Modifiche non salvate"
          confirmLabel="Esci senza salvare"
          confirmColor="red"
          // Sopra la chrome full-screen del builder (z-index 1000).
          zIndex={1100}
        >
          Le modifiche ai blocchi di questo Template di Sito non sono ancora state salvate:
          uscendo ora vanno perse.
        </ConfirmModal>
      )}
    </>
  );
}
