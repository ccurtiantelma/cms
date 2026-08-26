/**
 * Zona di inserimento sezione, sempre visibile in-canvas (sostituisce il vecchio popover
 * "Aggiungi blocco in fondo", `BlockPalette` montata da `EditorCanvas.tsx`): un box
 * tratteggiato con due trigger — "+" e libreria template — fedele a Elementor Pro.
 *
 * Trigger statico, nessuno stato di selezione locale: la scelta del tipo di layout e del
 * preset non vive più qui, è stata spostata in `SectionStructureModal.tsx` (un unico
 * componente condiviso da questa zona, da `BlockPalette.tsx` e da `EditorBlockWrapper.tsx`
 * — nessuna copia della UI di selezione). Questo componente si limita ad aprire/chiudere
 * quel modal e il `TemplateLibraryModal`, entrambi controllati da uno `useState` booleano
 * locale ciascuno: due istanze di questo componente (una in fondo al canvas, una per ogni
 * Section via "+" nella `sectionActionTab`) restano indipendenti per costruzione, ognuna col
 * proprio stato.
 */
import { useState } from 'react';
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { IconFolder, IconPlus } from '@tabler/icons-react';
import SectionStructureModal from './SectionStructureModal';
import TemplateLibraryModal from './TemplateLibraryModal';
import styles from './CanvasAddSectionZone.module.css';

interface CanvasAddSectionZoneProps {
  /** Contenitore di destinazione della nuova Section: `null` = radice dell'albero. */
  parentId: string | null;
  /** Posizione di inserimento fra i figli del contenitore di destinazione. */
  index: number;
}

/** Zona di drop "Aggiungi sezione": apre il selettore di struttura o la libreria template. */
export default function CanvasAddSectionZone({
  parentId,
  index,
}: CanvasAddSectionZoneProps): JSX.Element {
  const [sectionModalOpened, setSectionModalOpened] = useState(false);
  const [templateLibraryOpened, setTemplateLibraryOpened] = useState(false);

  return (
    // Un click qui dentro non deve deselezionare via il click-through dello sfondo del
    // canvas (`onClick={() => selectNode(null)}` in `EditorCanvas.tsx`): stesso idioma già
    // in uso in questo modulo per `BlockPalette`/`EditorBlockWrapper`.
    <div className={styles.zone} onClick={(event) => event.stopPropagation()}>
      <div className={styles.box}>
        <Group justify="center" gap="md" mb="sm">
          <Tooltip label="Scegli la struttura della sezione" withArrow>
            <ActionIcon
              variant="filled"
              radius="xl"
              size="xl"
              className={styles.addButton}
              aria-label="Scegli la struttura della sezione"
              onClick={() => setSectionModalOpened(true)}
            >
              <IconPlus size={22} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Libreria template" withArrow>
            <ActionIcon
              variant="light"
              color="gray"
              radius="xl"
              size="xl"
              aria-label="Libreria template"
              onClick={() => setTemplateLibraryOpened(true)}
            >
              <IconFolder size={22} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text size="sm" fs="italic" c="dimmed" ta="center">
          Trascina il widget qui
        </Text>
      </div>

      <SectionStructureModal
        opened={sectionModalOpened}
        onClose={() => setSectionModalOpened(false)}
        parentId={parentId}
        index={index}
      />

      <TemplateLibraryModal
        opened={templateLibraryOpened}
        onClose={() => setTemplateLibraryOpened(false)}
        parentId={parentId}
        index={index}
      />
    </div>
  );
}
