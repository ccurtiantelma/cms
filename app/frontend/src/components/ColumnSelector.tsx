/**
 * Selettore delle colonne visibili di una tabella elenco: menu a tendina con
 * una checkbox per colonna. Lo stato (e la persistenza) è gestito dal chiamante
 * tramite `useColumnVisibility`; qui si renderizza solo la UI.
 */
import { ActionIcon, Checkbox, Menu, Stack, Tooltip } from '@mantine/core';
import { IconColumns } from '@tabler/icons-react';
import type { ResponsiveTableColumn } from './ResponsiveTable';

interface ColumnSelectorProps<T> {
  /** Tutte le colonne disponibili (non solo quelle visibili). */
  columns: ResponsiveTableColumn<T>[];
  /** True se la colonna è attualmente visibile. */
  isVisible: (key: keyof T) => boolean;
  /** Mostra/nasconde la colonna. */
  onToggle: (key: keyof T) => void;
}

/** Tendina "Colonne" per scegliere quali colonne mostrare. */
export default function ColumnSelector<T>({
  columns,
  isVisible,
  onToggle,
}: ColumnSelectorProps<T>): JSX.Element {
  return (
    <Menu closeOnItemClick={false} position="bottom-end" withinPortal>
      <Menu.Target>
        <Tooltip label="Colonne" withArrow>
          <ActionIcon
            variant="default"
            radius="md"
            size="lg"
            aria-label="Colonne"
            data-tour="column-selector"
          >
            <IconColumns size={18} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Colonne visibili</Menu.Label>
        <Stack
          gap="xs"
          p="sm"
          m={4}
          bg="var(--mantine-color-gray-0)"
          style={{ borderRadius: 'var(--mantine-radius-sm)' }}
        >
          {columns.map((column) => (
            <Checkbox
              key={String(column.key)}
              label={column.label}
              checked={isVisible(column.key)}
              onChange={() => onToggle(column.key)}
            />
          ))}
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
}
