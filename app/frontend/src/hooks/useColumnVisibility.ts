/**
 * Hook per la scelta delle colonne visibili di una tabella elenco, con
 * persistenza in `localStorage` (per pagina, via `storageKey`).
 *
 * Memorizza l'insieme delle chiavi NASCOSTE: così le colonne aggiunte in futuro
 * risultano visibili di default senza migrazioni dello stato salvato.
 * Non altera l'array di colonne ricevuto: restituisce il sottoinsieme visibile.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ResponsiveTableColumn } from '../components/ResponsiveTable';

/** Valore restituito da {@link useColumnVisibility}. */
export interface UseColumnVisibilityResult<T> {
  /** Sottoinsieme di colonne attualmente visibili (nell'ordine originale). */
  visibleColumns: ResponsiveTableColumn<T>[];
  /** True se la colonna è visibile. */
  isVisible: (key: keyof T) => boolean;
  /** Mostra/nasconde una colonna (mantenendo sempre almeno una visibile). */
  toggle: (key: keyof T) => void;
}

/** Legge le chiavi nascoste salvate; tollerante a dati assenti o corrotti. */
function readHidden(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Gestisce la visibilità delle colonne con persistenza locale.
 *
 * @typeParam T Tipo della riga (le chiavi colonna sono `keyof T`).
 * @param storageKey Chiave `localStorage` univoca per la pagina.
 * @param columns Definizione completa delle colonne disponibili.
 */
export function useColumnVisibility<T>(
  storageKey: string,
  columns: ResponsiveTableColumn<T>[],
): UseColumnVisibilityResult<T> {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(readHidden(storageKey)));

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify([...hidden]));
  }, [storageKey, hidden]);

  const isVisible = useCallback((key: keyof T) => !hidden.has(String(key)), [hidden]);

  const toggle = useCallback(
    (key: keyof T) => {
      setHidden((prev) => {
        const next = new Set(prev);
        const k = String(key);
        if (next.has(k)) {
          next.delete(k);
          return next;
        }
        // Vieta di nascondere l'ultima colonna visibile.
        if (prev.size >= columns.length - 1) return prev;
        next.add(k);
        return next;
      });
    },
    [columns.length],
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => !hidden.has(String(column.key))),
    [columns, hidden],
  );

  return { visibleColumns, isVisible, toggle };
}
