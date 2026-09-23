/**
 * Utility pura per l'overlay "Contorno griglia" del canvas editor (T-container-layout-tab,
 * `ContainerLayoutTab.tsx` § Accordion "Elementi"): calcola se una prop `layout` (`kind:
 * 'layout'`, v2, `container` `v: 2`, ADR-82) è a `display: 'grid'` per il breakpoint attivo e
 * quante colonne mostrare — un overlay puramente visivo, mai persistito e mai letto dal sito
 * pubblico (`BlockRenderer.tsx` non passa mai `layout` a `Container`/`Section`, coerente con
 * `data-canvas-style-id` che resta l'unico canale reale di stile v2 verso
 * `generateCanvasCss.ts`).
 *
 * Duplica volutamente la piccola cascata di breakpoint già scritta in `inspector.utils.ts`
 * (`BREAKPOINT_CASCADE_ORDER`/`effectiveNakedValueForBreakpoint`) invece di importarla da lì:
 * quel modulo vive sotto `pages/pages/editor/inspector/`, un livello sopra i blocchi condivisi
 * (`components/blocks/`, riusati anche da `app/public-site`) — importarlo da qui invertirebbe
 * la direzione di dipendenza dell'albero dei moduli.
 */
import type { ResponsiveBreakpointName } from '../../../types/blocks.types';

const BREAKPOINT_CASCADE_ORDER: readonly ResponsiveBreakpointName[] = [
  'mobile',
  'mobileExtra',
  'tablet',
  'tabletExtra',
  'laptop',
  'default',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function effectiveLayoutForBreakpoint(
  layoutEnvelope: Record<string, unknown>,
  breakpoint: ResponsiveBreakpointName,
): Record<string, unknown> | undefined {
  if (breakpoint === 'widescreen') {
    const value = layoutEnvelope.widescreen ?? layoutEnvelope.default;
    return isPlainObject(value) ? value : undefined;
  }
  const startIndex = BREAKPOINT_CASCADE_ORDER.indexOf(breakpoint);
  const chain = startIndex >= 0 ? BREAKPOINT_CASCADE_ORDER.slice(startIndex) : ['default'];
  for (const name of chain) {
    const value = layoutEnvelope[name];
    if (value !== undefined) return isPlainObject(value) ? value : undefined;
  }
  return undefined;
}

/**
 * Numero di colonne per l'overlay "Contorno griglia" se `layout` è a `display: 'grid'` per
 * `breakpoint`, `null` altrimenti (Flex, o `layout` non ancora impostato — es. `section` v1,
 * che non dichiara mai questa prop, ADR-82 § "Decisione" punto 2: per lui questa funzione
 * ritorna sempre `null`). Default visivo 2 quando il preset colonne non è ancora impostato,
 * stesso fallback di `ContainerLayoutTab.tsx` "Colonne" (non 12 come `LayoutField.tsx`).
 */
export function resolveGridOutlineColumnCount(
  layout: unknown,
  breakpoint: ResponsiveBreakpointName,
): number | null {
  if (!isPlainObject(layout)) return null;
  const effective = effectiveLayoutForBreakpoint(layout, breakpoint);
  if (!effective || effective.display !== 'grid') return null;
  const columns = effective.gridTemplateColumns;
  if (
    isPlainObject(columns) &&
    columns.preset === 'repeat' &&
    typeof columns.count === 'number' &&
    columns.count > 0
  ) {
    return columns.count;
  }
  // Tracce esplicite (unità px/%, "Colonne" di `ContainerLayoutTab.tsx`): una colonna per traccia.
  if (Array.isArray(columns) && columns.length > 0) return columns.length;
  return 2;
}
