/**
 * Blocco `richText`: `html` è già sanitizzato server-side pre-persistenza
 * contro l'allowlist del profilo `basic` (ADR-20/ADR-21, SPEC-F02-blocchi.md
 * § 2.1). Unico blocco del CMS in cui `dangerouslySetInnerHTML` è ammesso:
 * nessuna prop plainText usa questa via. Più le cinque props di stile
 * responsive di ADR-29.
 */
import styles from './RichText.module.css';
import tokenStyles from '../style-tokens.module.css';
import { resolveResponsiveClassNames } from '../style-tokens';

interface RichTextProps {
  html: string;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  styleTextColor?: unknown;
  styleFontSize?: unknown;
  styleFontWeight?: unknown;
}

export default function RichText({
  html,
  styleSpaceBefore,
  styleSpaceAfter,
  styleTextColor,
  styleFontSize,
  styleFontWeight,
}: RichTextProps) {
  const className = [
    styles.richText,
    resolveResponsiveClassNames(tokenStyles, 'spaceBefore', styleSpaceBefore),
    resolveResponsiveClassNames(tokenStyles, 'spaceAfter', styleSpaceAfter),
    resolveResponsiveClassNames(tokenStyles, 'textColor', styleTextColor),
    resolveResponsiveClassNames(tokenStyles, 'fontSize', styleFontSize),
    resolveResponsiveClassNames(tokenStyles, 'fontWeight', styleFontWeight),
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
