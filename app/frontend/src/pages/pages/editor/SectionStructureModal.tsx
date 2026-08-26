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
import { findNode } from './block-tree.utils';
import styles from './SectionStructureModal.module.css';

/** Descrittore `section` del registro (BLOCK_TYPES è statico: calcolato una volta a modulo). */
const SECTION_DESCRIPTOR = BLOCK_TYPES.find((entry) => entry.type === 'section');

/** Passo corrente del selettore a due step. */
type Step = 'chooseType' | 'flexbox' | 'grid';

/** Valori ammessi per `columns`/`columnRatio` (`section.block.ts`): niente oltre questi. */
type SectionColumnsToken = '1' | '2' | '3' | '4';
type SectionColumnRatioValue = 'equal' | '33-66' | '66-33';

/** Forma persistita della prop responsive `columns` (ADR-29). */
interface SectionColumnsValue {
  default: SectionColumnsToken;
}

/** `columns`/`columnRatio` da scrivere sul nodo `section` — comune a ogni preset dei due step. */
interface SectionPresetValue {
  columns: SectionColumnsValue;
  columnRatio: SectionColumnRatioValue;
}

/**
 * Preset del layout "Flexbox". Lo schema di `section` non ha una prop `direction`
 * indipendente dal conteggio colonne (nessun concetto di riga/colonna come asse separato,
 * ADR-21 — un sesto `kind` di prop richiederebbe una nuova firma che non c'è): "Riga" è
 * quindi approssimata alla più piccola disposizione affiancata disponibile (`columns: '2'`,
 * stesso output di "2 colonne (50/50)"), e "Colonna" è l'unico vero 1-colonna disponibile
 * (`columns: '1'`). Scelta dichiarata, non un bug: le due tessere restano distinte in UI
 * (icona direzionale invece dell'anteprima a tracce) pur scrivendo lo stesso preset di un
 * altro tile quando coincidono.
 */
interface FlexboxPreset extends SectionPresetValue {
  id: string;
  label: string;
  /** Solo 'colonna'/'riga': icona direzionale al posto dell'anteprima a tracce. */
  directionIcon?: ComponentType<{ size?: number }>;
  /** Classe dell'anteprima a tracce (assente quando c'è `directionIcon`). */
  gridClassName?: string;
  trackCount?: number;
}

const FLEXBOX_PRESETS: readonly FlexboxPreset[] = [
  {
    id: 'column',
    label: 'Colonna',
    columns: { default: '1' },
    columnRatio: 'equal',
    directionIcon: IconArrowDown,
  },
  { id: 'row', label: 'Riga', columns: { default: '2' }, columnRatio: 'equal', directionIcon: IconArrowRight },
  {
    id: '50-50',
    label: '2 colonne (50/50)',
    columns: { default: '2' },
    columnRatio: 'equal',
    gridClassName: 'grid_twoEqual',
    trackCount: 2,
  },
  {
    id: '33-67',
    label: '2 colonne (33/67)',
    columns: { default: '2' },
    columnRatio: '33-66',
    gridClassName: 'grid_3366',
    trackCount: 2,
  },
  {
    id: '67-33',
    label: '2 colonne (67/33)',
    columns: { default: '2' },
    columnRatio: '66-33',
    gridClassName: 'grid_6633',
    trackCount: 2,
  },
  {
    id: 'col-3',
    label: '3 colonne',
    columns: { default: '3' },
    columnRatio: 'equal',
    gridClassName: 'grid_threeEqual',
    trackCount: 3,
  },
  {
    id: 'col-4',
    label: '4 colonne',
    columns: { default: '4' },
    columnRatio: 'equal',
    gridClassName: 'grid_fourEqual',
    trackCount: 4,
  },
];

/**
 * Preset del layout "Griglia". `decorativeRows` è puramente l'anteprima (una matrice di
 * tracce tratteggiate a due righe per dare l'aspetto "2×2"/"3×2" richiesto): non esiste
 * nessuna prop di riga persistita da nessuna parte — con `columns` fisso, le righe vere di
 * una `section` emergono automaticamente dal CSS Grid quando in futuro vi si trascinano più
 * widget dentro, non da uno stato salvato qui.
 */
interface GridPreset extends SectionPresetValue {
  id: string;
  label: string;
  gridClassName: string;
  decorativeRows: 1 | 2;
}

