/**
 * Modal "Seleziona la tua struttura" per una nuova riga, fedele al Flexbox/Grid Container di
 * Elementor Pro (ADR-100 punto 1): primo passo "Flexbox" o "Griglia", poi il preset. Ogni
 * preset inserisce **solo** nodi `container` (`section` è deprecata, ADR-82): un container
 * genitore boxed con i container figli (colonne) direttamente dentro — nessuna riga
 * intermedia. Le colonne portano la propria `width` in `%` (ADR-100 punto 2), quindi un
 * preset 33/67 produce davvero 33/67; su mobile le colonne vanno al 100% e il genitore
 * passa a `direction: column` (stesso default di Elementor).
 *
 * Montato da `BlockPalette.tsx` (voce "Sezione", quindi anche "Inserisci sopra/sotto" della
 * toolbar di `EditorBlockWrapper.tsx`) e da `CanvasAddSectionZone.tsx`; il componente è
 * controllato e condiviso, nessuna copia. Le strutture annidate (`NESTED_PRESETS`) restano
 * dietro il link secondario "Strutture annidate avanzate" del passo Flexbox.
 *
 * `aria-label` "Flexbox", "Colonna" e "2 colonne" sono letti dagli E2E
 * (`e2e/tests/helpers/page-editor.ts`, `page-editor-navigator-layouts.spec.ts`): non
 * rinominarli.
 */
import { useEffect, useState, type ComponentType } from 'react';
import { ActionIcon, Anchor, Group, Modal, SimpleGrid, Text } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconLayoutColumns,
  IconLayoutGrid,
} from '@tabler/icons-react';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
// Da `block-registry.utils.ts`, non da `./BlockPalette`: `BlockPalette` monta questo
// stesso modal, un import nell'altro verso creerebbe un ciclo fra i due moduli.
import { defaultPropsFor } from './block-registry.utils';
import type { BlockNode } from './block-tree.utils';
import styles from './SectionStructureModal.module.css';

/** Descrittore del registro (BLOCK_TYPES è statico: calcolato una volta a modulo). */
const CONTAINER_DESCRIPTOR = BLOCK_TYPES.find((entry) => entry.type === 'container');

/** Passo corrente: scelta del tipo, poi i preset Flexbox o Griglia; 'nested' dal link secondario. */
type Step = 'chooseType' | 'flexbox' | 'grid' | 'nested';

/**
 * Nodo dell'anteprima proporzionale: lo stesso spec disegna la tessera
 * (`renderStructureNode`) e costruisce il sottoalbero inserito (`buildChild`), una sola fonte
 * delle proporzioni. Foglia = nessun `children`; ramo = `direction` + `children`. `weight` è
 * il `flex-grow` dell'anteprima e la `width` in `%` della colonna reale; i valori usati
 * (25/30/33/34/35/40/50/60/65/67/70) sono chiusi dalle classi `.w25`…`.w70` di
 * `SectionStructureModal.module.css`.
 */
interface StructureNode {
  weight: number;
  direction?: 'row' | 'column';
  children?: readonly StructureNode[];
}

/** Preset Flexbox: un container genitore, in colonna/riga, o con N colonne affiancate. */
interface FlexboxPreset {
  id: string;
  label: string;
  /** Solo 'colonna'/'riga': icona direzionale, container singolo senza figli. */
  directionIcon?: ComponentType<{ size?: number }>;
  direction?: 'row' | 'column';
  /** Una sola riga `direction: 'row'` con le colonne. Assente con `directionIcon`. */
  rows?: readonly StructureNode[];
}

