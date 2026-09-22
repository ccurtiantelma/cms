/**
 * Modal "Seleziona la tua struttura" (ADR-33 § 7): selettore a due passi per un nuovo
 * blocco `section` — prima il tipo di layout, poi il preset — fedele a Elementor Pro.
 * Unico proprietario di questa UI: era divisa fra questo modal (cinque preset piatti) e il
 * box inline a due passi di `CanvasAddSectionZone.tsx`; ora è tutta qui, montata da due
 * punti (`BlockPalette.tsx` per la voce "Sezione" del suo menu — quindi raggiungibile anche
 * dalla toolbar integrata di `EditorBlockWrapper.tsx` via "Inserisci sopra/sotto" — e
 * `CanvasAddSectionZone.tsx` per il "+" della zona sempre visibile in fondo al canvas) che
 * condividono lo stesso componente controllato — nessuna copia. Un terzo punto di
 * montaggio, il "+" della `sectionActionTab` di `EditorBlockWrapper.tsx`, è stato rimosso
 * insieme a quella barra (T-canvas-declutter, consolidata nella Handle Bar unica): la
 * stessa azione resta raggiungibile dal primo punto sopra.
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
 * Elementor (screenshot del produttore, non una ricostruzione a memoria): una riga di nove
 * tessere di struttura piatta (colonna/riga direzionali + 7 varianti a colonne, incluse la
 * coppia simmetrica 33/67 e 67/33 — gap-analysis T-editor-refinement: il "66-33" di
 * `SectionColumnRatioValue` era un valore di tipo già valido ma orfano di preset — e la
 * coppia 30/70 e 70/30 aggiunta da RFC-58), più sei tessere a celle annidate/asimmetriche
 * (`GRID_PRESETS`). Le tessere annidate (ADR-39, `container` con
 * `flexDirection`/`styleFlexBasis`) non hanno un equivalente nella prop
 * `columns`/`columnRatio` di `section` — nessuna scorciatoia, nessuna nuova prop: si
 * compone `section` + `container` già approvati, esattamente come la sua ADR li ha
 * pensati. `columnRatio` di `section` produce solo lo split flessibile "33/67"/"67/33", mai
 * le celle annidate — quelle attraversano `buildGridSectionSubtree` sotto.
 *
 * **Tre categorie del primo passo (T-editor-refinement, supera il precedente "fix
 * emergenza" a due tab — quel testo è superato, non più valido, non riportarlo)**: il
 * primo passo espone ora due scelte primarie fedeli a Elementor Pro — "Flexbox" (motore
 * CSS Grid su `section`, `FLEXBOX_PRESETS`/`handleSelectFlexbox`: riga di icone
 * direzionali + riga di preset proporzionali a riempimento grigio, nessun bordo a riposo)
 * e "Riga / Sezione Classica" (stesso motore Grid, stesso `handleSelectFlexbox`, preset
 * diversi — `CLASSIC_PRESETS`: sole miniature a bordo tratteggiato per le suddivisioni
 * fisse, fedeli allo "Select Your Structure" di una Sezione classica, non di un
 * Container). Le sei tessere annidate/asimmetriche (`GRID_PRESETS`, motore Flexbox via
 * `container`) restano disponibili ma non più come scelta primaria: un link testuale in
 * fondo al tab "Flexbox" ("Strutture annidate avanzate") apre `step: 'grid'` invariato —
 * nessuna funzionalità rimossa, solo declassata a scelta secondaria per rispettare
 * l'"esclusivamente" richiesto sul tab classico. `handleSelectFlexbox` è condiviso da
 * `FLEXBOX_PRESETS` e `CLASSIC_PRESETS` (stessa forma `FlexboxPreset`, stesso
 * inserimento piatto `columns`/`columnRatio`): l'unica differenza fra le due categorie è
 * quali preset vengono passati e come si renderizza la tessera (`renderStructureNode`
 * accetta una `variant`: `'filled'` per Flexbox/Griglia annidata — riempimento grigio
 * `#e6e9ec`, nessun bordo a riposo, fedele a Elementor — `'dashed'` per Riga/Sezione
 * Classica — bordo `1px dashed #a4afb7`, nessun riempimento, fedele allo "Select Your
 * Structure" di una Sezione classica).
 *
 * `aria-label`/testo del pulsante "Flexbox" del primo passo restano letteralmente
 * `"Flexbox"` (non "Flexbox Container"): `e2e/tests/helpers/page-editor.ts`
 * (`completeSectionStructureModal`, verificato) e
 * `e2e/tests/page-editor-navigator-layouts.spec.ts` già cercano
 * `getByRole('button', { name: 'Flexbox', exact: true })` seguito dal preset "Colonna" —
 * precedono il "fix emergenza" ora superato sopra e non sono mai stati aggiornati per
 * seguirlo, quindi si aspettavano già la mappatura corretta: cambiare quel testo
 * romperebbe silenziosamente ogni test che inserisce una `section` in tutta la suite E2E.
 */
