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
import { BLOCK_TYPES, ENVELOPE_VERSION } from '../../../types/blocks.types';
import { useBlockEditorStore, useHasUnsavedChanges } from '../../../hooks/useBlockEditorStore';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';
import ConfirmModal from '../../../components/ConfirmModal';
import type { BlockNode } from './block-tree.utils';
import EditorCanvas from './EditorCanvas';
import { InvalidBlockProvider } from './EditorBlockWrapper';
import FullScreenEditorLayout from './FullScreenEditorLayout';
import EditorStructureNavigator from './EditorStructureNavigator';

/** Etichetta leggibile di un tipo di blocco, presa dal registro (mai scritta a mano). */
function blockLabel(type: string): string {
  return BLOCK_TYPES.find((descriptor) => descriptor.type === type)?.meta?.label ?? type;
}

/**
 * Normalizza il contenuto persistito (`draftContent.blocks`, `jsonb` non tipizzato) nella
 * forma dell'albero di editing. I nodi malformati vengono scartati invece di far esplodere
 * l'editor: la Pagina resta apribile e il salvataggio successivo riscrive la forma valida.
 *
 * `v` non entra nell'albero di editing: è ristampato dal registro al salvataggio (vedi
 * {@link toPersistableBlocks}).
 */
function toEditorBlocks(raw: unknown): BlockNode[] {
  if (!raw || typeof raw !== 'object') return [];
  const blocks = (raw as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const node = entry as Record<string, unknown>;
    if (typeof node.id !== 'string' || typeof node.type !== 'string') return [];
    const rawProps =
      node.props && typeof node.props === 'object' && !Array.isArray(node.props)
        ? (node.props as Record<string, unknown>)
        : {};
    const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
    const props = Object.fromEntries(
      Object.entries(rawProps).map(([name, value]) => {
        const prop = descriptor?.props.find((candidate) => candidate.name === name);
        return [
          name,
          prop?.responsive && (typeof value !== 'object' || value === null || Array.isArray(value))
            ? { default: value }
            : value,
        ];
      }),
    );
    return [
      {
        id: node.id,
        type: node.type,
        props,
        children: toEditorBlocks({ blocks: node.children }),
      },
    ];
  });
}

/**
 * Aggiunge a ogni nodo il `v` del proprio tipo, obbligatorio in scrittura (ADR-21 § 1,
 * `content-tree.ts`). Il valore è preso dal registro e non dall'albero caricato perché
 * la lettura di una Pagina restituisce già il contenuto migrato alla versione corrente
 * (`migrateContentForRead` in `pages.service.ts`): la `v` corrente è quindi l'unica
 * corretta per ciò che l'editor ha in mano. Un tipo non nel registro resta senza `v` —
 * il server lo respinge con il path del nodo, che è esattamente il comportamento voluto
 * (nessuna invenzione di versione lato client).
 */
function toPersistableBlocks(tree: readonly BlockNode[]): Record<string, unknown>[] {
  return tree.map((node) => {
    const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
    return {
      id: node.id,
      type: node.type,
      ...(descriptor ? { v: descriptor.v } : {}),
      props: node.props,
      children: toPersistableBlocks(node.children),
    };
  });
}

/** Segmenti di percorso prodotti dal backend: `blocks[0].children[2].props.text`. */
const PATH_SEGMENT_RE = /(?:blocks|children)\[(\d+)\]/g;

/** Nome della prop colpevole, se il path del server ne indica una. */
function propNameFromPath(path: string): string | undefined {
  return /\.props\.([A-Za-z0-9_]+)/.exec(path)?.[1];
}

/**
 * Risolve il path di un errore di validazione del server nel nodo corrispondente
 * dell'albero in editing. Il path è posizionale (indici, non id): si percorre l'albero
 * con gli stessi indici usati dal backend.
 */
function resolveNodeByPath(tree: readonly BlockNode[], path: string): BlockNode | undefined {
  let siblings: readonly BlockNode[] = tree;
  let node: BlockNode | undefined;
  for (const match of path.matchAll(PATH_SEGMENT_RE)) {
    node = siblings[Number(match[1])];
    if (!node) return undefined;
    siblings = node.children;
  }
  return node;
}

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
  async function handleSaveDraft(): Promise<void> {
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
    } finally {
      setSaving(false);
    }
  }

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
