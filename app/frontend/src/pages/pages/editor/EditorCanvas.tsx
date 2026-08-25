/**
 * Canvas dell'editor (PLAN-F04-editor-visivo.md T4): l'albero della bozza renderizzato
 * con i componenti di F02 e decorato dalla chrome di `EditorBlockWrapper`.
 *
 * Sottoscrive **solo gli id dei nodi di radice** (`useShallow`): la modifica di una prop
 * o l'aggiunta di un figlio dentro una sezione non fa ri-renderizzare il canvas, ma il
 * solo wrapper interessato (NFR § Performance — editor).
 *
 * Il `DndContext` di dnd-kit (PLAN-F04c-editor-maturo.md T7) non vive più qui: da quando la
 * sidebar Widgets (`EditorSidebar`) è una sorgente di drag, il primo antenato comune fra
 * sidebar e canvas è `FullScreenEditorLayout`, che ora lo ospita — vedi il commento di testa
 * di quel file.
 *
 * Lo stato vuoto ("nessun blocco") è anche una drop-zone (`useDroppable`, id
 * `root-empty-dropzone`, stesso schema dati `{ parentId, index }` letto da
 * `FullScreenEditorLayout.handleDragEnd`): senza un nodo già in radice non c'è nessuna
 * striscia `before`/`after` di `EditorBlockWrapper` su cui rilasciare il primo blocco.
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ActionIcon, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useDroppable } from '@dnd-kit/core';
import { notifications } from '@mantine/notifications';
import { IconFolder, IconPlus, IconSparkles } from '@tabler/icons-react';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import BlockPalette from './BlockPalette';
import EditorBlockWrapper from './EditorBlockWrapper';
import SectionStructureModal from './SectionStructureModal';
import TemplateLibraryModal from './TemplateLibraryModal';
import styles from './EditorCanvas.module.css';

/** Superficie di editing dell'albero di blocchi della bozza corrente. */
export default function EditorCanvas(): JSX.Element {
  const rootIds = useBlockEditorStore(useShallow((state) => state.tree.map((node) => node.id)));
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const { setNodeRef: setEmptyDropRef, isOver: isOverEmpty } = useDroppable({
    id: 'root-empty-dropzone',
    data: { parentId: null, index: 0 },
  });
  // ADR-33 § 7: il pulsante "+" apre il selettore di struttura invece di creare
  // direttamente una Section con i default puri del registro.
  const [structureModalOpened, setStructureModalOpened] = useState(false);
  // ADR-34 § 5: alternativa a "Section vuota" — libreria di preset statici già composti,
  // stesso punto di apertura (`parentId`/`index` della radice, in coda).
  const [templateLibraryOpened, setTemplateLibraryOpened] = useState(false);

  /** Placeholder: nessuna funzione AI ancora disponibile (mai un bottone silenzioso). */
  function handleAiFeaturesClick(): void {
    notifications.show({
      color: 'blue',
      message: 'Funzioni AI non ancora disponibili',
    });
  }

  return (
    <div
      className={styles.canvasRoot}
      // Un click sullo sfondo deseleziona: senza, non ci sarebbe modo di tornare
      // a "nessun blocco selezionato" una volta scelto un nodo.
      onClick={() => selectNode(null)}
    >
      <Stack gap="sm">
        {rootIds.length === 0 ? (
          <div
            ref={setEmptyDropRef}
            className={styles.emptyDropzone}
            data-over={isOverEmpty}
            // Un click sui pulsanti sotto non deve deselezionare via il click-through
            // dello sfondo del contenitore (`onClick={() => selectNode(null)}` qui
            // sopra): già gestito pulsante per pulsante con `stopPropagation`, coerente
            // con lo stesso idioma di `BlockPalette`/`EditorBlockWrapper` in questo modulo.
          >
            <Group justify="center" gap="md" mb="sm">
              <Tooltip label="Aggiungi una Section vuota" withArrow>
                <ActionIcon
                  variant="light"
                  color="gray"
                  radius="xl"
                  size="xl"
                  aria-label="Aggiungi una Section vuota"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStructureModalOpened(true);
                  }}
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
                  onClick={(event) => {
                    event.stopPropagation();
                    setTemplateLibraryOpened(true);
                  }}
                >
                  <IconFolder size={22} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Funzioni AI" withArrow>
                <ActionIcon
                  variant="filled"
                  color="grape"
                  radius="xl"
                  size="xl"
                  aria-label="Funzioni AI"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleAiFeaturesClick();
                  }}
                >
                  <IconSparkles size={22} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Text size="sm" fs="italic" c="dimmed" ta="center">
              Trascina il widget qui
            </Text>
          </div>
        ) : (
          rootIds.map((id) => <EditorBlockWrapper key={id} id={id} />)
        )}

        <div onClick={(event) => event.stopPropagation()}>
          <BlockPalette parentId={null} label="Aggiungi blocco in fondo" />
        </div>
      </Stack>

      <SectionStructureModal
        opened={structureModalOpened}
        onClose={() => setStructureModalOpened(false)}
        parentId={null}
        index={rootIds.length}
      />
      <TemplateLibraryModal
        opened={templateLibraryOpened}
        onClose={() => setTemplateLibraryOpened(false)}
        parentId={null}
        index={rootIds.length}
      />
    </div>
  );
}
