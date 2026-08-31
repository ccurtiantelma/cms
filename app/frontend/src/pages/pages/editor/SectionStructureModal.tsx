/**
 * Modal "Seleziona la tua struttura" (ADR-33 § 7): selettore a due passi per un nuovo
 * blocco `section` — prima il tipo di layout (Flexbox/Griglia), poi il preset — fedele a
 * Elementor Pro. Unico proprietario di questa UI: era divisa fra questo modal (cinque
 * preset piatti) e il box inline a due passi di `CanvasAddSectionZone.tsx`; ora è tutta
 * qui, montata da due punti (`BlockPalette.tsx` per la voce "Sezione" del suo menu —
 * quindi raggiungibile anche dalla toolbar integrata di `EditorBlockWrapper.tsx` via
 * "Inserisci sopra/sotto" — e `CanvasAddSectionZone.tsx` per il "+" della zona sempre
 * visibile in fondo al canvas) che condividono lo stesso componente controllato — nessuna
 * copia. Un terzo punto di montaggio, il "+" della `sectionActionTab` di
 * `EditorBlockWrapper.tsx`, è stato rimosso insieme a quella barra (T-canvas-declutter,
 * consolidata nella Handle Bar unica): la stessa azione resta raggiungibile dal primo
 * punto sopra.
 *
 * Componente frontend puro nella palette, stesso principio di `WidgetPalette`/
 * `BlockPalette` (ADR-32 § 4): la selezione chiama `addBlockAction` già esistente con un
 * nodo `section` pre-popolato (`columns` + `columnRatio` del preset sovrascritti sopra i
 * default del descrittore), nessuna azione nuova nello store.
 *
 * Supera esplicitamente ADR-31 Decisione 6 ("nessun selettore visivo a icone in questo
 * round"): quel rinvio era condizionato all'assenza di dati per pilotare un box
 * asimmetrico — `columnRatio` (ADR-33 § 2) fornisce ora quel dato.
 *
 * Icone dei preset verificate pixel-per-pixel contro lo "Select Your Structure" reale di
 * Elementor (screenshot del produttore, non una ricostruzione a memoria): riga "Flexbox"
 * = le sette tessere di struttura piatta (colonna/riga direzionali + 5 varianti a colonne,
 * inclusa la coppia simmetrica 33/67 e 67/33 — gap-analysis T-editor-refinement: il
 * "66-33" di `SectionColumnRatioValue` era un valore di tipo già valido ma orfano di
 * preset), riga "Griglia" = le sei tessere a celle annidate/asimmetriche. Le tessere
 * annidate della Griglia (ADR-39, `container` con `flexDirection`/`styleFlexBasis`) non
 * hanno un equivalente nella prop `columns`/`columnRatio` di `section` — nessuna
 * scorciatoia, nessuna nuova prop: si compone `section` + `container` già approvati,
 * esattamente come la sua ADR li ha pensati. `columnRatio` di `section` produce solo lo
 * split flessibile "33/67"/"67/33", mai le celle annidate — quelle attraversano
 * `buildGridSectionSubtree` sotto.
 */
import { useEffect, useState, type ComponentType } from 'react';
import { ActionIcon, Group, Modal, SimpleGrid, Text } from '@mantine/core';
import { IconArrowDown, IconArrowLeft, IconArrowRight, IconGridDots, IconLayoutColumns } from '@tabler/icons-react';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
// Da `block-registry.utils.ts`, non da `./BlockPalette`: `BlockPalette` monta questo
// stesso modal per la voce "Sezione" del suo menu (ADR-33 § 7), un import nell'altro
// verso creerebbe un ciclo fra i due moduli.
import { defaultPropsFor } from './block-registry.utils';
import { findNode, type BlockNode } from './block-tree.utils';
import styles from './SectionStructureModal.module.css';

/** Descrittori del registro (BLOCK_TYPES è statico: calcolati una volta a modulo). */
const SECTION_DESCRIPTOR = BLOCK_TYPES.find((entry) => entry.type === 'section');
const CONTAINER_DESCRIPTOR = BLOCK_TYPES.find((entry) => entry.type === 'container');

