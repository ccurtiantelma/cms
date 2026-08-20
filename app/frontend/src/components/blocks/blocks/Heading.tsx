/**
 * Blocco `heading`: `level` (h2-h6) e `text` (plainText, SPEC-F02-blocchi.md
 * § 3.3), più le cinque props di stile responsive di ADR-29
 * (`styleSpaceBefore`/`styleSpaceAfter`/`styleTextColor`/`styleFontSize`/
 * `styleFontWeight`). `text` è interpolato come contenuto JSX, mai
 * `dangerouslySetInnerHTML`: `plainText` è persistito verbatim, l'escaping è
 * responsabilità del renderer.
 */
import styles from './Heading.module.css';
import tokenStyles from '../style-tokens.module.css';
import { resolveResponsiveClassNames } from '../style-tokens';

interface HeadingProps {
  level: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  text: string;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  styleTextColor?: unknown;
  styleFontSize?: unknown;
  styleFontWeight?: unknown;
}

export default function Heading({
  level: Level,
  text,
  styleSpaceBefore,
  styleSpaceAfter,
  styleTextColor,
  styleFontSize,
  styleFontWeight,
}: HeadingProps) {
  const className = [
    styles.heading,
    resolveResponsiveClassNames(tokenStyles, 'spaceBefore', styleSpaceBefore),
    resolveResponsiveClassNames(tokenStyles, 'spaceAfter', styleSpaceAfter),
    resolveResponsiveClassNames(tokenStyles, 'textColor', styleTextColor),
    resolveResponsiveClassNames(tokenStyles, 'fontSize', styleFontSize),
    resolveResponsiveClassNames(tokenStyles, 'fontWeight', styleFontWeight),
  ]
    .filter(Boolean)
    .join(' ');

  return <Level className={className}>{text}</Level>;
}
