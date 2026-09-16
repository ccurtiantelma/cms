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
 * ADR-50: `styleBackgroundType` (`color|image|gradient`) sceglie quale sorgente di sfondo
 * onorare; `styleBackgroundPosition`/`styleBackgroundSize` rendono configurabili posizione e
 * dimensione dell'immagine (prima fisse a `center`/`cover`); `styleGradientStart`/
 * `styleGradientEnd` (`kind: 'color'`, riuso ADR-33/38/47) alimentano un gradiente lineare.
 * `justifyContent` (`enum` responsive, stessi 6 valori e stesso schema `{ default, tablet?,
 * mobile? }` già usati da `container`, ADR-39): allineamento orizzontale dei figli diretti
 * della griglia — le classi `.justifyContent_*` sono generiche in `style-tokens.module.css`
 * (non namespaced per tipo di blocco), quindi condivise senza duplicazione di CSS.
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
  /** ADR-39, allineamento orizzontale dei figli — stesso schema `container`. */
  justifyContent?: unknown;
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
  /** ADR-50: `color | image | gradient`, sceglie la sorgente di sfondo attiva. */
  styleBackgroundType?: unknown;
  /** ADR-50: preset di posizione (griglia 3×3), applicato solo quando il tipo è `image`. */
  styleBackgroundPosition?: unknown;
  /** ADR-50: `cover | contain | auto`, applicato solo quando il tipo è `image`. */
  styleBackgroundSize?: unknown;
  /** ADR-50: colore iniziale del gradiente, applicato solo quando il tipo è `gradient`. */
  styleGradientStart?: unknown;
  /** ADR-50: colore finale del gradiente, applicato solo quando il tipo è `gradient`. */
  styleGradientEnd?: unknown;
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
  justifyContent,
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
  styleBackgroundType,
  styleBackgroundPosition,
  styleBackgroundSize,
  styleGradientStart,
  styleGradientEnd,
}: SectionProps) {
  // ADR-33 § 1 — logica di rendering, non di validazione: `maxWidth` resta dichiarato e
  // validato server-side anche quando `contentWidth === 'full-width'`, ma il renderer lo
  // ignora in quel caso (una Section a piena larghezza non ha senso di avere anche un
  // tetto di larghezza contenuto).
  const isFullWidth = contentWidth === 'full-width';

  const hasBackgroundImageRef =
    typeof styleBackgroundImageRef === 'string' && styleBackgroundImageRef.length > 0;
  const hasGradientStart = typeof styleGradientStart === 'string' && styleGradientStart.length > 0;
  const hasGradientEnd = typeof styleGradientEnd === 'string' && styleGradientEnd.length > 0;

  // ADR-50 — un nodo salvato prima di questa ADR non ha `styleBackgroundType` ma può già
  // avere `styleBackgroundImageRef` (ADR-47): l'assenza del tipo non deve nascondere
  // un'immagine di sfondo già configurata, "comportamento invariato per ogni nodo
  // pre-esistente" (ADR-50, Conseguenza). Un tipo esplicito resta l'unica scelta per il
  // contenuto nuovo.
  const backgroundType =
    typeof styleBackgroundType === 'string'
      ? styleBackgroundType
      : hasBackgroundImageRef
        ? 'image'
        : 'color';

  // ADR-47 § 1 — risoluzione dell'URL pubblico via lo stesso modulo condiviso già usato da
  // `Image.tsx` (`resolveMediaSrc`, ADR-27 § 6): nessuna seconda implementazione.
  const backgroundImageSrc =
    backgroundType === 'image' && hasBackgroundImageRef
      ? resolveMediaSrc(styleBackgroundImageRef as string)
      : undefined;

  const backgroundPosition =
    typeof styleBackgroundPosition === 'string' ? styleBackgroundPosition : 'center center';
  const backgroundSize = typeof styleBackgroundSize === 'string' ? styleBackgroundSize : 'cover';

  // Gradiente lineare a due tinte (ADR-50): renderizzato solo quando entrambi gli stop sono
  // presenti, stesso principio "nessun elemento senza dati sufficienti" già in uso per
  // l'overlay sotto. Valori assegnati per proprietà `style`, mai concatenati in HTML — solo
  // interpolati in un valore CSS `linear-gradient()`, entrambi gli stop già vincolati dal
  // pattern esadecimale del `kind: 'color'` server-side.
  const gradientValue =
    backgroundType === 'gradient' && hasGradientStart && hasGradientEnd
      ? `linear-gradient(135deg, ${styleGradientStart}, ${styleGradientEnd})`
      : undefined;

  // Overlay renderizzato solo se almeno una delle due prop è presente — assenza di
  // entrambe = comportamento invariato, nessun elemento aggiuntivo nel DOM (ADR-47 § 1).
  const hasOverlayColor = typeof styleOverlayColor === 'string' && styleOverlayColor.length > 0;
  const hasOverlayOpacity = typeof styleOverlayOpacity === 'number';
  const hasOverlay = hasOverlayColor || hasOverlayOpacity;

  // Split sfondo/contenuto (correzione bug "sfondo boxed" — Change 3): il `<section>`
  // esterno porta SOLO ciò che riguarda lo sfondo a piena larghezza — token/inline style di
  // sfondo, spaziatura verticale fra Section (`spaceBefore`/`spaceAfter`), il proprio
  // margine (`styleMarginTop/Right/Bottom/Left` — un offset del box stesso, non del
  // contenuto interno), `styleLayer`, le classi di visibilità responsive — e non riceve mai
  // `display: grid` né una classe `maxWidth_*`/`contentWidth_boxed`: prima di questo split
  // quelle classi vivevano sullo stesso elemento dello sfondo, restringendo anche
  // quest'ultimo quando `contentWidth === 'boxed'` invece di lasciarlo a piena larghezza
  // dietro un contenuto centrato (il bug corretto qui).
  const outerClassName = [
    styles.section,
    hasOverlay ? styles.withOverlay : '',
    resolveResponsiveClassNames(tokenStyles, 'spaceBefore', styleSpaceBefore),
    resolveResponsiveClassNames(tokenStyles, 'spaceAfter', styleSpaceAfter),
    resolveResponsiveClassNames(tokenStyles, 'background', styleBackground),
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

  // Wrapper interno (`.content`, `styles.content` sotto): porta tutto ciò che riguarda il
  // *layout dei figli* — `display: grid` e le classi di griglia (ADR-31 § 7), il vincolo di
  // larghezza (`contentWidth_*`/`maxWidth_*`, ADR-33 § 1 — qui, non più sull'elemento dello
  // sfondo) e il padding interno (ADR-33 § 4) — mentre lo sfondo del `<section>` esterno
  // resta sempre a piena larghezza indipendentemente da `contentWidth`.
  const contentClassName = [
    styles.content,
    // ADR-31 § 7 — nessuna classe emessa quando la prop è assente (contenuto pre-ADR-31):
    // `display: grid` senza `grid-template-columns` esplicito resta una singola colonna
    // implicita, stesso risultato visivo del precedente `flex-direction: column`.
    resolveResponsiveClassNames(tokenStyles, 'columns', columns),
    resolveResponsiveClassNames(tokenStyles, 'gap', gap),
    resolveResponsiveClassNames(tokenStyles, 'alignItems', alignItems),
    resolveResponsiveClassNames(tokenStyles, 'justifyContent', justifyContent),
    resolveScalarClassName(tokenStyles, 'contentWidth', contentWidth),
    // `columnRatio_*` è dichiarata dopo `columns_default_*` nel foglio dei token: stessa
    // specificità, vince per ordine di dichiarazione quando entrambe si applicano.
    resolveScalarClassName(tokenStyles, 'columnRatio', columnRatio),
    isFullWidth ? '' : resolveScalarClassName(tokenStyles, 'maxWidth', maxWidth),
    resolveResponsiveClassNames(tokenStyles, 'padding', stylePadding),
    resolveResponsiveClassNames(tokenStyles, 'paddingTop', stylePaddingTop),
    resolveResponsiveClassNames(tokenStyles, 'paddingRight', stylePaddingRight),
    resolveResponsiveClassNames(tokenStyles, 'paddingBottom', stylePaddingBottom),
    resolveResponsiveClassNames(tokenStyles, 'paddingLeft', stylePaddingLeft),
  ]
    .filter(Boolean)
    .join(' ');

  // I colori arrivano dal JSON già validato server-side e vengono applicati al nodo
  // principale, così il renderer SSR del sito pubblico conserva lo stile del blocco.
  // Ogni valore è assegnato per proprietà a `style` — mai concatenato in una stringa
  // HTML/CSS (ADR-47, vincolo permanente verificato anche sul renderer pubblico).
  // Sfondo (colore/immagine/gradiente): resta sul `<section>` esterno, mai sul wrapper del
  // contenuto — stessa ragione dello split di classi sopra.
  const outerInlineStyle: CSSProperties = {
    ...(typeof styleBackgroundColor === 'string' && styleBackgroundColor
      ? { backgroundColor: styleBackgroundColor }
      : {}),
    ...(backgroundImageSrc
      ? {
          backgroundImage: `url(${backgroundImageSrc})`,
          backgroundSize,
          backgroundPosition,
          backgroundRepeat: 'no-repeat',
        }
      : {}),
    ...(gradientValue ? { backgroundImage: gradientValue } : {}),
  };
  const hasOuterInlineStyle = Object.keys(outerInlineStyle).length > 0;

  // `styleColor` (colore del testo) appartiene al contenuto, non allo sfondo: applicato al
  // wrapper interno così eredita sui figli esattamente come prima dello split (il colore non
  // ha mai influenzato lo sfondo, solo il testo dei blocchi annidati).
  const contentInlineStyle: CSSProperties = {
    ...(typeof styleColor === 'string' && styleColor ? { color: styleColor } : {}),
  };
  const hasContentInlineStyle = Object.keys(contentInlineStyle).length > 0;

  // Overlay: `<div>` assoluto sovrapposto all'immagine di sfondo, con colore e opacità
  // assegnati per proprietà separate (mai un `rgba()` composto per interpolazione di
  // stringa). `.withOverlay > .content` in CSS solleva lo z-index del wrapper di contenuto
  // (unico figlio reale del `<section>` esterno oltre all'overlay stesso) sopra l'overlay.
  const overlayStyle: CSSProperties = {
    ...(hasOverlayColor ? { backgroundColor: styleOverlayColor as string } : {}),
    ...(hasOverlayOpacity ? { opacity: styleOverlayOpacity as number } : {}),
  };

  return (
    <section className={outerClassName} style={hasOuterInlineStyle ? outerInlineStyle : undefined}>
      {hasOverlay ? (
        <div className={styles.overlay} style={overlayStyle} aria-hidden="true" />
      ) : null}
      <div
        className={contentClassName}
        style={hasContentInlineStyle ? contentInlineStyle : undefined}
      >
        {children}
      </div>
    </section>
  );
}
