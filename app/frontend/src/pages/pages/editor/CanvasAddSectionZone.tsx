/**
 * Trigger di inserimento sezione, sempre visibile in-canvas: tre pulsanti compatti — "+"
 * struttura, libreria template, importa preset — spostati nella riga sticky del breadcrumb
 * in fondo al canvas (`CanvasBreadcrumbBar`, `EditorCanvasThemeFrame.tsx`), allineati a
 * destra, icone ridotte coerenti con quelle della topbar (T-canvas-declutter-2: il box
 * tratteggiato "Trascina il widget qui" che li ospitava è stato rimosso — ingombro verticale
 * permanente non più necessario ora che i tre trigger vivono nella barra sempre visibile).
 *
 * Trigger statico, nessuno stato di selezione locale: la scelta del tipo di layout e del
 * preset non vive più qui, è stata spostata in `SectionStructureModal.tsx` (un unico
 * componente condiviso da questa zona e da `BlockPalette.tsx` — nessuna copia della UI di
 * selezione). Questo componente si limita ad aprire/chiudere quel modal e il
 * `TemplateLibraryModal`, entrambi controllati da uno `useState` booleano locale ciascuno.
 * Una sola istanza in tutto l'editor, montata da `CanvasBreadcrumbBar`
 * (`EditorCanvasThemeFrame.tsx`): l'istanza che `EditorBlockWrapper.tsx` montava sopra ogni
 * Section (aperta dal "+" della `sectionActionTab`) è stata rimossa insieme a quella barra
 * (T-canvas-declutter, consolidata nella Handle Bar unica) — la stessa azione resta
 * raggiungibile dalla voce "Sezione" del menu "Inserisci sopra/sotto" (`BlockPalette`,
 * montata dalla toolbar integrata di `EditorBlockWrapper.tsx`).
 */
import { useRef, useState, type ChangeEvent } from 'react';
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileImport, IconFolder, IconPlus } from '@tabler/icons-react';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import SectionStructureModal from './SectionStructureModal';
import TemplateLibraryModal from './TemplateLibraryModal';
import { importJsonFile } from './utils/template-io.utils';
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
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const insertSubtreeAction = useBlockEditorStore((state) => state.insertSubtreeAction);
  const rootBlocksCount = useBlockEditorStore((state) => state.tree.length);

  function handleImportPreset(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importJsonFile(typeof reader.result === 'string' ? reader.result : '');
      if (result.ok) {
        insertSubtreeAction(parentId, parentId === null ? rootBlocksCount : index, result.subtree);
      } else {
        notifications.show({
          color: 'red',
          title: 'Importazione non riuscita',
          message: result.error,
        });
      }
    };
    reader.readAsText(file);
  }

  return (
    // Un click qui dentro non deve deselezionare via il click-through dello sfondo del
    // canvas (`onClick={() => selectNode(null)}` in `EditorCanvas.tsx`): stesso idioma già
    // in uso in questo modulo per `BlockPalette`/`EditorBlockWrapper`.
    <div className={styles.zone} onClick={(event) => event.stopPropagation()}>
      {/* `gap={4}`: spaziatura compatta fra i tre pulsanti, coerente con le icone della
          topbar (`Toolbar.tsx`) ora che questo trigger vive nella riga sticky del
          breadcrumb invece che nel box tratteggiato rimosso. */}
      <Group gap={4} wrap="nowrap">
        <Tooltip label="Scegli la struttura della sezione" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            className={styles.addButton}
            aria-label="Scegli la struttura della sezione"
            onClick={() => setSectionModalOpened(true)}
          >
            <IconPlus size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Libreria template" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            className={styles.templateButton}
            aria-label="Libreria template"
            onClick={() => setTemplateLibraryOpened(true)}
          >
            <IconFolder size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Importa preset" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            className={styles.importButton}
            aria-label="Importa preset"
            onClick={() => importFileInputRef.current?.click()}
          >
            <IconFileImport size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

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
      <input
        ref={importFileInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={handleImportPreset}
      />
    </div>
  );
}