const GRID_PRESETS: readonly GridPreset[] = [
  {
    id: '2x1',
    label: '2×1',
    columns: { default: '2' },
    columnRatio: 'equal',
    gridClassName: 'grid_twoEqual',
    decorativeRows: 1,
  },
  {
    id: '1x2',
    label: '1×2',
    columns: { default: '1' },
    columnRatio: 'equal',
    gridClassName: 'grid_oneCol',
    decorativeRows: 2,
  },
  {
    id: '2x2',
    label: '2×2',
    columns: { default: '2' },
    columnRatio: 'equal',
    gridClassName: 'grid_twoEqual',
    decorativeRows: 2,
  },
  {
    id: '3x2',
    label: '3×2',
    columns: { default: '3' },
    columnRatio: 'equal',
    gridClassName: 'grid_threeEqual',
    decorativeRows: 2,
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

/** Modal di selezione del preset di struttura per una nuova `section` (ADR-33 § 7). */
export default function SectionStructureModal({
  opened,
  onClose,
  parentId,
  index,
}: SectionStructureModalProps): JSX.Element {
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const [step, setStep] = useState<Step>('chooseType');

  // Le tre chiamate di questo modal (`BlockPalette`, `CanvasAddSectionZone`,
  // `EditorBlockWrapper`) riusano tutte la stessa istanza di stato locale fra un'apertura e
  // l'altra: senza questo reset, una sessione lasciata al passo "flexbox"/"grid" riaprirebbe
  // lì invece che dalla scelta del tipo.
  useEffect(() => {
    if (opened) setStep('chooseType');
  }, [opened]);

  /**
   * Crea la Section col preset scelto: default del registro, `columns`/`columnRatio`
   * sovrascritti. `addBlockAction` non ritorna l'id del nodo inserito (`void`): si replica
   * qui il clamping dell'indice che lo store applica internamente (`useBlockEditorStore.ts`,
   * `addBlockAction`) per ritrovare il nodo appena creato e scrollarlo in vista.
   */
  function handleSelect(preset: SectionPresetValue): void {
    const baseProps = SECTION_DESCRIPTOR ? defaultPropsFor(SECTION_DESCRIPTOR) : {};
    addBlockAction(parentId, 'section', index, {
      ...baseProps,
      columns: preset.columns,
      columnRatio: preset.columnRatio,
    });

    const tree = useBlockEditorStore.getState().tree;
    const siblings = parentId === null ? tree : (findNode(tree, parentId)?.children ?? []);
    const clampedIndex = Math.max(0, Math.min(index, siblings.length - 1));
    const insertedId = siblings[clampedIndex]?.id;

    setStep('chooseType');
    onClose();

    // Il modal si chiude e il wrapper del nuovo blocco ha bisogno di un giro di render per
    // montarsi/aggiornarsi: senza rimandare lo scroll al frame successivo, il `querySelector`
    // di `scrollBlockIntoView` cercherebbe un nodo non ancora nel DOM.
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
            <IconGridDots size={28} />
            <Text size="sm">Griglia</Text>
          </button>
        </SimpleGrid>
      )}

      {step === 'flexbox' && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          {FLEXBOX_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetButton}
              aria-label={preset.label}
              onClick={() => handleSelect(preset)}
            >
              {preset.directionIcon ? (
                <div className={styles.directionIconBox}>
                  <preset.directionIcon size={24} />
                </div>
              ) : (
                <div className={[styles.previewBox, styles[preset.gridClassName ?? '']].join(' ')}>
                  {Array.from({ length: preset.trackCount ?? 0 }).map((_, trackIndex) => (
                    <div key={trackIndex} className={styles.track} />
                  ))}
                </div>
              )}
              <Text size="xs" ta="center">
                {preset.label}
              </Text>
            </button>
          ))}
        </SimpleGrid>
      )}

      {step === 'grid' && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          {GRID_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetButton}
              aria-label={preset.label}
              onClick={() => handleSelect(preset)}
            >
              <div
                className={[
                  styles.previewBox,
                  styles[preset.gridClassName],
                  preset.decorativeRows === 2 ? styles.previewRows2 : styles.previewRows1,
                ].join(' ')}
              >
                {Array.from({ length: Number(preset.columns) * preset.decorativeRows }).map(
                  (_, trackIndex) => (
                    <div key={trackIndex} className={styles.track} />
                  ),
                )}
              </div>
              <Text size="xs" ta="center">
                {preset.label}
              </Text>
            </button>
          ))}
        </SimpleGrid>
      )}
    </Modal>
  );
}