/** Passo corrente del selettore a due step. */
type Step = 'chooseType' | 'flexbox' | 'grid';

/** Valori ammessi per `columns`/`columnRatio` (`section.block.ts`): niente oltre questi. */
type SectionColumnsToken = '1' | '2' | '3' | '4';
type SectionColumnRatioValue = 'equal' | '33-66' | '66-33';

/** Forma persistita della prop responsive `columns` (ADR-29). */
interface SectionColumnsValue {
  default: SectionColumnsToken;
}

/**
 * Nodo dell'anteprima proporzionale condivisa fra le tessere "Flexbox" (una sola riga) e
 * "Griglia" (fino a due righe, con celle annidate) — stesso spec renderizza l'icona nella
 * tessera (`renderStructureNode`) e, per la Griglia, il sottoalbero `container` davvero
 * inserito (`buildCellNode`): un solo posto dove le proporzioni sono dichiarate, mai due
 * fonti che potrebbero divergere. Foglia = nessun `children` (una cella piena); ramo =
 * `direction` + `children` (righe/colonne annidate, ADR-39). `weight` è insieme il peso
 * `flex-grow` dell'anteprima e la percentuale `styleFlexBasis` del nodo reale — l'insieme
 * dei valori usati (25/33/34/35/40/50/60/65/67) è chiuso ed esaurito dalle classi
 * `.w25`…`.w67` di `SectionStructureModal.module.css`, mai un valore libero.
 */
interface StructureNode {
  weight: number;
  direction?: 'row' | 'column';
  children?: readonly StructureNode[];
}

/** Preset del layout "Flexbox": split piatto scritto su `columns`/`columnRatio` di `section`. */
interface FlexboxPreset {
  id: string;
  label: string;
  columns: SectionColumnsValue;
  columnRatio: SectionColumnRatioValue;
  /** Solo 'colonna'/'riga': icona direzionale al posto dell'anteprima a celle. */
  directionIcon?: ComponentType<{ size?: number }>;
  /** Assente quando c'è `directionIcon` — le due tessere direzionali non hanno un'anteprima a celle. */
  rows?: readonly StructureNode[];
}

const FLEXBOX_PRESETS: readonly FlexboxPreset[] = [
  {
    id: 'column',
    label: 'Colonna',
    columns: { default: '1' },
    columnRatio: 'equal',
    directionIcon: IconArrowDown,
  },
  {
    id: 'row',
    label: 'Riga',
    columns: { default: '2' },
    columnRatio: 'equal',
    directionIcon: IconArrowRight,
  },
  {
    id: '2-equal',
    label: '2 colonne',
    columns: { default: '2' },
    columnRatio: 'equal',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 50 }, { weight: 50 }] }],
  },
  {
    id: '2-33-67',
    label: '2 colonne (33/67)',
    columns: { default: '2' },
    columnRatio: '33-66',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 67 }] }],
  },
  {
    id: '2-67-33',
    label: '2 colonne (67/33)',
    columns: { default: '2' },
    columnRatio: '66-33',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 67 }, { weight: 33 }] }],
  },
  {
    id: '4-equal',
    label: '4 colonne',
    columns: { default: '4' },
    columnRatio: 'equal',
    rows: [
      {
        weight: 1,
        direction: 'row',
        children: [{ weight: 25 }, { weight: 25 }, { weight: 25 }, { weight: 25 }],
      },
    ],
  },
  {
    id: '3-equal',
    label: '3 colonne',
    columns: { default: '3' },
    columnRatio: 'equal',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 34 }, { weight: 33 }] }],
  },
];

/**
 * Preset del layout "Griglia": ognuno è una lista di righe (`StructureNode`), risolta sia
 * nell'anteprima della tessera sia nel sottoalbero `section` → `container`* davvero
 * inserito da `buildGridSectionSubtree` — mai una prop piatta come i preset Flexbox, le
 * celle annidate/asimmetriche di queste sei tessere non hanno un equivalente in
 * `columns`/`columnRatio` (vedi commento di testa del file).
 */
