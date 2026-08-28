/**
 * Store Zustand del `ThemeConfig` dell'installazione (ADR-4) + Provider che
 * monta `MantineProvider` per la chrome amministrativa.
 *
 * **Il tema salvato non veste più la chrome amministrativa.** L'Editor tema
 * governa l'aspetto del **sito pubblicato** (`app/public-site`, porta 55000) e
 * l'anteprima del Canvas dell'editor — non le pagine di amministrazione, che
 * restano sui default di fabbrica (`DEFAULT_THEME_CONFIG`). È lo stesso
 * rapporto che WordPress ha col proprio customizer: il tema veste il sito, non
 * il pannello di gestione. Il canale con cui il tema raggiunge il sito è
 * `utils/theme-css.utils.ts` (variabili CSS), non Mantine — che sul sito
 * pubblico non esiste (ADR-22 § 5).
 *
 * Lo store resta la fonte di verità del `ThemeConfig` **per chi lo modifica**:
 * `PageThemeEditor` legge il config corrente, scrive il draft e lo salva; la
 * sua anteprima dal vivo è un `MantineProvider` annidato, scopato alla sola
 * colonna delle demo, così una modifica non ridipinge l'app attorno.
 *
 * Bootstrap (ADR-4 §4): al mount lo store parte dall'ultimo `ThemeConfig`
 * valido cachato in localStorage (o dai default di fabbrica) e
 * `reconcileThemeFromServer()` lo riallinea con `GET /app/settings/theme`
 * (server = fonte di verità) — invocata da `LayoutProtected`, che monta solo a
 * login avvenuto. La cache non è più anti-FOUC per l'app (la chrome non
 * dipende più dal config): serve a far aprire l'Editor tema già sui valori
 * giusti invece che sui default. La chiave storica per-browser
 * `theme_primary_color` è deprecata: viene rimossa al mount.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { create } from 'zustand';
import { MantineProvider } from '@mantine/core';
import {
  buildAppTheme,
  buildCssVariablesResolver,
  DEFAULT_THEME_CONFIG,
  migrateThemeConfig,
  ThemeConfig,
} from '../theme';
import { getThemeConfigApi } from '../services/settings.service';

/** Cache anti-FOUC dell'ultimo ThemeConfig confermato dal server. */
const THEME_CONFIG_CACHE_KEY = 'theme_config';

/** Chiave storica del solo colore primario per-browser: deprecata e assorbita (ADR-4 §4). */
const LEGACY_PRIMARY_COLOR_KEY = 'theme_primary_color';

/**
 * Legge la cache locale scartando valori corrotti o di versione non nota;
 * le cache v1 storiche vengono migrate al contratto v2 (`migrateThemeConfig`).
 */
function readCachedConfig(): ThemeConfig | null {
  try {
    const raw = localStorage.getItem(THEME_CONFIG_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return migrateThemeConfig(parsed);
  } catch {
    // JSON corrotto: si riparte dai default, la cache verrà riscritta al prossimo sync.
    return null;
  }
}

interface ThemeColorStoreState {
  /** Configurazione tema del sito: salvata sul server o draft in corso di modifica. */
  themeConfig: ThemeConfig;
  /** Applica un draft (anteprima live dell'Editor tema): NON tocca la cache locale. */
  setThemeConfig: (config: ThemeConfig) => void;
  /** Applica una config confermata dal server (GET/PUT) e aggiorna la cache locale. */
  applyServerConfig: (config: ThemeConfig) => void;
  /** Riallinea il tema col server; da invocare quando l'utente è autenticato. */
  reconcileThemeFromServer: () => Promise<void>;
}

export const useThemeColorStore = create<ThemeColorStoreState>((set, get) => ({
  // La cache evita che l'Editor tema si apra sui default mentre il GET è in volo.
  themeConfig: readCachedConfig() ?? DEFAULT_THEME_CONFIG,

  setThemeConfig: (config) => set({ themeConfig: config }),

  applyServerConfig: (config) => {
    set({ themeConfig: config });
    localStorage.setItem(THEME_CONFIG_CACHE_KEY, JSON.stringify(config));
  },

  reconcileThemeFromServer: async () => {
    try {
      const config = await getThemeConfigApi();
      // Migra le v1 storiche e scarta versioni future non note a questo client.
      const migrated = migrateThemeConfig(config);
      if (migrated) {
        get().applyServerConfig(migrated);
      }
    } catch {
      // Errori di rete/HTTP già notificati dall'interceptor Axios: si resta su
      // cache locale o default di fabbrica finché il server non risponde.
    }
  },
}));

/**
 * Monta l'unico `MantineProvider` di livello applicativo, sui **default di
 * fabbrica**: la chrome amministrativa non riflette il `ThemeConfig` salvato,
 * che governa il sito pubblicato (vedi il commento di testa di questo file).
 *
 * Tema e resolver sono costanti — `DEFAULT_THEME_CONFIG` non cambia mai a
 * runtime — quindi `useMemo` senza dipendenze li calcola una volta sola: non
 * c'è più alcun ricalcolo del tema Mantine agganciato al drag dei controlli
 * dell'Editor tema, e con esso è sparita la ragione del `useDeferredValue` che
 * questo componente usava per attutirlo.
 */
export function ThemeColorProvider({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    // Migrazione ADR-4 §4: la scelta per-browser del solo primario non esiste più.
    localStorage.removeItem(LEGACY_PRIMARY_COLOR_KEY);
  }, []);

  const theme = useMemo(() => buildAppTheme(DEFAULT_THEME_CONFIG), []);
  const cssVariablesResolver = useMemo(() => buildCssVariablesResolver(DEFAULT_THEME_CONFIG), []);

  return (
    <MantineProvider
      defaultColorScheme="auto"
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
    >
      {children}
    </MantineProvider>
  );
}
