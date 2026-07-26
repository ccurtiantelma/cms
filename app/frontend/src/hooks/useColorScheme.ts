/**
 * Hook per la gestione del color scheme (chiaro/scuro/sistema).
 */
import { useEffect, useState } from 'react';
import { useMantineColorScheme } from '@mantine/core';

const COLOR_SCHEME_STORAGE_KEY = 'color_scheme';

export type ColorScheme = 'light' | 'dark' | 'auto';

/**
 * Hook che estende `useMantineColorScheme` con persistenza su localStorage.
 * `colorScheme` riflette il valore scelto dall'utente, incluso `auto` (Sistema) —
 * usato dalla Preferenza tema in `pages/profile/PageProfile.tsx`.
 */
export function useColorScheme(): {
  colorScheme: ColorScheme;
  setColorScheme: (colorScheme: ColorScheme) => void;
  toggleColorScheme: () => void;
} {
  const { colorScheme, setColorScheme: setMantineColorScheme } = useMantineColorScheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Recupera il color scheme da localStorage.
    const stored = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY) as ColorScheme | null;
    if (stored && stored !== colorScheme) {
      setMantineColorScheme(stored);
    }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- eseguito una sola volta al mount
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorScheme);
    }
  }, [colorScheme, mounted]);

  const toggleColorScheme = (): void => {
    setMantineColorScheme(colorScheme === 'dark' ? 'light' : 'dark');
  };

  return {
    colorScheme,
    setColorScheme: setMantineColorScheme,
    toggleColorScheme,
  };
}