const FLEXBOX_PRESETS: readonly FlexboxPreset[] = [
  {
    id: 'column',
    label: 'Colonna',
    directionIcon: IconArrowDown,
    direction: 'column',
  },
  {
    id: 'row',
    label: 'Riga',
    directionIcon: IconArrowRight,
    direction: 'row',
  },
  {
    id: '2-equal',
    label: '2 colonne',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 50 }, { weight: 50 }] }],
  },
  {
    id: '2-33-67',
    label: '2 colonne (33/67)',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 67 }] }],
  },
  {
    id: '2-67-33',
    label: '2 colonne (67/33)',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 67 }, { weight: 33 }] }],
  },
  {
    id: '2-30-70',
    label: '2 colonne (30/70)',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 30 }, { weight: 70 }] }],
  },
  {
    id: '2-70-30',
    label: '2 colonne (70/30)',
    rows: [{ weight: 1, direction: 'row', children: [{ weight: 70 }, { weight: 30 }] }],
  },
  {
    id: '4-equal',
    label: '4 colonne',
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
    rows: [
      { weight: 1, direction: 'row', children: [{ weight: 33 }, { weight: 34 }, { weight: 33 }] },
    ],
  },
];

/** Preset Griglia (Elementor Grid Container): un solo container `display: grid`, una cella per traccia. */
interface GridPreset {
  id: string;
  label: string;
  columns: number;
  rows: number;
}

const GRID_PRESETS: readonly GridPreset[] = [
  { id: 'grid-2x1', label: 'Griglia 2×1', columns: 2, rows: 1 },
  { id: 'grid-3x1', label: 'Griglia 3×1', columns: 3, rows: 1 },
  { id: 'grid-4x1', label: 'Griglia 4×1', columns: 4, rows: 1 },
  { id: 'grid-2x2', label: 'Griglia 2×2', columns: 2, rows: 2 },
  { id: 'grid-3x2', label: 'Griglia 3×2', columns: 3, rows: 2 },
  { id: 'grid-4x2', label: 'Griglia 4×2', columns: 4, rows: 2 },
];

/** Pesi uguali per l'anteprima di `count` colonne, dentro le classi `.w25`/`.w33`/`.w34`/`.w50`. */
function equalWeights(count: number): StructureNode[] {
  if (count === 3) return [{ weight: 33 }, { weight: 34 }, { weight: 33 }];
  return Array.from({ length: count }, () => ({ weight: Math.floor(100 / count) }));
}

function gridPreviewRows(preset: GridPreset): StructureNode[] {
  return Array.from({ length: preset.rows }, () => ({
    weight: 1,
    direction: 'row' as const,
    children: equalWeights(preset.columns),
  }));
}

/** Strutture annidate avanzate: righe impilate, celle annidate/asimmetriche. */
interface NestedPreset {
  id: string;
  label: string;
  rows: readonly StructureNode[];
}

