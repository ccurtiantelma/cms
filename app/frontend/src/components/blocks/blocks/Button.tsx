/**
 * Blocco `button`: `label` (plainText) e `href` (url, già validato
 * server-side contro lo schema ammesso, SPEC-F02-blocchi.md § 3.6), più le
 * cinque props di stile responsive di ADR-29. `label` è interpolato come
 * contenuto JSX, mai `dangerouslySetInnerHTML`.
 */
import styles from './Button.module.css';
import tokenStyles from '../style-tokens.module.css';
import { resolveResponsiveClassNames } from '../style-tokens';

interface ButtonProps {
  label: string;
  href: string;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  styleTextColor?: unknown;
  styleFontSize?: unknown;
  styleFontWeight?: unknown;
}

export default function Button({
  label,
  href,
  styleSpaceBefore,
  styleSpaceAfter,
  styleTextColor,
  styleFontSize,
  styleFontWeight,
}: ButtonProps) {
  const className = [
    styles.button,
    resolveResponsiveClassNames(tokenStyles, 'spaceBefore', styleSpaceBefore),
    resolveResponsiveClassNames(tokenStyles, 'spaceAfter', styleSpaceAfter),
    resolveResponsiveClassNames(tokenStyles, 'textColor', styleTextColor),
    resolveResponsiveClassNames(tokenStyles, 'fontSize', styleFontSize),
    resolveResponsiveClassNames(tokenStyles, 'fontWeight', styleFontWeight),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a className={className} href={href}>
      {label}
    </a>
  );
}