interface GridPreset {
  id: string;
  label: string;
  rows: readonly StructureNode[];
}

const GRID_PRESETS: readonly GridPreset[] = [
  {
    id: '2x2',
    label: '2×2',
    rows: [
      { weight: 1, direction: 'row', children: [{ weight: 50 }, { weight: 50 }] },
      { weight: 1, direction: 'row', children: [{ weight: 50 }, { weight: 50 }] },
    ],
  },
  {
    id: '2top-1bottom',
    label: '2 sopra, 1 sotto',
    rows: [
      { weight: 1, direction: 'row', children: [{ weight: 40 }, { weight: 60 }] },
      { weight: 1 },
    ],
  },
  {
    id: '1left-2right',
    label: '1 a sinistra, 2 a destra',
    rows: [
      {
        weight: 1,
        direction: 'row',
        children: [
          { weight: 40 },
          { weight: 60, direction: 'column', children: [{ weight: 50 }, { weight: 50 }] },
        ],
      },
    ],
  },
  {
    id: '3x2',
    label: '3×2',
    rows: [
      { weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 34 }, { weight: 33 }] },
      { weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 34 }, { weight: 33 }] },
    ],
  },
  {
    id: '3top-2bottom',
    label: '3 sopra, 2 sotto',
    rows: [
      { weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 34 }, { weight: 33 }] },
      { weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 67 }] },
    ],
  },
  {
    id: 'offset-2x2',
    label: 'Struttura sfalsata',
    rows: [
      { weight: 1, direction: 'row', children: [{ weight: 65 }, { weight: 35 }] },
      { weight: 1, direction: 'row', children: [{ weight: 35 }, { weight: 65 }] },
    ],
  },
];

interface SectionStructureModalProps {
  /** Stato di apertura, controllato dal chiamante. */
  opened: boolean;
  onClose: () => void;
  /** Contenitore di destinazione della nuova Section: `null` = radice dell'albero. */
  parentId: string | null;
  /** Posizione di inserimento fra i figli del contenitore di destinazione. */
  index: number;
}

/**
 * Porta il blocco `id` in vista nel canvas, se il suo wrapper è montato nel DOM
 * (`data-block-id`, `EditorBlockWrapper.tsx`). No-op silenzioso altrimenti — un nodo appena
 * aggiunto in coda a un albero lungo, o non ancora renderizzato per qualunque motivo, non è
 * un errore da segnalare, semplicemente non c'è nulla da far scorrere. Duplicato (non
 * importato) da `EditorStructureNavigator.tsx`: questo codebase duplica deliberatamente
 * piccoli helper cross-modulo per non accoppiare i componenti dell'editor fra loro — stesso
 * principio già in uso per `SECTION_DESCRIPTOR`/`defaultPropsFor` sopra.
 */
