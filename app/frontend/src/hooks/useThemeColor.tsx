/**
 * Store Zustand del tema dell'app (ADR-4) + Provider che applica il
 * `ThemeConfig` v2 corrente (primario/palette custom, tipografia, scale,
 * ombre, component defaults, 11 token light/dark) a Mantine tramite
 * `buildAppTheme()` + `cssVariablesResolver` — nessuna iniezione manuale di
 * stili. `ThemeColorProvider` sostituisce `<MantineProvider theme={theme}>`
 * in `main.tsx` ed è l'unico punto dell'app che monta `MantineProvider`.
 *
 * A differenza del precedente `ThemeColorContext`, il `ThemeConfig` vive in
 * uno store Zustand (`useThemeColorStore`): ogni consumer (`LayoutProtected`,
 * `PageThemeEditor`) legge/scrive solo i campi che gli servono, senza dover
 * passare per un `<Provider>` dedicato.
 *
 * Bootstrap anti-FOUC (ADR-4 §4): al mount applica sincronicamente l'ultimo
 * `ThemeConfig` valido ricevuto dal server e cachato in localStorage (o i
 * default di fabbrica); quando l'utente è autenticato,
 * `reconcileThemeFromServer()` riallinea con `GET /app/settings/theme`
 * (server = fonte di verità) — invocata da `LayoutProtected`, che monta solo
 * a login avvenuto. Le pagine pubbliche (`/login`, ecc.) restano su
 * cache/default. La chiave storica per-browser `theme_primary_color` è
 * deprecata: viene rimossa al mount, il primario vive solo nel config globale.
 */
import { useDeferredValue, useEffect, useMemo, type ReactNode } from 'react';
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
  /** Configurazione tema correntemente applicata all'app (salvata o draft). */
  themeConfig: ThemeConfig;
  /** Applica un draft (anteprima live del Drawer): NON tocca la cache locale. */
  setThemeConfig: (config: ThemeConfig) => void;
  /** Applica una config confermata dal server (GET/PUT) e aggiorna la cache anti-FOUC. */
  applyServerConfig: (config: ThemeConfig) => void;
  /** Riallinea il tema col server; da invocare quando l'utente è autenticato. */
  reconcileThemeFromServer: () => Promise<void>;
}

export const useThemeColorStore = create<ThemeColorStoreState>((set, get) => ({
  // Anti-FOUC: la cache valida è applicata sincronicamente al primo render.
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
 * Wrappa `MantineProvider` applicando il `ThemeConfig` attivo dello store:
 * ogni modifica rimemoizza tema e resolver e si riflette live su tutta l'app.
 */
export function ThemeColorProvider({ children }: { children: ReactNode }): JSX.Element {
  const themeConfig = useThemeColorStore((state) => state.themeConfig);

  useEffect(() => {
    // Migrazione ADR-4 §4: la scelta per-browser del solo primario non esiste più.
    localStorage.removeItem(LEGACY_PRIMARY_COLOR_KEY);
  }, []);

  // L'Editor tema propaga ogni pixel di drag di Slider/ColorPicker qui dentro
  // (decine di eventi/sec): `themeConfig` resta sincrono per i controlli
  // controllati (nessun lag su value/label), ma il ricalcolo del tema Mantine
  // — costoso e che fa da context change per l'intera app — si deferisce a
  // bassa priorità, così React scarta i valori intermedi durante un drag
  // continuo invece di ricalcolare e ri-renderizzare ad ogni frame.
  const deferredThemeConfig = useDeferredValue(themeConfig);

  const theme = useMemo(() => buildAppTheme(deferredThemeConfig), [deferredThemeConfig]);

  const cssVariablesResolver = useMemo(
    () => buildCssVariablesResolver(deferredThemeConfig),
    [deferredThemeConfig],
  );

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
