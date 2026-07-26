/**
 * Toolbar sticky condivisa dalle pagine elenco CRUD (es. utenti, audit log).
 * Composizione di componenti Mantine (no wrapper su un singolo componente):
 * paginazione, righe/pagina, filtri opzionali, ricerca, totale risultati e
 * azione primaria "Nuovo".
 * Lo stato lista arriva da `usePaginatedList` tramite la prop `state`.
 *
 * Sotto il breakpoint `sm` i filtri (slot `filters`) non vengono mostrati inline
 * ma collassati in un Drawer apribile dal pulsante "Filtri".
 */
import { useState, type ReactNode } from 'react';
import { ActionIcon, Button, Drawer, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import classes from './ListToolbar.module.css';

/** Opzioni "righe per pagina" (tendina senza etichetta). */
const PAGE_SIZE_OPTIONS = ['20', '50', '100', '500'];

/** Sottoinsieme di `UsePaginatedListResult` necessario alla toolbar. */
export interface ListToolbarState {
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  limit: number;
  setLimit: (limit: number) => void;
  total: number;
  search: string;
  setSearch: (search: string) => void;
}

interface ListToolbarProps {
  /** Stato lista (compatibile con il valore di `usePaginatedList`). */
  state: ListToolbarState;
  /** Etichetta del pulsante di creazione, es. "Nuovo Utente". Omessa se la lista non ha creazione diretta. */
  newLabel?: string;
  /** Azione del pulsante di creazione (apre Drawer/Modal di creazione). Il pulsante non viene reso se assente. */
  onNew?: () => void;
  /** Placeholder del campo ricerca; generico per default. */
  searchPlaceholder?: string;
  /** Nasconde il campo ricerca: per endpoint che non espongono `q`. */
  hideSearch?: boolean;
  /** Filtri aggiuntivi inseriti tra righe/pagina e ricerca (es. filtro ruolo). */
  filters?: ReactNode;
  /** Selettore colonne (o altra azione) reso a destra, prima del pulsante "Nuovo". */
  columnSelector?: ReactNode;
}

/** Toolbar sticky di una pagina elenco. */
export default function ListToolbar({
  state,
  newLabel,
  onNew,
  searchPlaceholder = 'Cerca...',
  hideSearch = false,
  filters,
  columnSelector,
}: ListToolbarProps): JSX.Element {
  const { page, setPage, totalPages, limit, setLimit, total, search, setSearch } = state;
  // Stesso breakpoint di LayoutProtected/ResponsiveTable per coerenza con il resto dell'area gestionale.
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [filtersOpened, setFiltersOpened] = useState(false);

  return (
    <Group className={classes.toolbar} gap="md">
      <Group gap={4} wrap="nowrap" data-tour="list-pagination">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Pagina precedente"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <IconChevronLeft size={18} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Pagina successiva"
          disabled={totalPages === 0 || page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          <IconChevronRight size={18} />
        </ActionIcon>
        <Text size="sm" c="dimmed" className={classes.nowrap}>
          Pagina {page} / {totalPages || 1}
        </Text>
      </Group>

      <Select
        aria-label="Righe per pagina"
        data={PAGE_SIZE_OPTIONS}
        value={String(limit)}
        allowDeselect={false}
        w={70}
        onChange={(value) => {
          if (!value) return;
          setLimit(Number(value));
          setPage(1);
        }}
      />

      {filters && !isMobile && filters}
      {filters && isMobile && (
        <Button
          variant="default"
          leftSection={<IconFilter size={16} />}
          onClick={() => setFiltersOpened(true)}
        >
          Filtri
        </Button>
      )}

      {!hideSearch && (
        <TextInput
          className={classes.search}
          data-tour="list-search"
          leftSection={<IconSearch size={16} />}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
        />
      )}

      <Text size="sm" c="dimmed" className={classes.nowrap}>
        {total} {total === 1 ? 'risultato' : 'risultati'}
      </Text>

      <Group gap="sm" ml="auto" wrap="nowrap">
        {columnSelector}
        {onNew && (
          <Button leftSection={<IconPlus size={16} />} onClick={onNew} data-tour="btn-nuovo">
            {newLabel}
          </Button>
        )}
      </Group>

      {filters && (
        <Drawer
          opened={filtersOpened}
          onClose={() => setFiltersOpened(false)}
          title="Filtri"
          position="right"
          size="min(20rem, 100vw)"
        >
          <Stack gap="sm">{filters}</Stack>
        </Drawer>
      )}
    </Group>
  );
}