function scrollBlockIntoView(id: string): void {
  const selector =
    typeof window !== 'undefined' && typeof window.CSS?.escape === 'function'
      ? `[data-block-id="${window.CSS.escape(id)}"]`
      : `[data-block-id="${id}"]`;
  document
    .querySelector<HTMLElement>(selector)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Renderizza ricorsivamente l'anteprima proporzionale di una tessera preset, in puro CSS
 * (classi `.w25`…`.w67` per il peso, mai uno `style` inline — vedi doc di
 * {@link StructureNode}). Una foglia (`children` assente) è una cella piena; un ramo apre
 * un nuovo asse flex (`direction`) e ricorre sui figli.
 */
function renderStructureNode(node: StructureNode, key: string): JSX.Element {
  const weightClass = styles[`w${node.weight}`] ?? '';
  if (!node.children) {
    return <div key={key} className={[styles.cell, weightClass].join(' ')} />;
  }
  const directionClass = node.direction === 'column' ? styles.directionColumn : styles.directionRow;
  return (
    <div key={key} className={[styles.branch, directionClass, weightClass].join(' ')}>
      {node.children.map((child, childIndex) => renderStructureNode(child, `${key}-${childIndex}`))}
    </div>
  );
}

/** Anteprima completa di una tessera: una colonna di righe (`rows`), stesso principio di {@link renderStructureNode}. */
function StructurePreview({ rows }: { rows: readonly StructureNode[] }): JSX.Element {
  return (
    <div className={styles.previewTile}>
      {rows.map((row, rowIndex) => renderStructureNode(row, `row-${rowIndex}`))}
    </div>
  );
}

let nodeIdSeed = 0;
/** Id placeholder per un nodo del sottoalbero preset — rigenerato comunque da `insertSubtreeAction` (ADR-34 § 2), mai riusato per identità. */
function nextPlaceholderId(): string {
  nodeIdSeed += 1;
  return `structure-preset-${nodeIdSeed}`;
}

/**
 * Costruisce ricorsivamente il sottoalbero `container` di una riga/cella della Griglia
 * (ADR-39): foglia → `container` vuoto (segnaposto interattivo esistente,
 * `EditorBlockWrapper.module.css` `.emptyContainer`, l'utente vi trascina widget dopo);
 * ramo → `container` con `flexDirection` sull'asse dichiarato, contenente i figli. `applyFlexBasis`
 * è `false` solo per le righe di primo livello (figlie dirette della `section`, già a piena
 * larghezza per via del suo `columns: '1'`): per ogni nodo più annidato scrive `styleFlexBasis`
 * dal `weight` dello stesso spec dell'anteprima — un'unica fonte per le due proporzioni.
 */
function buildCellNode(node: StructureNode, applyFlexBasis: boolean): BlockNode {
  if (!CONTAINER_DESCRIPTOR) throw new Error('Descrittore "container" assente dal registro blocchi.');
  const props: Record<string, unknown> = { ...defaultPropsFor(CONTAINER_DESCRIPTOR) };
  if (applyFlexBasis) props.styleFlexBasis = { value: node.weight, unit: '%' };

  if (!node.children) {
    return { id: nextPlaceholderId(), type: 'container', props, children: [] };
  }

  props.flexDirection = { default: node.direction ?? 'row' };
  props.gap = { default: 'sm' };
  return {
    id: nextPlaceholderId(),
    type: 'container',
    props,
    children: node.children.map((child) => buildCellNode(child, true)),
  };
}

/** Sottoalbero `section` (colonna singola, righe impilate) da inserire per un preset Griglia — vedi {@link buildCellNode}. */
function buildGridSectionSubtree(preset: GridPreset): BlockNode {
  if (!SECTION_DESCRIPTOR) throw new Error('Descrittore "section" assente dal registro blocchi.');
  return {
    id: nextPlaceholderId(),
    type: 'section',
    props: {
      ...defaultPropsFor(SECTION_DESCRIPTOR),
      columns: { default: '1' },
      columnRatio: 'equal',
      gap: { default: 'sm' },
    },
    children: preset.rows.map((row) => buildCellNode(row, false)),
  };
}

/** Modal di selezione del preset di struttura per una nuova `section` (ADR-33 § 7). */
export default function SectionStructureModal({
  opened,
  onClose,
  parentId,
  index,
}: SectionStructureModalProps): JSX.Element {
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const insertSubtreeAction = useBlockEditorStore((state) => state.insertSubtreeAction);
  const [step, setStep] = useState<Step>('chooseType');

  // Le tre chiamate di questo modal (`BlockPalette`, `CanvasAddSectionZone`,
  // `EditorBlockWrapper`) riusano tutte la stessa istanza di stato locale fra un'apertura e
  // l'altra: senza questo reset, una sessione lasciata al passo "flexbox"/"grid" riaprirebbe
  // lì invece che dalla scelta del tipo.
  useEffect(() => {
    if (opened) setStep('chooseType');
  }, [opened]);

  /** Scrolla e chiude dopo un inserimento — comune alle due vie di selezione sotto. */
  function afterInsert(insertedId: string | undefined): void {
    setStep('chooseType');
    onClose();
    // Il modal si chiude e il wrapper del nuovo blocco ha bisogno di un giro di render per
    // montarsi/aggiornarsi: senza rimandare lo scroll al frame successivo, il `querySelector`
    // di `scrollBlockIntoView` cercherebbe un nodo non ancora nel DOM.
    if (insertedId) {
      requestAnimationFrame(() => scrollBlockIntoView(insertedId));
    }
  }

  /**
   * Crea la Section col preset Flexbox scelto: default del registro, `columns`/`columnRatio`
   * sovrascritti. `addBlockAction` non ritorna l'id del nodo inserito (`void`): si replica
   * qui il clamping dell'indice che lo store applica internamente (`useBlockEditorStore.ts`,
   * `addBlockAction`) per ritrovare il nodo appena creato e scrollarlo in vista.
   */
  function handleSelectFlexbox(preset: FlexboxPreset): void {
    const baseProps = SECTION_DESCRIPTOR ? defaultPropsFor(SECTION_DESCRIPTOR) : {};
    addBlockAction(parentId, 'section', index, {
      ...baseProps,
      columns: preset.columns,
      columnRatio: preset.columnRatio,
    });

    const tree = useBlockEditorStore.getState().tree;
    const siblings = parentId === null ? tree : (findNode(tree, parentId)?.children ?? []);
    const clampedIndex = Math.max(0, Math.min(index, siblings.length - 1));
    afterInsert(siblings[clampedIndex]?.id);
  }

  /**
   * Inserisce il sottoalbero `section` → `container`* del preset Griglia scelto
   * ({@link buildGridSectionSubtree}) — `insertSubtreeAction` seleziona già il nodo di
   * radice inserito (`useBlockEditorStore.ts`), niente clamping manuale come in
   * `handleSelectFlexbox`.
   */
  function handleSelectGrid(preset: GridPreset): void {
    insertSubtreeAction(parentId, index, buildGridSectionSubtree(preset));
    afterInsert(useBlockEditorStore.getState().selectedId ?? undefined);
  }

  return (
    // zIndex sopra la chrome full-screen dell'editor (z-index 1000,
    // FullScreenEditorLayout.module.css) — stesso motivo/stesso valore di
    // `TemplateLibraryModal.tsx`: senza, il Modal resta al suo z-index di default (200)
    // e monta invisibile dietro l'overlay, pur essendo davvero aperto.
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        step === 'chooseType' ? (
          'Quale layout desideri utilizzare?'
        ) : (
          <Group gap={8} wrap="nowrap">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Torna alla scelta del tipo di layout"
              onClick={() => setStep('chooseType')}
            >
              <IconArrowLeft size={16} />
            </ActionIcon>
            <Text size="sm" fw={600}>
              Seleziona la tua struttura
            </Text>
          </Group>
        )
      }
      size="lg"
      centered
      zIndex={1100}
      overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
    >
      {step === 'chooseType' && (
        <SimpleGrid cols={2} spacing="md">
          <button
            type="button"
            className={styles.typeCard}
            aria-label="Flexbox"
            onClick={() => setStep('flexbox')}
          >
            <IconLayoutColumns size={28} />
            <Text size="sm">Flexbox</Text>
          </button>
          <button
            type="button"
            className={styles.typeCard}
            aria-label="Griglia"
            onClick={() => setStep('grid')}
          >
            <IconGridDots size={28} />
            <Text size="sm">Griglia</Text>
          </button>
        </SimpleGrid>
      )}

      {step === 'flexbox' && (
        <SimpleGrid cols={{ base: 2, xs: 3, sm: 6 }} spacing="xs">
          {FLEXBOX_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetButton}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => handleSelectFlexbox(preset)}
            >
              {preset.directionIcon ? (
                <div className={styles.directionIconBox}>
                  <preset.directionIcon size={22} />
                </div>
              ) : (
                <StructurePreview rows={preset.rows ?? []} />
              )}
            </button>
          ))}
        </SimpleGrid>
      )}

      {step === 'grid' && (
        <SimpleGrid cols={{ base: 2, xs: 3, sm: 6 }} spacing="xs">
          {GRID_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetButton}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => handleSelectGrid(preset)}
            >
              <StructurePreview rows={preset.rows} />
            </button>
          ))}
        </SimpleGrid>
      )}
    </Modal>
  );
}