import { useEffect, useState, type ComponentType } from 'react';
import { ActionIcon, Anchor, Group, Modal, SimpleGrid, Text } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconGridDots,
  IconLayoutColumns,
} from '@tabler/icons-react';
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

/** Passo corrente del selettore: scelta del tipo, poi uno dei tre tab di preset — 'grid' (strutture annidate avanzate) resta raggiungibile da un link secondario dentro 'flexbox', non più dal primo passo. */
type Step = 'chooseType' | 'flexbox' | 'classic' | 'grid';

/** Valori ammessi per `columns`/`columnRatio` (`section.block.ts`): niente oltre questi. */
type SectionColumnsToken = '1' | '2' | '3' | '4';
type SectionColumnRatioValue = 'equal' | '33-66' | '66-33' | '30-70' | '70-30';

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
 * dei valori usati (25/30/33/34/35/40/50/60/65/67/70) è chiuso ed esaurito dalle classi
 * `.w25`…`.w70` di `SectionStructureModal.module.css`, mai un valore libero.
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
    id: '2-30-70',
    label: '2 colonne (30/70)',
    columns: { default: '2' },
    columnRatio: '30-70',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 30 }, { weight: 70 }] }],
  },
  {
    id: '2-70-30',
    label: '2 colonne (70/30)',
    columns: { default: '2' },
    columnRatio: '70-30',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 70 }, { weight: 30 }] }],
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
    rows: [
      { weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 34 }, { weight: 33 }] },
    ],
  },
];

/**
 * Preset del layout "Riga / Sezione Classica": stessa forma `FlexboxPreset` di
 * {@link FLEXBOX_PRESETS} (stesso inserimento piatto `columns`/`columnRatio` via
 * `handleSelectFlexbox`, stesso motore Grid reale — ADR-31), sei suddivisioni fisse
 * (1/2/3/4 colonne uguali + 33/67 + 67/33) rese come tessere a bordo tratteggiato
 * (`variant: 'dashed'` in {@link renderStructureNode}), mai a riempimento grigio: fedeli
 * allo "Select Your Structure" di una Sezione classica di Elementor, distinto per
 * costruzione dal preset proporzionale della Sezione/Container Flexbox sopra — stessi
 * valori `columns`/`columnRatio` già approvati (ADR-31/ADR-33/RFC-58), nessun token nuovo.
 */
const CLASSIC_PRESETS: readonly FlexboxPreset[] = [
  {
    id: 'classic-1',
    label: '1 colonna',
    columns: { default: '1' },
    columnRatio: 'equal',
    rows: [{ weight: 1 }],
  },
  {
    id: 'classic-2-equal',
    label: '2 colonne (50/50)',
    columns: { default: '2' },
    columnRatio: 'equal',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 50 }, { weight: 50 }] }],
  },
  {
    id: 'classic-3-equal',
    label: '3 colonne (33/33/33)',
    columns: { default: '3' },
    columnRatio: 'equal',
    rows: [
      { weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 34 }, { weight: 33 }] },
    ],
  },
  {
    id: 'classic-4-equal',
    label: '4 colonne (25/25/25/25)',
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
    id: 'classic-33-67',
    label: 'Sezione 33/67',
    columns: { default: '2' },
    columnRatio: '33-66',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 67 }] }],
  },
  {
    id: 'classic-67-33',
    label: 'Sezione 67/33',
    columns: { default: '2' },
    columnRatio: '66-33',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 67 }, { weight: 33 }] }],
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

