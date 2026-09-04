import { Button, Drawer, Group, ScrollArea, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconPoint } from '@tabler/icons-react';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';

export interface HistoryDrawerProps {
  opened: boolean;
  onClose: () => void;
}

/** Drawer della cronologia visuale: ogni voce ripristina lo stato dell'albero associato. */
export default function HistoryDrawer({ opened, onClose }: HistoryDrawerProps): JSX.Element {
  const history = useBlockEditorStore((state) => state.history);
  const historyIndex = useBlockEditorStore((state) => state.historyIndex);
  const restoreHistory = useBlockEditorStore((state) => state.restoreHistory);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title="Cronologia Azioni"
      size="md"
      zIndex={1100}
    >
      {history.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nessuna azione nella cronologia.
        </Text>
      ) : (
        <ScrollArea h="calc(100vh - 100px)">
          <Stack gap="xs">
            {history.map((entry, index) => {
              const current = index === historyIndex;
              return (
                <Button
                  key={`${entry.label}-${index}`}
                  variant={current ? 'light' : 'subtle'}
                  color={current ? 'blue' : 'gray'}
                  fullWidth
                  justify="flex-start"
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Ripristina: ${entry.label}`}
                  onClick={() => {
                    restoreHistory(index);
                    onClose();
                  }}
                >
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon size="sm" variant={current ? 'filled' : 'light'}>
                      <IconPoint size={12} />
                    </ThemeIcon>
                    <Text size="sm" fw={current ? 600 : 400} ta="left">
                      {entry.label}
                    </Text>
                  </Group>
                </Button>
              );
            })}
          </Stack>
        </ScrollArea>
      )}
    </Drawer>
  );
}
