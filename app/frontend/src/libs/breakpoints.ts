/**
 * Risoluzione dei breakpoint attivi per sito (ADR-76-breakpoints-configurabili.md), letta da
 * `app_settings.breakpoints` (`GET app/settings/breakpoints`, `SettingsController_getBreakpoints`
 * — `types/api.types.ts`, generato da OpenAPI). Mirror **frontend-only** di
 * `resolveActiveBreakpoints()` (`app/backend/src/blocks/prop-spec.types.ts` righe 211-237, letto
 * come riferimento di correttezza, mai importato — CLAUDE.md § Isolamento del dominio): stesso
 * punto unico che incrocia l'unione chiusa dei 7 nomi con lo stato di attivazione per sito,
 * stessa formula di soglia (`min-width` solo per `widescreen`, `max-width` per le altre 5).
 *
 * Consumato da `IframeCanvas.tsx` per popolare `activeBreakpoints` di
 * `generateCanvasCss()` (`components/blocks/generateCanvasCss.ts`) — nessun meccanismo
 * preesistente nel frontend accedeva a questa impostazione prima di questo modulo (verificato:
 * nessuna chiamata a `GET app/settings/breakpoints` nel repository).
 */
import type { components } from '../types/api.types';
import { RESPONSIVE_BREAKPOINTS, type ResponsiveBreakpointName } from '../types/blocks.types';

/** Riuso diretto dello schema generato (`api.types.ts`), stesso principio di `GlobalTokensDto`
 * in `services/settings.service.ts`. */
export type BreakpointsDto = components['schemas']['BreakpointsDto'];

/** Breakpoint già risolto: filtrato per `active` e con la soglia già calcolata. `mediaQuery`
 * assente per `'default'` — stessa forma richiesta da `generateCanvasCss()`. */
export interface ResolvedBreakpoint {
  name: ResponsiveBreakpointName;
  mediaQuery?: string;
  /**
   * Soglia numerica in pixel, letta direttamente da `config.maxWidth`/`config.minWidth` del
   * DTO (mai da un parsing della stringa `mediaQuery`) — Sub-Task "Frame WYSIWYG In-Place &
   * Breakpoint Switcher". Assente per `'default'`, sempre presente per gli altri (un
   * breakpoint attivo del DTO ha sempre l'uno o l'altro). Consumato da
   * `FullScreenEditorLayout.tsx` per ridimensionare l'`<iframe>` del canvas a un pixel reale
   * (`widescreen` → `minWidth`, gli altri cinque → `maxWidth`), non solo per iniettare una
   * media query.
   */
  widthPx?: number;
}

/**
 * Etichette leggibili dei 7 nomi di breakpoint (ADR-76), per lo switcher del canvas
 * (`BreakpointSwitcher.tsx`) e la label del frame simulato (`FullScreenEditorLayout.tsx`).
 * Frontend-only: nessuna corrispondenza col backend, solo testo per l'interfaccia.
 */
export const BREAKPOINT_LABELS: Record<ResponsiveBreakpointName, string> = {
  default: 'Desktop',
  widescreen: 'Widescreen',
  laptop: 'Laptop',
  tabletExtra: 'Tablet Extra',
  tablet: 'Tablet',
  mobileExtra: 'Mobile Extra',
  mobile: 'Mobile',
};

/**
 * Default di fabbrica (ADR-76 § "Decisione" punto 1, tabella): `tablet`/`mobile` attivi alle
 * soglie storiche di ADR-29, gli altri 4 disattivi — preserva senza migrazione il comportamento
 * già cablato prima di questa ADR. Usato come fallback finché `GET app/settings/breakpoints`
 * non ha ancora risposto (mai un canvas senza alcuna anteprima responsive nel frattempo).
 */
export const DEFAULT_BREAKPOINTS_DTO: BreakpointsDto = {
  default: {},
  widescreen: { active: false, minWidth: 2400 },
  laptop: { active: false, maxWidth: 1366 },
  tabletExtra: { active: false, maxWidth: 1200 },
  tablet: { active: true, maxWidth: 1024 },
  mobileExtra: { active: false, maxWidth: 880 },
  mobile: { active: true, maxWidth: 767 },
};

/**
 * Punto unico che incrocia l'unione chiusa dei 7 nomi con lo stato di attivazione per sito
 * (ADR-76 § "Conseguenze"). Funzione pura: non legge `app_settings` da sola, il chiamante passa
 * il DTO già letto (`getBreakpointsApi()`, `services/settings.service.ts`).
 *
 * @param settings Valore corrente di `app_settings.breakpoints`.
 * @returns L'elenco dei breakpoint attivi, `'default'` sempre incluso per primo, gli altri
 *   nell'ordine di `RESPONSIVE_BREAKPOINTS` (dal più largo al più stretto) con la propria
 *   `mediaQuery` già calcolata.
 */
export function resolveActiveBreakpoints(settings: BreakpointsDto): ResolvedBreakpoint[] {
  const resolved: ResolvedBreakpoint[] = [{ name: 'default' }];
  for (const name of RESPONSIVE_BREAKPOINTS) {
    if (name === 'default') continue;
    const config = settings[name as Exclude<ResponsiveBreakpointName, 'default'>];
    if (!config?.active) continue;
    // `widthPx` letto direttamente dal DTO (`config.maxWidth`/`config.minWidth`), mai da un
    // parsing della stringa `mediaQuery` sotto — le due derivano dalla stessa soglia ma
    // restano due espressioni indipendenti dello stesso numero.
    const widthPx = name === 'widescreen' ? config.minWidth : config.maxWidth;
    const mediaQuery =
      name === 'widescreen' ? `(min-width: ${widthPx}px)` : `(max-width: ${widthPx}px)`;
    resolved.push({ name, mediaQuery, widthPx });
  }
  return resolved;
}