/** Stile di resa della cella foglia: `'filled'` = riempimento grigio `#e6e9ec`, nessun bordo (Flexbox/Griglia annidata); `'dashed'` = nessun riempimento, bordo `1px dashed #a4afb7` (Riga/Sezione Classica). */
type PreviewVariant = 'filled' | 'dashed';

/**
 * Renderizza ricorsivamente l'anteprima proporzionale di una tessera preset, in puro CSS
 * (classi `.w25`…`.w67` per il peso, mai uno `style` inline — vedi doc di
 * {@link StructureNode}). Una foglia (`children` assente) è una cella piena; un ramo apre
 * un nuovo asse flex (`direction`) e ricorre sui figli. `variant` sceglie solo la classe
 * della cella foglia (`.cell`/`.cellDashed`) — i rami restano lo stesso `.branch` per
 * entrambe le varianti, la sola differenza visiva richiesta è sul riempimento della cella.
 */
function renderStructureNode(
  node: StructureNode,
  key: string,
  variant: PreviewVariant,
): JSX.Element {
  const weightClass = styles[`w${node.weight}`] ?? '';
  if (!node.children) {
    const cellClass = variant === 'dashed' ? styles.cellDashed : styles.cell;
    return <div key={key} className={[cellClass, weightClass].join(' ')} />;
  }
  const directionClass = node.direction === 'column' ? styles.directionColumn : styles.directionRow;
  return (
    <div key={key} className={[styles.branch, directionClass, weightClass].join(' ')}>
      {node.children.map((child, childIndex) =>
        renderStructureNode(child, `${key}-${childIndex}`, variant),
      )}
    </div>
  );
}

