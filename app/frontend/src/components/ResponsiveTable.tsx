/**
 * Tabella responsive generica per pattern elenco CRUD.
 * - Desktop (>= 768px): tabella Mantine standard (`Table`) con header sticky e,
 *   se richiesto, ordinamento per colonna (controllato dal chiamante → server-side).
 * - Mobile/tablet (< 768px): ogni riga diventa una card verticale (`Paper`)
 *   con un'eventuale intestazione (`cardHeader`), le coppie label/valore
 *   impilate e i bottoni azione in fondo.
 * Il breakpoint è gestito con `useMediaQuery` di `@mantine/hooks`.
 */
import { useMemo, type ReactNode } from 'react';
import { Divider, Group, Loader, Paper, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';
import RowActionIcon from './RowActionIcon';
import classes from './ResponsiveTable.module.css';

/** Definizione di una colonna della tabella. */
export interface ResponsiveTableColumn<T> {
  /** Chiave del campo riga; usata come fallback di rendering e come identità colonna. */
  key: keyof T;
  /** Etichetta mostrata in header (desktop) e come label della card (mobile). */
  label: string;
  /** Render personalizzato della cella; se assente si mostra `row[key]`. */
  render?: (row: T) => ReactNode;
  /** Se true, la colonna non compare tra le righe della card (es. dato già nell'header). */
  hideInCard?: boolean;
}

/** Definizione di un'azione di riga (bottone-icona). */
export interface ResponsiveTableAction<T> {
  /** Testo del tooltip e `aria-label` dell'azione. */
  label: string;
  /** Icona Tabler da renderizzare (es. `<IconPencil size={16} />`). */
  icon: ReactNode;
  /** Callback invocata con la riga corrente. */
  onClick: (row: T) => void;
  /** Colore Mantine dell'icona; grigio per default. */
  color?: string;
  /** Se restituisce true per una riga, l'azione viene nascosta su quella riga. */
  hidden?: (row: T) => boolean;
}

/** Stato di ordinamento controllato dal chiamante. `key` null = nessun ordinamento. */
export interface ResponsiveTableSort<T> {
  key: keyof T | null;
  direction: 'asc' | 'desc';
}

interface ResponsiveTableProps<T> {
  /** Colonne da renderizzare, in ordine. */
  columns: ResponsiveTableColumn<T>[];
  /** Righe di dati (già ordinate dal backend: il componente NON le riordina). */
  data: T[];
  /** Azioni di riga opzionali. */
  actions?: ResponsiveTableAction<T>[];
  /** Intestazione della card (solo card mode), es. avatar + nome + ruolo. */
  cardHeader?: (row: T) => ReactNode;
  /** Chiavi colonna ordinabili: l'header diventa cliccabile (richiede `onSortChange`). */
  sortable?: (keyof T)[];
  /** Ordinamento corrente (per disegnare l'indicatore freccia sull'header). */
  sort?: ResponsiveTableSort<T>;
  /** Click su header ordinabile: il chiamante aggiorna lo stato e ri-fetcha. */
  onSortChange?: (key: keyof T) => void;
  /** Estrae la chiave React univoca di una riga; default: indice nell'array. */
  rowKey?: (row: T, index: number) => React.Key;
  /** Mostra un loader al posto di tabella/card mentre i dati sono in caricamento. */
  loading?: boolean;
  /** Testo mostrato quando `data` è vuoto (nessuna card, nessuna riga). */
  emptyText?: string;
}

/** Restituisce il contenuto di una cella, usando `render` o il valore grezzo. */
function renderCell<T>(column: ResponsiveTableColumn<T>, row: T): ReactNode {
  if (column.render) return column.render(row);
  const value = row[column.key];
  return value == null ? '—' : (value as ReactNode);
}

/** Filtra le azioni visibili per una specifica riga. */
function visibleActions<T>(
  actions: ResponsiveTableAction<T>[],
  row: T,
): ResponsiveTableAction<T>[] {
  return actions.filter((action) => !action.hidden?.(row));
}

/** Gruppo di bottoni-azione (riusa `RowActionIcon`) condiviso tra tabella e card. */
function ActionButtons<T>({
  actions,
  row,
}: {
  actions: ResponsiveTableAction<T>[];
  row: T;
}): JSX.Element {
  return (
    <>
      {actions.map((action) => (
        <RowActionIcon
          key={action.label}
          label={action.label}
          icon={action.icon}
          color={action.color}
          onClick={() => action.onClick(row)}
        />
      ))}
    </>
  );
}

/** Tabella responsive con fallback "card mode" su viewport ridotte. */
export default function ResponsiveTable<T>({
  columns,
  data,
  actions,
  cardHeader,
  sortable,
  sort,
  onSortChange,
  rowKey,
  loading = false,
  emptyText = 'Nessun dato disponibile',
}: ResponsiveTableProps<T>): JSX.Element {
  // Card mode sotto i 768px (tablet/mobile); su SSR/idratazione iniziale resta tabella.
  const isMobile = useMediaQuery('(max-width: 767px)');

  const getKey = (row: T, index: number): React.Key => (rowKey ? rowKey(row, index) : index);
  const hasActions = !!actions && actions.length > 0;
  const sortableSet = useMemo(() => new Set(sortable ?? []), [sortable]);

  // In caricamento: loader centrato, indipendente dal viewport.
  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  // Nessun dato: solo placeholder, né card né righe.
  if (data.length === 0) {
    return (
      <Text ta="center" c="dimmed" size="sm" py="xl">
        {emptyText}
      </Text>
    );
  }

  if (isMobile) {
    const cardColumns = columns.filter((column) => !column.hideInCard);
    return (
      <Stack gap="sm" data-tour="data-table">
        {data.map((row, index) => {
          const rowActions = actions ? visibleActions(actions, row) : [];
          return (
            <Paper key={getKey(row, index)} withBorder p="md" radius="md">
              <Stack gap="xs">
                {cardHeader && (
                  <>
                    {cardHeader(row)}
                    <Divider />
                  </>
                )}
                {cardColumns.map((column) => (
                  <Group
                    key={String(column.key)}
                    justify="space-between"
                    wrap="nowrap"
                    align="flex-start"
                  >
                    <Text size="xs" c="dimmed">
                      {column.label}
                    </Text>
                    <Text size="sm" fw={500} ta="right">
                      {renderCell(column, row)}
                    </Text>
                  </Group>
                ))}
                {rowActions.length > 0 && (
                  <>
                    <Divider mt="xs" />
                    <Group justify="flex-end" gap={6} wrap="nowrap" data-tour="row-actions">
                      <ActionButtons actions={rowActions} row={row} />
                    </Group>
                  </>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    );
  }

  return (
    <Table
      className={classes.table}
      data-tour="data-table"
      highlightOnHover
      verticalSpacing="sm"
      stickyHeader
    >
      <Table.Thead>
        <Table.Tr>
          {columns.map((column) => {
            const isSortable = !!onSortChange && sortableSet.has(column.key);
            if (!isSortable) {
              return <Table.Th key={String(column.key)}>{column.label}</Table.Th>;
            }
            const active = sort?.key === column.key;
            const SortIcon = active
              ? sort?.direction === 'asc'
                ? IconChevronUp
                : IconChevronDown
              : IconSelector;
            return (
              <Table.Th key={String(column.key)}>
                <UnstyledButton
                  className={classes.sortButton}
                  onClick={() => onSortChange(column.key)}
                >
                  <Group gap={4} wrap="nowrap">
                    <span>{column.label}</span>
                    <SortIcon size={14} className={active ? undefined : classes.sortIconIdle} />
                  </Group>
                </UnstyledButton>
              </Table.Th>
            );
          })}
          {hasActions && <Table.Th />}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {data.map((row, index) => (
          <Table.Tr key={getKey(row, index)}>
            {columns.map((column) => (
              <Table.Td key={String(column.key)}>{renderCell(column, row)}</Table.Td>
            ))}
            {hasActions && (
              <Table.Td>
                <Group gap={6} wrap="nowrap" justify="flex-end" data-tour="row-actions">
                  <ActionButtons actions={visibleActions(actions!, row)} row={row} />
                </Group>
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
