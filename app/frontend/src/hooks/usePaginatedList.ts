/**
 * Hook di logica per liste paginate con ricerca testuale (pattern CRUD list).
 *
 * Incapsula SOLO lo stato e il data-fetching condivisi da tutte le pagine
 * elenco (paginazione `?p=&i=&q=&o=&d=`, vedi CLAUDE.md — Convenzioni API),
 * lasciando alla pagina il rendering esplicito dei componenti Mantine
 * (`ResponsiveTable`, `ListToolbar`, ecc.): non è un wrapper attorno a Mantine.
 */
import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { Pagination } from '../types/common.types';

/** Verso di ordinamento. */
export type SortDirection = 'asc' | 'desc';

/** Stato di ordinamento server-side. `key` null = ordinamento di default del backend. */
export interface ListSort<T> {
  key: keyof T | null;
  direction: SortDirection;
}

/** Parametri di query standard inviati a ogni endpoint elenco paginato. */
export interface PaginatedListParams {
  p: number;
  i: number;
  q?: string;
  /** Campo di ordinamento (deve essere tra quelli ammessi dal backend). */
  o?: string;
  /** Verso di ordinamento. */
  d?: SortDirection;
}

/** Valore restituito da {@link usePaginatedList}. */
export interface UsePaginatedListResult<T> {
  records: T[];
  /** Esposto per aggiornamenti ottimistici della riga (es. toggle stato). */
  setRecords: React.Dispatch<React.SetStateAction<T[]>>;
  /** Totale elementi che soddisfano la query (da `Pagination.totalItems`). */
  total: number;
  /** Totale pagine disponibili (da `Pagination.totalPages`). */
  totalPages: number;
  page: number;
  setPage: (page: number) => void;
  limit: number;
  setLimit: (limit: number) => void;
  search: string;
  setSearch: (search: string) => void;
  /** Ordinamento corrente (server-side). */
  sort: ListSort<T>;
  /** Cicla l'ordinamento della colonna: asc → desc → nessuno; riparte da pagina 1. */
  toggleSort: (key: keyof T) => void;
  loading: boolean;
  /** Ricarica la pagina corrente dal backend (da invocare dopo create/edit). */
  reload: () => Promise<void>;
}

/** Opzioni dell'hook. `E` tipizza eventuali filtri aggiuntivi (es. `role`). */
interface UsePaginatedListOptions<E> {
  /** Messaggio mostrato in `notifications.show` se il caricamento fallisce. */
  errorMessage: string;
  /** Filtri extra accodati ai parametri di query (oltre a `p`, `i`, `q`). */
  extraParams?: E;
  /**
   * Se `false`, salta il fetch (nessuna chiamata API). Default `true`. Usato
   * per pagine con tab condizionali al ruolo, dove l'utente corrente potrebbe
   * non avere i permessi per l'endpoint.
   */
  enabled?: boolean;
}

/**
 * Gestisce stato e caricamento di una lista paginata con ricerca.
 *
 * @typeParam T Tipo della singola riga restituita dal backend.
 * @typeParam E Tipo dei filtri aggiuntivi opzionali (default: nessuno).
 * @param fetcher Funzione del service che esegue la `GET` paginata.
 * @param options Messaggio d'errore e filtri extra.
 * @returns Stato della lista, setter e funzione `reload`.
 */
export function usePaginatedList<T, E extends Record<string, unknown> = Record<string, never>>(
  fetcher: (params: PaginatedListParams & E) => Promise<Pagination<T>>,
  options: UsePaginatedListOptions<E>,
): UsePaginatedListResult<T> {
  const [records, setRecords] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ListSort<T>>({ key: null, direction: 'asc' });
  const [loading, setLoading] = useState(false);

  /** Cicla l'ordinamento (asc → desc → nessuno) e torna a pagina 1. */
  const toggleSort = useCallback((key: keyof T): void => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return { key: null, direction: 'asc' };
    });
    setPage(1);
  }, []);

  const { errorMessage, extraParams, enabled = true } = options;
  // Chiave stabile sui filtri extra: l'oggetto cambia identità a ogni render,
  // la stringa no — così l'effetto non entra in loop.
  const extraKey = JSON.stringify(extraParams ?? {});

  const reload = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setLoading(true);
    try {
      // `{} as E` è sicuro quando `E` non ha campi obbligatori (default no-filtri).
      const params = {
        p: page,
        i: limit,
        q: search || undefined,
        o: sort.key ? String(sort.key) : undefined,
        d: sort.key ? sort.direction : undefined,
        ...(extraParams ?? ({} as E)),
      };
      const result = await fetcher(params);
      setRecords(result.items);
      setTotal(result.totalItems);
      setTotalPages(result.totalPages);
    } catch {
      notifications.show({ color: 'red', message: errorMessage });
    } finally {
      setLoading(false);
    }
    // `extraParams` è coperto da `extraKey`; `fetcher`/`errorMessage` sono stabili.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, sort, extraKey, fetcher, errorMessage, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    records,
    setRecords,
    total,
    totalPages,
    page,
    setPage,
    limit,
    setLimit,
    search,
    setSearch,
    sort,
    toggleSort,
    loading,
    reload,
  };
}