const NESTED_PRESETS: readonly NestedPreset[] = [
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
  /** Contenitore di destinazione della nuova riga: `null` = radice dell'albero. */
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
 * principio già in uso per `CONTAINER_DESCRIPTOR`/`defaultPropsFor` sopra.
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

/** Gap di default fra colonne/celle, come il default di Elementor (20px). */
const GAP = { value: 20, unit: 'px' };
const FULL_WIDTH = { value: 100, unit: '%' };

function containerNode(props: Record<string, unknown>, children: BlockNode[] = []): BlockNode {
  if (!CONTAINER_DESCRIPTOR)
    throw new Error('Descrittore "container" assente dal registro blocchi.');
  return {
    id: nextPlaceholderId(),
    type: 'container',
    props: { ...defaultPropsFor(CONTAINER_DESCRIPTOR), ...props },
    children,
  };
}

/** `layout` flex responsive: una riga su desktop torna una colonna su mobile. */
function flexLayout(direction: 'row' | 'column'): Record<string, unknown> {
  const base = { display: 'flex', direction, gap: { x: GAP, y: GAP } };
  return direction === 'row'
    ? { default: base, mobile: { ...base, direction: 'column' } }
    : { default: base };
}

/**
 * Container figlio (colonna o riga annidata), sempre `contentWidth: 'full'` come i container
 * annidati di Elementor (ADR-100 punto 5). Dentro un genitore in riga riceve la `width` del
 * proprio peso, 100% su mobile.
 */
function buildChild(node: StructureNode, parentDirection: 'row' | 'column'): BlockNode {
  const props: Record<string, unknown> = { contentWidth: 'full' };
  if (parentDirection === 'row') {
    props.width = { default: { value: node.weight, unit: '%' }, mobile: FULL_WIDTH };
  }
  if (!node.children) return containerNode(props);
  const direction = node.direction ?? 'row';
  props.layout = flexLayout(direction);
  return containerNode(
    props,
    node.children.map((child) => buildChild(child, direction)),
  );
}

/** Radice di un preset Flexbox: container boxed, con le colonne come figli diretti. */
function buildFlexboxSubtree(preset: FlexboxPreset): BlockNode {
  const columns = preset.rows?.find((row) => row.direction === 'row' && row.children)?.children;
  if (!columns) {
    return containerNode({
      contentWidth: 'boxed',
      layout: flexLayout(preset.direction ?? 'column'),
    });
  }
  return containerNode(
    { contentWidth: 'boxed', layout: flexLayout('row') },
    columns.map((column) => buildChild(column, 'row')),
  );
}

/** Radice di un preset Griglia: un container `display: grid`, una cella vuota per traccia, 1 colonna su mobile. */
function buildGridSubtree(preset: GridPreset): BlockNode {
  const grid = {
    display: 'grid',
    gridTemplateColumns: { preset: 'repeat', count: preset.columns },
    gridTemplateRows: { preset: 'repeat', count: preset.rows },
    gap: { x: GAP, y: GAP },
  };
  const layout = {
    default: grid,
    mobile: { ...grid, gridTemplateColumns: { preset: 'repeat', count: 1 } },
  };
  const cells = Array.from({ length: preset.columns * preset.rows }, () =>
    containerNode({ contentWidth: 'full' }),
  );
  return containerNode({ contentWidth: 'boxed', layout }, cells);
}

/** Radice di una struttura annidata: container boxed in colonna, una riga per voce di `rows`. */
function buildNestedSubtree(preset: NestedPreset): BlockNode {
  return containerNode(
    { contentWidth: 'boxed', layout: flexLayout('column') },
    preset.rows.map((row) => buildChild(row, 'column')),
  );
}

/** Modal di selezione della struttura di una nuova riga (ADR-100 punto 1). */
export default function SectionStructureModal({
  opened,
  onClose,
  parentId,
  index,
}: SectionStructureModalProps): JSX.Element {
  const insertSubtreeAction = useBlockEditorStore((state) => state.insertSubtreeAction);
  const [step, setStep] = useState<Step>('chooseType');

  // I punti di montaggio riusano la stessa istanza di stato locale fra un'apertura e l'altra:
  // senza questo reset, una sessione lasciata a metà riaprirebbe lì invece che dal primo passo.
  useEffect(() => {
    if (opened) setStep('chooseType');
  }, [opened]);

  /**
   * Inserisce il sottoalbero e chiude. `insertSubtreeAction` seleziona già la radice
   * inserita; lo scroll aspetta un frame perché il wrapper del nuovo nodo sia nel DOM.
   */
  function insert(subtree: BlockNode): void {
    insertSubtreeAction(parentId, index, subtree);
    const insertedId = useBlockEditorStore.getState().selectedId ?? undefined;
    setStep('chooseType');
    onClose();
    if (insertedId) {
      requestAnimationFrame(() => scrollBlockIntoView(insertedId));
    }
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
            <IconLayoutGrid size={28} />
            <Text size="sm">Griglia</Text>
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
                onClick={() => insert(buildFlexboxSubtree(preset))}
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
          <Group justify="center" mt="sm">
            <Anchor component="button" type="button" size="sm" onClick={() => setStep('nested')}>
              Strutture annidate avanzate
            </Anchor>
          </Group>
        </>
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
              onClick={() => insert(buildGridSubtree(preset))}
            >
              <StructurePreview rows={gridPreviewRows(preset)} variant="dashed" />
            </button>
          ))}
        </SimpleGrid>
      )}

      {step === 'nested' && (
        <SimpleGrid cols={{ base: 2, xs: 3, sm: 6 }} spacing="xs">
          {NESTED_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetButton}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => insert(buildNestedSubtree(preset))}
            >
              <StructurePreview rows={preset.rows} />
            </button>
          ))}
        </SimpleGrid>
      )}
    </Modal>
  );
}
