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
import { resolveResponsiveClassNames, resolveScalarClassName } from '../style-tokens';

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
  stylePaddingTop?: unknown;
  stylePaddingRight?: unknown;
  stylePaddingBottom?: unknown;
  stylePaddingLeft?: unknown;
  styleMarginTop?: unknown;
  styleMarginRight?: unknown;
  styleMarginBottom?: unknown;
  styleMarginLeft?: unknown;
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
  stylePaddingTop,
  stylePaddingRight,
  stylePaddingBottom,
  stylePaddingLeft,
  styleMarginTop,
  styleMarginRight,
  styleMarginBottom,
  styleMarginLeft,
}: SectionProps) {
  // ADR-33 § 1 — logica di rendering, non di validazione: `maxWidth` resta dichiarato e
  // validato server-side anche quando `contentWidth === 'full-width'`, ma il renderer lo
  // ignora in quel caso (una Section a piena larghezza non ha senso di avere anche un
  // tetto di larghezza contenuto).
  const isFullWidth = contentWidth === 'full-width';

  const className = [
    styles.section,
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
    // ADR-33 § 6 — solo se un colore è impostato: la classe statica che consuma
    // `--section-bg` va applicata solo quando la custom property è effettivamente
    // valorizzata, altrimenti `background-color: var(--section-bg)` risolverebbe a
    // `unset`/trasparente comunque, ma senza motivo di aggiungere la classe.
    typeof styleBackgroundColor === 'string' && styleBackgroundColor
      ? tokenStyles.backgroundColor_custom
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  // ADR-33 § 6 — unica eccezione ammessa a "zero CSS inline": una sola custom property
  // scoped, che può contenere solo un valore già passato dal pattern esadecimale
  // `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$` validato server-side — non è `style` libero.
  const inlineStyle: CSSProperties | undefined =
    typeof styleBackgroundColor === 'string' && styleBackgroundColor
      ? ({ '--section-bg': styleBackgroundColor } as CSSProperties)
      : undefined;

  return (
    <section className={className} style={inlineStyle}>
      {children}
    </section>
  );
}
