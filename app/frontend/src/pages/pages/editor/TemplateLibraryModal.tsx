/**
 * Modal "Libreria Sezioni" (ADR-34): libreria di preset statici di `section` pronti
 * all'uso — alternativa a "Seleziona la tua struttura" (`SectionStructureModal`, ADR-33
 * § 7), mai annidata a quella: l'utente sceglie fra una `section` vuota e una preimpostata,
 * non le due modal in sequenza (ADR-34 § 5). Componente frontend puro nella cartella
 * `pages/pages/editor/`, stesso principio di `WidgetPalette`/`SectionStructureModal`
 * (ADR-32 § 4 / ADR-33 § 7).
 *
 * Tab singola "Sezioni Predefinite": nessun placeholder per tab future (ADR-34 § 5, "le
 * altre tab restano fuori scope") — il titolo del `Modal` porta già quell'informazione, una
 * `Tabs` a una sola voce sarebbe solo peso visivo senza funzione.
 *
 * Fonte dei preset: `static-section-presets.json`, importato staticamente (nessuna chiamata
 * di rete, ADR-34 § 1). Ogni preset è risolto contro il registro (`resolvePresetSubtree`)
 * al momento della selezione, non al modulo: il registro non cambia durante la sessione di
 * editing, ma risolvere solo on-demand tiene l'eventuale eccezione di un preset
 * disallineato (registro evoluto senza aggiornare il file statico) vicina al click che
 * l'ha causata, non a un side-effect di import.
 */
import { Modal, SimpleGrid, Text } from '@mantine/core';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { resolvePresetSubtree, type SectionPreset } from './block-registry.utils';
import rawPresets from './static-section-presets.json';
import styles from './TemplateLibraryModal.module.css';

// `resolveJsonModule` (tsconfig.json) infila i valori letterali del file: la forma reale è
// `SectionPreset[]` (ADR-34 § 1), qui riaffermata esplicitamente perché il file è manutenuto
// a mano e non generato da uno schema.
const PRESETS = rawPresets as SectionPreset[];

interface TemplateLibraryModalProps {
  /** Stato di apertura, controllato dal chiamante. */
  opened: boolean;
  onClose: () => void;
  /** Contenitore di destinazione del preset: `null` = radice dell'albero. */
  parentId: string | null;
  /** Posizione di inserimento fra i figli del contenitore di destinazione. */
  index: number;
}

/** Modal di selezione di un preset di Sezione dalla libreria statica (ADR-34). */
export default function TemplateLibraryModal({
  opened,
  onClose,
  parentId,
  index,
}: TemplateLibraryModalProps): JSX.Element {
  const insertSubtreeAction = useBlockEditorStore((state) => state.insertSubtreeAction);

  /** Risolve il preset scelto contro il registro e lo inserisce nel punto di apertura. */
  function handleSelect(preset: SectionPreset): void {
    const resolved = resolvePresetSubtree(preset.subtree);
    insertSubtreeAction(parentId, index, resolved);
    onClose();
  }

  return (
    // zIndex sopra la chrome full-screen dell'editor (z-index 1000,
    // FullScreenEditorLayout.module.css), stesso valore/stesso motivo di
    // `CreateTranslationModal.tsx` e dei `ConfirmModal` di `BlockEditorPanel.tsx`/
    // `PagePageDetail.tsx`: senza, il Modal di Mantine monta al suo z-index di default
    // (200) e resta invisibile dietro l'overlay, pur essendo aperto (bug: il pulsante
    // "Libreria sezioni" della topbar sembrava non rispondere al click).
    <Modal
      opened={opened}
      onClose={onClose}
      title="Libreria Sezioni"
      size="lg"
      centered
      zIndex={1100}
    >
      <Text size="sm" c="dimmed" mb="md">
        Sezioni Predefinite
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.presetButton}
            aria-label={preset.label}
            onClick={() => handleSelect(preset)}
          >
            <Text size="sm" fw={600} ta="center">
              {preset.label}
            </Text>
          </button>
        ))}
      </SimpleGrid>
    </Modal>
  );
}
