/**
 * Blocco `section`: unico contenitore del registro (SPEC-F02-blocchi.md
 * § 3.2), più le quattro props di stile responsive di ADR-29
 * (`styleSpaceBefore`/`styleSpaceAfter`/`stylePadding`/`styleBackground`), le tre props di
 * layout a colonne di ADR-31 (`columns`/`gap`/`alignItems`, stesso schema responsive
 * `{ default, tablet?, mobile? }`) e le props di ADR-33: `contentWidth`/`maxWidth`/
 * `columnRatio` (`enum` non responsive), `styleBackgroundColor` (`kind: 'color'`, unica
 * eccezione a "sempre classi da token", vedi sotto), otto props di spaziatura per lato
 * `stylePaddingTop/Right/Bottom/Left`/`styleMarginTop/Right/Bottom/Left` (`enum`
 * responsive, stesso schema `{ default, tablet?, mobile? }`). Il rendering dei figli è
 * delegato al chiamante (`BlockRenderer`), che ricorre e applica il proprio Error
 * Boundary a ciascuno; nessun figlio riceve un indice di colonna, l'ordine nella griglia
 * segue l'ordine dei figli nell'albero (ADR-31 § 7).
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './Section.module.css';
import tokenStyles from '../style-tokens.module.css';
import {
  resolveHideClassName,
  resolveLayerClassName,
  resolveResponsiveClassNames,
  resolveScalarClassName,
} from '../style-tokens';
import { resolveMediaSrc } from '../media-url';

interface SectionProps {
  children: ReactNode;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  stylePadding?: unknown;
  styleBackground?: unknown;
  columns?: unknown;
  gap?: unknown;
  alignItems?: unknown;
  contentWidth?: unknown;
  maxWidth?: unknown;
  columnRatio?: unknown;
  styleBackgroundColor?: unknown;
  styleColor?: unknown;
  stylePaddingTop?: unknown;
  stylePaddingRight?: unknown;
  stylePaddingBottom?: unknown;
  stylePaddingLeft?: unknown;
  styleMarginTop?: unknown;
  styleMarginRight?: unknown;
  styleMarginBottom?: unknown;
  styleMarginLeft?: unknown;
  styleLayer?: unknown;
  styleHideDesktop?: unknown;
  styleHideTablet?: unknown;
  styleHideMobile?: unknown;
  /** ADR-47 § 1: `guid` di un file della media library, risolto via Media Engine pubblico. */
  styleBackgroundImageRef?: unknown;
  /** ADR-47 § 1: colore esadecimale (`^#[0-9a-fA-F]{6}$`) sovrapposto all'immagine di sfondo. */
  styleOverlayColor?: unknown;
  /** ADR-47 § 1: opacità dell'overlay, `0 ≤ x ≤ 1`. */
  styleOverlayOpacity?: unknown;
}

