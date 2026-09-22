/**
 * Costanti e helper condivisi dalla chrome del blocco (`EditorBlockWrapper.tsx` e i suoi
 * sotto-moduli), estratti senza modifiche di comportamento.
 */
import { createContext, type ReactNode } from 'react';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';

/**
 * Nome della prop di visibilità (ADR-37 § 3) per ciascun viewport del Device Switcher
 * (`FullScreenEditorLayout.tsx`, `EditorViewport`), ed etichetta italiana per il badge.
 */
export const VIEWPORT_HIDE_PROP: Record<
  EditorViewport,
  'styleHideDesktop' | 'styleHideTablet' | 'styleHideMobile'
> = {
  desktop: 'styleHideDesktop',
  tablet: 'styleHideTablet',
  mobile: 'styleHideMobile',
};
export const VIEWPORT_LABEL: Record<EditorViewport, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};

/**
 * I tre "item" dei widget compositi (ADR-57 § 2, ADR-59) che leggono props del proprio
 * genitore — `accordion`/`tabs`/`carousel` stessi non ne fanno parte.
 */
export const WIDGET_ITEM_TYPES = new Set(['accordionItem', 'tabPanel', 'carouselSlide']);

/**
 * Valore scalare effettivo di una prop responsive (`{ default, tablet?, mobile? }`, ADR-29)
 * al viewport indicato. Cascata `mobile → tablet → default`: un breakpoint senza valore
 * proprio eredita quello meno specifico immediatamente sopra.
 */
export function resolveEffectiveResponsiveValue(
  value: unknown,
  viewport: EditorViewport,
): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const envelope = value as Record<string, unknown>;
  if (viewport === 'mobile' && typeof envelope.mobile === 'string') return envelope.mobile;
  if (viewport !== 'desktop' && typeof envelope.tablet === 'string') return envelope.tablet;
  return typeof envelope.default === 'string' ? envelope.default : undefined;
}

/** Id del nodo respinto dall'ultima validazione server-side, o `null`. */
export const InvalidBlockContext = createContext<string | null>(null);

/** Rende disponibile a tutta la chrome il nodo colpevole dell'ultimo `400` di validazione. */
export function InvalidBlockProvider({
  invalidBlockId,
  children,
}: {
  invalidBlockId: string | null;
  children: ReactNode;
}): JSX.Element {
  return (
    <InvalidBlockContext.Provider value={invalidBlockId}>{children}</InvalidBlockContext.Provider>
  );
}

const LEVEL_COLOR_TOP_SECTION = '#e0007b';
const LEVEL_COLOR_NESTED_CONTAINER = '#0284c7';
const LEVEL_COLOR_LEAF_WIDGET = '#2563eb';

/**
 * Colore di livello di annidamento (RE-2), esposto come custom property `--block-level-color`
 * sul wrapper. Dopo ADR-92 **non alimenta più** il bordo di hover/selezione (che legge i due
 * colori fissi di `BlockSelectionChrome.module.css`): resta calcolato invariato a tre livelli.
 * Sezioni di primo livello e `globalRef` → magenta; sezione annidata/`container` → azzurro;
 * ogni altro blocco → blu.
 */
export function resolveBlockLevelColor(
  isGlobalRef: boolean,
  isTopLevelSection: boolean,
  isContainerOrSection: boolean,
): string {
  if (isGlobalRef || isTopLevelSection) return LEVEL_COLOR_TOP_SECTION;
  return isContainerOrSection ? LEVEL_COLOR_NESTED_CONTAINER : LEVEL_COLOR_LEAF_WIDGET;
}
