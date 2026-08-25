/**
 * Modal "Seleziona la tua struttura" (ADR-33 § 7): cinque preset visivi per un nuovo
 * blocco `section`, ognuno un box tratteggiato con anteprima proporzionale in puro CSS
 * (nessuna libreria nuova). Componente frontend puro nella palette, stesso principio di
 * `WidgetPalette`/`BlockPalette` (ADR-32 § 4): la selezione chiama `addBlockAction` già
 * esistente con un nodo `section` pre-popolato (`columns` + `columnRatio` del preset
 * sovrascritti sopra i default del descrittore), nessuna azione nuova nello store.
 *
 * Supera esplicitamente ADR-31 Decisione 6 ("nessun selettore visivo a icone in questo
 * round"): quel rinvio era condizionato all'assenza di dati per pilotare un box
 * asimmetrico — `columnRatio` (ADR-33 § 2) fornisce ora quel dato.
 */
import { Modal, SimpleGrid, Text } from '@mantine/core';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
// Da `block-registry.utils.ts`, non da `./BlockPalette`: `BlockPalette` monta questo
// stesso modal per la voce "Sezione" del suo menu (ADR-33 § 7), un import nell'altro
// verso creerebbe un ciclo fra i due moduli.
import { defaultPropsFor } from './block-registry.utils';
import styles from './SectionStructureModal.module.css';

/** Descrittore `section` del registro (BLOCK_TYPES è statico: calcolato una volta a modulo). */
const SECTION_DESCRIPTOR = BLOCK_TYPES.find((entry) => entry.type === 'section');

/** Un preset di struttura: `columns`/`columnRatio` da scrivere, più la resa dell'anteprima. */
interface StructurePreset {
  id: string;
  label: string;
  columns: '1' | '2' | '3';
  columnRatio: 'equal' | '33-66' | '66-33';
  /** Classe CSS Module che fissa le larghezze delle tracce dell'anteprima (mai `style` inline). */
  gridClassName: keyof typeof styles;
  /** Numero di tracce da renderizzare nell'anteprima (una per colonna del preset). */
  trackCount: number;
}

const PRESETS: readonly StructurePreset[] = [
  {
    id: '1-col',
    label: '1 colonna',
    columns: '1',
    columnRatio: 'equal',
    gridClassName: 'grid_oneCol',
    trackCount: 1,
  },
  {
    id: '2-col-equal',
    label: '2 colonne uguali',
    columns: '2',
    columnRatio: 'equal',
    gridClassName: 'grid_twoEqual',
    trackCount: 2,
  },
  {
    id: '3-col-equal',
    label: '3 colonne uguali',
    columns: '3',
    columnRatio: 'equal',
    gridClassName: 'grid_threeEqual',
    trackCount: 3,
  },
  {
    id: '33-66',
    label: '33 / 66',
    columns: '2',
    columnRatio: '33-66',
    gridClassName: 'grid_3366',
    trackCount: 2,
  },
  {
    id: '66-33',
    label: '66 / 33',
    columns: '2',
    columnRatio: '66-33',
    gridClassName: 'grid_6633',
    trackCount: 2,
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

/** Modal di selezione del preset di struttura per una nuova `section` (ADR-33 § 7). */
export default function SectionStructureModal({
  opened,
  onClose,
  parentId,
  index,
}: SectionStructureModalProps): JSX.Element {
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);

  /** Crea la Section col preset scelto: default del registro, `columns`/`columnRatio` sovrascritti. */
  function handleSelect(preset: StructurePreset): void {
    const baseProps = SECTION_DESCRIPTOR ? defaultPropsFor(SECTION_DESCRIPTOR) : {};
    addBlockAction(parentId, 'section', index, {
      ...baseProps,
      columns: preset.columns,
      columnRatio: preset.columnRatio,
    });
    onClose();
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Seleziona la tua struttura" size="lg" centered>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.presetButton}
            aria-label={preset.label}
            onClick={() => handleSelect(preset)}
          >
            <div className={[styles.previewBox, styles[preset.gridClassName]].join(' ')}>
              {Array.from({ length: preset.trackCount }).map((_, trackIndex) => (
                <div key={trackIndex} className={styles.track} />
              ))}
            </div>
            <Text size="sm" ta="center">
              {preset.label}
            </Text>
          </button>
        ))}
      </SimpleGrid>
    </Modal>
  );
}
