/**
 * Zona di inserimento sezione, sempre visibile in-canvas (sostituisce il vecchio popover
 * "Aggiungi blocco in fondo", `BlockPalette` montata da `EditorCanvas.tsx`): un box
 * tratteggiato con tre trigger — "+" struttura, libreria template, "Aggiungi widget" —
 * fedele a Elementor Pro (restyle colori/icone, richiesta esplicita del task).
 *
 * Trigger statico, nessuno stato di selezione locale: la scelta del tipo di layout e del
 * preset non vive più qui, è stata spostata in `SectionStructureModal.tsx` (un unico
 * componente condiviso da questa zona e da `BlockPalette.tsx` — nessuna copia della UI di
 * selezione). Questo componente si limita ad aprire/chiudere quel modal e il
 * `TemplateLibraryModal`, entrambi controllati da uno `useState` booleano locale ciascuno.
 * Una sola istanza in tutto l'editor, montata da `EditorCanvas.tsx` in fondo al canvas:
 * l'istanza che `EditorBlockWrapper.tsx` montava sopra ogni Section (aperta dal "+" della
 * `sectionActionTab`) è stata rimossa insieme a quella barra (T-canvas-declutter,
 * consolidata nella Handle Bar unica) — la stessa azione resta raggiungibile dalla voce
 * "Sezione" del menu "Inserisci sopra/sotto" (`BlockPalette`, montata dalla toolbar
 * integrata di `EditorBlockWrapper.tsx`).
 *
 * Terzo trigger ("Aggiungi widget", icona `IconSparkles`): stesso menu di inserimento
 * blocco già montato altrove nel canvas (`BlockPalette`, radice dell'albero) — riusato qui
 * in modalità icona con trigger personalizzato (`triggerIcon`/`triggerClassName`), nessuna
 * copia della logica di filtro/inserimento tipi.
 */
import { useState } from 'react';
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { IconFolder, IconPlus, IconSparkles } from '@tabler/icons-react';
import BlockPalette from './BlockPalette';
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
        {/* `gap={0}`: la spaziatura fra i tre pulsanti circolari è `margin: 0 6px` su
            ciascuno (`.addButton`/`.templateButton`/`.widgetButton`,
            CanvasAddSectionZone.module.css) — valore letterale della spec, non più il
            `gap` di `Group`. */}
        <Group justify="center" gap={0} mb="sm">
          <Tooltip label="Scegli la struttura della sezione" withArrow>
            <ActionIcon
              variant="filled"
              radius="xl"
              className={styles.addButton}
              aria-label="Scegli la struttura della sezione"
              onClick={() => setSectionModalOpened(true)}
            >
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Libreria template" withArrow>
            <ActionIcon
              variant="filled"
              radius="xl"
              className={styles.templateButton}
              aria-label="Libreria template"
              onClick={() => setTemplateLibraryOpened(true)}
            >
              <IconFolder size={20} />
            </ActionIcon>
          </Tooltip>
          <BlockPalette
            parentId={parentId}
            index={index}
            label="Aggiungi widget"
            iconOnly
            variant="filled"
            triggerIcon={IconSparkles}
            triggerClassName={styles.widgetButton}
          />
        </Group>
        <Text className={styles.helperText}>Trascina il widget qui</Text>
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