/** Anteprima completa di una tessera: una colonna di righe (`rows`), stesso principio di {@link renderStructureNode}. `variant` di default `'filled'`: invariato per i chiamanti esistenti (Flexbox/Griglia annidata). */
function StructurePreview({
  rows,
  variant = 'filled',
}: {
  rows: readonly StructureNode[];
  variant?: PreviewVariant;
}): JSX.Element {
  return (
    <div className={styles.previewTile}>
      {rows.map((row, rowIndex) => renderStructureNode(row, `row-${rowIndex}`, variant))}
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
 * ramo → `container` con `flexDirection` sull'asse dichiarato, contenente i figli.
 * `applyFlexBasis`/`node.weight` non producono più alcuna prop scritta sul nodo: `container`
 * v2 (ADR-82) non dichiara `styleFlexBasis`, e `boxedWidth` (unica prop di larghezza rimasta
 * sul registro) è un `max-width` centrato attivo solo quando `contentWidth === 'boxed'`
 * (`Container.tsx`) — scriverci un peso percentuale non produceva alcuna larghezza reale in
 * riga flex, il bug corretto qui (colonne collassate al proprio contenuto minimo invece di
 * dividersi la riga). Il registro non espone oggi alcuna prop di peso per-colonna (ADR-82 §
 * "Conseguenze": l'estensione dell'handle di resize a un peso dedicato è task R2 T4/T5, non
 * ancora fatto) — le colonne di una riga si dividono quindi lo spazio in parti uguali per
 * default CSS (`Container.module.css`/`EditorBlockWrapper.module.css`,
 * `[data-default-direction='row'] > …`), non più per un peso autorevole scritto qui. I preset
 * asimmetrici (33/67 ecc.) restano nell'anteprima della tessera (`renderStructureNode`, sempre
 * proporzionale) ma producono oggi lo stesso 50/50 di un preset "equal" una volta inseriti —
 * limite noto, non introdotto da questa funzione.
 */
function buildCellNode(node: StructureNode): BlockNode {
  if (!CONTAINER_DESCRIPTOR)
    throw new Error('Descrittore "container" assente dal registro blocchi.');
  const props: Record<string, unknown> = { ...defaultPropsFor(CONTAINER_DESCRIPTOR) };

  if (!node.children) {
    return { id: nextPlaceholderId(), type: 'container', props, children: [] };
  }

  // `container` v2 (ADR-82): flexDirection/gap sono consolidati in `layout` (gap `sm` = 8px).
  const gap = { value: 8, unit: 'px' };
  props.layout = {
    default: { display: 'flex', direction: node.direction ?? 'row', gap: { x: gap, y: gap } },
  };
  return {
    id: nextPlaceholderId(),
    type: 'container',
    props,
    children: node.children.map((child) => buildCellNode(child)),
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
    children: preset.rows.map((row) => buildCellNode(row)),
  };
}

/**
 * Righe-colonna reali di un preset piatto con più colonne: la riga `direction: 'row'` di
 * `preset.rows`, oppure (tessera "Riga", senza anteprima a celle) N colonne uguali.
 * `undefined` per una colonna singola, che resta la `section` piatta.
 */
function resolveColumnRows(preset: FlexboxPreset): readonly StructureNode[] | undefined {
  const count = Number(preset.columns.default);
  if (count < 2) return undefined;
  const authored = preset.rows?.filter((row) => row.direction === 'row' && row.children);
  if (authored?.length) return authored;
  const weight = Math.floor(100 / count);
  return [
    { weight: 1, direction: 'row', children: Array.from({ length: count }, () => ({ weight })) },
  ];
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
   * Crea la Section col preset scelto (condiviso da `FLEXBOX_PRESETS` e `CLASSIC_PRESETS`,
   * stessa forma `FlexboxPreset`, stesso inserimento piatto): default del registro,
   * `columns`/`columnRatio` sovrascritti. `addBlockAction` non ritorna l'id del nodo
   * inserito (`void`): si replica qui il clamping dell'indice che lo store applica
   * internamente (`useBlockEditorStore.ts`, `addBlockAction`) per ritrovare il nodo appena
   * creato e scrollarlo in vista.
   */
  function handleSelectFlexbox(preset: FlexboxPreset): void {
    // Più colonne = gerarchia reale Section → Row(container flex) → Column(container): ogni
    // colonna è un nodo selezionabile e una dropzone a sé, i widget ne diventano figli
    // (RFC-F04e Decisione 3(a): nessun tipo nuovo, si compone `container` già approvato).
    const rows = resolveColumnRows(preset);
    if (rows) {
      handleSelectGrid({ id: preset.id, label: preset.label, rows });
      return;
    }

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
        // "Flexbox" a sinistra, "Riga / Sezione Classica" a destra (T-editor-refinement,
        // commento di testa del file, paragrafo "Tre categorie del primo passo"): il testo
        // del pulsante corrisponde ora letteralmente al tab che apre, nessuna inversione —
        // `aria-label`/testo "Flexbox" invariati (contratto E2E pre-esistente, vedi commento
        // di testa).
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
            aria-label="Riga / Sezione Classica"
            onClick={() => setStep('classic')}
          >
            <IconGridDots size={28} />
            <Text size="sm">Riga / Sezione Classica</Text>
          </button>
        </SimpleGrid>
      )}

      {step === 'flexbox' && (
        <>
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
          {/*
            Le sei tessere annidate/asimmetriche (`GRID_PRESETS`) restano raggiungibili da
            qui invece che come terza scelta primaria (T-editor-refinement): nessuna
            funzionalità approvata (RFC-58) rimossa, solo spostata dietro un link secondario
            per rispettare l'"esclusivamente" richiesto sul tab Riga/Sezione Classica sotto.
          */}
          <Group justify="center" mt="sm">
            <Anchor component="button" type="button" size="sm" onClick={() => setStep('grid')}>
              Strutture annidate avanzate
            </Anchor>
          </Group>
        </>
      )}

      {step === 'classic' && (
        <SimpleGrid cols={{ base: 2, xs: 3, sm: 6 }} spacing="xs">
          {CLASSIC_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetButton}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => handleSelectFlexbox(preset)}
            >
              <StructurePreview rows={preset.rows ?? []} variant="dashed" />
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
