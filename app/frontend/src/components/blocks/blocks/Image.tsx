/**
 * Blocco `image`: `mediaRef` (guid) e `alt` (plainText, obbligatorio e non
 * vuoto, SPEC-F02-blocchi.md § 3.5), più le due props di stile responsive di
 * ADR-29 (`styleSpaceBefore`/`styleSpaceAfter`). Il `src` è risolto da
 * `resolveMediaSrc` (ADR-27 § 6, unico modulo di composizione condiviso fra
 * `app/frontend` e `app/public-site`) contro la rotta pubblica di ADR-27.
 */
import styles from './Image.module.css';
import tokenStyles from '../style-tokens.module.css';
import {
  resolveHideClassName,
  resolveLayerClassName,
  resolveResponsiveClassNames,
} from '../style-tokens';
import { resolveMediaSrc } from '../media-url';

interface ImageProps {
  mediaRef: string;
  alt: string;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  styleLayer?: unknown;
  styleHideDesktop?: unknown;
  styleHideTablet?: unknown;
  styleHideMobile?: unknown;
}

export default function Image({
  mediaRef,
  alt,
  styleSpaceBefore,
  styleSpaceAfter,
  styleLayer,
  styleHideDesktop,
  styleHideTablet,
  styleHideMobile,
}: ImageProps) {
  const className = [
    styles.image,
    resolveResponsiveClassNames(tokenStyles, 'spaceBefore', styleSpaceBefore),
    resolveResponsiveClassNames(tokenStyles, 'spaceAfter', styleSpaceAfter),
    resolveLayerClassName(tokenStyles, styleLayer),
    resolveHideClassName(tokenStyles, 'hideDesktop', styleHideDesktop),
    resolveHideClassName(tokenStyles, 'hideTablet', styleHideTablet),
    resolveHideClassName(tokenStyles, 'hideMobile', styleHideMobile),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <img
      className={className}
      alt={alt}
      src={resolveMediaSrc(mediaRef)}
      data-media-ref={mediaRef}
    />
  );
}