export default function Section({
  children,
  styleSpaceBefore,
  styleSpaceAfter,
  stylePadding,
  styleBackground,
  columns,
  gap,
  alignItems,
  contentWidth,
  maxWidth,
  columnRatio,
  styleBackgroundColor,
  styleColor,
  stylePaddingTop,
  stylePaddingRight,
  stylePaddingBottom,
  stylePaddingLeft,
  styleMarginTop,
  styleMarginRight,
  styleMarginBottom,
  styleMarginLeft,
  styleLayer,
  styleHideDesktop,
  styleHideTablet,
  styleHideMobile,
  styleBackgroundImageRef,
  styleOverlayColor,
  styleOverlayOpacity,
}: SectionProps) {
  // ADR-33 § 1 — logica di rendering, non di validazione: `maxWidth` resta dichiarato e
  // validato server-side anche quando `contentWidth === 'full-width'`, ma il renderer lo
  // ignora in quel caso (una Section a piena larghezza non ha senso di avere anche un
  // tetto di larghezza contenuto).
  const isFullWidth = contentWidth === 'full-width';

  // ADR-47 § 1 — risoluzione dell'URL pubblico via lo stesso modulo condiviso già usato da
  // `Image.tsx` (`resolveMediaSrc`, ADR-27 § 6): nessuna seconda implementazione.
  const backgroundImageSrc =
    typeof styleBackgroundImageRef === 'string' && styleBackgroundImageRef
      ? resolveMediaSrc(styleBackgroundImageRef)
      : undefined;

  // Overlay renderizzato solo se almeno una delle due prop è presente — assenza di
  // entrambe = comportamento invariato, nessun elemento aggiuntivo nel DOM (ADR-47 § 1).
  const hasOverlayColor = typeof styleOverlayColor === 'string' && styleOverlayColor.length > 0;
  const hasOverlayOpacity = typeof styleOverlayOpacity === 'number';
  const hasOverlay = hasOverlayColor || hasOverlayOpacity;

  const className = [
    styles.section,
    hasOverlay ? styles.withOverlay : '',
    resolveResponsiveClassNames(tokenStyles, 'spaceBefore', styleSpaceBefore),
    resolveResponsiveClassNames(tokenStyles, 'spaceAfter', styleSpaceAfter),
    resolveResponsiveClassNames(tokenStyles, 'padding', stylePadding),
    resolveResponsiveClassNames(tokenStyles, 'background', styleBackground),
    // ADR-31 § 7 — nessuna classe emessa quando la prop è assente (contenuto pre-ADR-31):
    // `display: grid` senza `grid-template-columns` esplicito resta una singola colonna
    // implicita, stesso risultato visivo del precedente `flex-direction: column`.
    resolveResponsiveClassNames(tokenStyles, 'columns', columns),
    resolveResponsiveClassNames(tokenStyles, 'gap', gap),
    resolveResponsiveClassNames(tokenStyles, 'alignItems', alignItems),
    resolveScalarClassName(tokenStyles, 'contentWidth', contentWidth),
    // `columnRatio_*` è dichiarata dopo `columns_default_*` nel foglio dei token: stessa
    // specificità, vince per ordine di dichiarazione quando entrambe si applicano.
    resolveScalarClassName(tokenStyles, 'columnRatio', columnRatio),
    isFullWidth ? '' : resolveScalarClassName(tokenStyles, 'maxWidth', maxWidth),
    resolveResponsiveClassNames(tokenStyles, 'paddingTop', stylePaddingTop),
    resolveResponsiveClassNames(tokenStyles, 'paddingRight', stylePaddingRight),
    resolveResponsiveClassNames(tokenStyles, 'paddingBottom', stylePaddingBottom),
    resolveResponsiveClassNames(tokenStyles, 'paddingLeft', stylePaddingLeft),
    resolveResponsiveClassNames(tokenStyles, 'marginTop', styleMarginTop),
    resolveResponsiveClassNames(tokenStyles, 'marginRight', styleMarginRight),
    resolveResponsiveClassNames(tokenStyles, 'marginBottom', styleMarginBottom),
    resolveResponsiveClassNames(tokenStyles, 'marginLeft', styleMarginLeft),
    resolveLayerClassName(tokenStyles, styleLayer),
    resolveHideClassName(tokenStyles, 'hideDesktop', styleHideDesktop),
    resolveHideClassName(tokenStyles, 'hideTablet', styleHideTablet),
    resolveHideClassName(tokenStyles, 'hideMobile', styleHideMobile),
  ]
    .filter(Boolean)
    .join(' ');

  // I colori arrivano dal JSON già validato server-side e vengono applicati al nodo
  // principale, così il renderer SSR del sito pubblico conserva lo stile del blocco.
  // Ogni valore è assegnato per proprietà a `style` — mai concatenato in una stringa
  // HTML/CSS (ADR-47, vincolo permanente verificato anche sul renderer pubblico).
  const inlineStyle: CSSProperties = {
    ...(typeof styleBackgroundColor === 'string' && styleBackgroundColor
      ? { backgroundColor: styleBackgroundColor }
      : {}),
    ...(typeof styleColor === 'string' && styleColor ? { color: styleColor } : {}),
    ...(backgroundImageSrc
      ? {
          backgroundImage: `url(${backgroundImageSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }
      : {}),
  };
  const hasInlineStyle = Object.keys(inlineStyle).length > 0;

  // Overlay: `<div>` assoluto sovrapposto all'immagine di sfondo, con colore e opacità
  // assegnati per proprietà separate (mai un `rgba()` composto per interpolazione di
  // stringa). `.withOverlay` in CSS solleva lo z-index dei figli reali sopra l'overlay.
  const overlayStyle: CSSProperties = {
    ...(hasOverlayColor ? { backgroundColor: styleOverlayColor as string } : {}),
    ...(hasOverlayOpacity ? { opacity: styleOverlayOpacity as number } : {}),
  };

  return (
    <section className={className} style={hasInlineStyle ? inlineStyle : undefined}>
      {hasOverlay ? <div className={styles.overlay} style={overlayStyle} aria-hidden="true" /> : null}
      {children}
    </section>
  );
}
