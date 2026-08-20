/**
 * Blocco `section`: unico contenitore del registro (SPEC-F02-blocchi.md
 * § 3.2), più le quattro props di stile responsive di ADR-29
 * (`styleSpaceBefore`/`styleSpaceAfter`/`stylePadding`/`styleBackground`).
 * Il rendering dei figli è delegato al chiamante (`BlockRenderer`), che
 * ricorre e applica il proprio Error Boundary a ciascuno.
 */
import type { ReactNode } from 'react';
import styles from './Section.module.css';
import tokenStyles from '../style-tokens.module.css';
import { resolveResponsiveClassNames } from '../style-tokens';

interface SectionProps {
  children: ReactNode;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  stylePadding?: unknown;
  styleBackground?: unknown;
}

export default function Section({
  children,
  styleSpaceBefore,
  styleSpaceAfter,
  stylePadding,
  styleBackground,
}: SectionProps) {
  const className = [
    styles.section,
    resolveResponsiveClassNames(tokenStyles, 'spaceBefore', styleSpaceBefore),
    resolveResponsiveClassNames(tokenStyles, 'spaceAfter', styleSpaceAfter),
    resolveResponsiveClassNames(tokenStyles, 'padding', stylePadding),
    resolveResponsiveClassNames(tokenStyles, 'background', styleBackground),
  ]
    .filter(Boolean)
    .join(' ');

  return <section className={className}>{children}</section>;
}
