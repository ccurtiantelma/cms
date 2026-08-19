/**
 * Canvas dell'editor (PLAN-F04-editor-visivo.md T4): l'albero della bozza renderizzato
 * con i componenti di F02 e decorato dalla chrome di `EditorBlockWrapper`.
 *
 * Sottoscrive **solo gli id dei nodi di radice** (`useShallow`): la modifica di una prop
 * o l'aggiunta di un figlio dentro una sezione non fa ri-renderizzare il canvas, ma il
 * solo wrapper interessato (NFR § Performance — editor).
 */
import { Paper, Stack, Text } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import BlockPalette from './BlockPalette';
import EditorBlockWrapper from './EditorBlockWrapper';

/** Superficie di editing dell'albero di blocchi della bozza corrente. */
export default function EditorCanvas(): JSX.Element {
  const rootIds = useBlockEditorStore(useShallow((state) => state.tree.map((node) => node.id)));
  const selectNode = useBlockEditorStore((state) => state.selectNode);

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      // Un click sullo sfondo deseleziona: senza, non ci sarebbe modo di tornare
      // a "nessun blocco selezionato" una volta scelto un nodo.
      onClick={() => selectNode(null)}
    >
      <Stack gap="sm">
        {rootIds.length === 0 ? (
          <Text size="sm" c="dimmed">
            La bozza non contiene ancora blocchi. Aggiungi il primo blocco per iniziare.
          </Text>
        ) : (
          rootIds.map((id) => <EditorBlockWrapper key={id} id={id} />)
        )}

        <div onClick={(event) => event.stopPropagation()}>
          <BlockPalette parentId={null} label="Aggiungi blocco in fondo" />
        </div>
      </Stack>
    </Paper>
  );
}
