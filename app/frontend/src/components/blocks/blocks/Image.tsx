/**
 * Blocco `image`: `mediaRef` (guid) e `alt` (plainText, obbligatorio e non
 * vuoto, SPEC-F02-blocchi.md § 3.5), più le due props di stile responsive di
 * ADR-29 (`styleSpaceBefore`/`styleSpaceAfter`). Il `src` è risolto da
 * `resolveMediaSrc` (ADR-27 § 6, unico modulo di composizione condiviso fra
 * `app/frontend` e `app/public-site`) contro la rotta pubblica di ADR-27.
 *
 * `styleSizePreset`/`styleWidth`/`styleHeight`/`styleObjectFit`/`styleAlign` (ADR-58): cinque
 * prop opzionali e additive. Questo componente si limita a **dimensionare l'elemento nel
 * canvas** e a marcare `data-media-preset` — non costruisce un `<picture>`/`srcset`: quel
 * lavoro resta nella pipeline di export già esistente
 * (`app/backend/src/export/export.processor.ts`, riscrittura post-process dell'HTML per
 * `data-media-ref`/`data-media-preset`), mai duplicato qui. `styleWidth`/`styleHeight` sono
 * significative solo con `styleSizePreset='custom'`; per gli altri preset nominati
 * (`thumbnail|card|hero|og`) l'`aspect-ratio` è una tabella di proporzioni **solo display**,
 * dichiarata qui in modo indipendente da `PRESET_DIMENSIONS` del backend (ADR-49) — mai
 * l'autorità sul ritaglio reale, che resta del worker.
 *
 * Nessun `fetch`/effetto collaterale qui: il componente resta puro, montato anche via
 * `renderToStaticMarkup` (ADR-22 § 5) dove non esiste un ciclo di effetti significativo.
 * L'accodamento di `POST app/files/:guid/transform` al cambio di `styleSizePreset` vive
 * nell'editor (`useBlockEditorStore.ts`, `updateBlockPropsAction`), mai qui.
 *
 * **Segnaposto senza immagine**: `mediaRef` vuoto (nodo appena inserito, non ancora
 * confermato dal server — la prop è `required` a schema, ma un contenuto in bozza può
 * attraversare questo stato prima del salvataggio) rende un riquadro tratteggiato invece di
 * un `<img src="">` rotto — stesso principio di `ContentPlaceholderBlock.tsx`: niente
 * Mantine/`@tabler/icons-react` (raggiungibile anche dal sito pubblico via lo stesso
 * `BlockRenderer`), solo un'icona SVG inline.
 */
import type { CSSProperties } from 'react';
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
  styleSizePreset?: unknown;
  styleWidth?: unknown;
  styleHeight?: unknown;
  styleObjectFit?: unknown;
  styleAlign?: unknown;
}

/** I quattro preset art-directed della pipeline di ADR-49 (`full`/`custom` sono gestiti a parte). */
type NamedPreset = 'thumbnail' | 'card' | 'hero' | 'og';

/**
 * Rapporto d'aspetto **solo display** per ciascun preset nominato — non la fonte di verità
 * del ritaglio reale (quella resta `PRESET_DIMENSIONS` in `app/backend/src/files/...`,
 * ADR-49): una tabella indipendente e volutamente piccola, coerente con l'ADR-58
 * ("nessuna logica cross-workspace fra frontend e backend").
 */
const PRESET_ASPECT_RATIO: Record<NamedPreset, string> = {
  thumbnail: '1 / 1',
  card: '16 / 9',
  hero: '21 / 9',
  og: '1.91 / 1',
};

const NAMED_PRESETS = new Set<NamedPreset>(['thumbnail', 'card', 'hero', 'og']);

function isNamedPreset(value: unknown): value is NamedPreset {
  return typeof value === 'string' && NAMED_PRESETS.has(value as NamedPreset);
}

/** `{ value, unit }` di `kind: 'unitValue'` (ADR-38 § 2) in una stringa CSS, o `undefined` se malformato. */
function resolveUnitValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { value: numeric, unit } = value as { value?: unknown; unit?: unknown };
  if (typeof numeric !== 'number' || typeof unit !== 'string') return undefined;
  return `${numeric}${unit}`;
}

/**
 * Stile inline di dimensionamento/allineamento (ADR-58, punto 2): calcolato a ogni render dai
 * soli props correnti, mai memoizzato — un cambio di `styleSizePreset`/`styleWidth`/
 * `styleHeight`/`styleObjectFit`/`styleAlign` nell'inspector deve riflettersi immediatamente
 * sul canvas.
 */
function resolveSizeStyle(
  styleSizePreset: unknown,
  styleWidth: unknown,
  styleHeight: unknown,
  styleObjectFit: unknown,
  styleAlign: unknown,
): CSSProperties {
  const preset = typeof styleSizePreset === 'string' ? styleSizePreset : 'full';
  const objectFit =
    typeof styleObjectFit === 'string' ? (styleObjectFit as CSSProperties['objectFit']) : 'cover';
  const align = typeof styleAlign === 'string' ? styleAlign : 'left';

  const style: CSSProperties = {};

  if (preset === 'custom') {
    const width = resolveUnitValue(styleWidth);
    const height = resolveUnitValue(styleHeight);
    if (width) style.width = width;
    if (height) style.height = height;
    style.objectFit = objectFit;
  } else if (isNamedPreset(preset)) {
    style.aspectRatio = PRESET_ASPECT_RATIO[preset];
    style.objectFit = objectFit;
  }
  // `preset === 'full'`: nessuna modifica dimensionale, comportamento invariato (ADR-58).

  if (align === 'center') {
    style.marginLeft = 'auto';
    style.marginRight = 'auto';
  } else if (align === 'right') {
    style.marginLeft = 'auto';
    style.marginRight = '0';
  }

  return style;
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
  styleSizePreset,
  styleWidth,
  styleHeight,
  styleObjectFit,
  styleAlign,
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

  if (!mediaRef) {
    const placeholderClassName = [styles.placeholder, className].filter(Boolean).join(' ');
    return (
      <div className={placeholderClassName} data-block-role="image-placeholder">
        <svg
          className={styles.placeholderIcon}
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="10" r="1.6" />
          <path d="M21 16l-5.5-5.5a2 2 0 0 0-2.8 0L3 20" />
        </svg>
        <span className={styles.placeholderText}>Clicca o trascina un&apos;immagine qui</span>
      </div>
    );
  }

  const sizeStyle = resolveSizeStyle(
    styleSizePreset,
    styleWidth,
    styleHeight,
    styleObjectFit,
    styleAlign,
  );
  const mediaPreset = isNamedPreset(styleSizePreset) ? styleSizePreset : undefined;

  return (
    <img
      className={className}
      style={sizeStyle}
      alt={alt}
      src={resolveMediaSrc(mediaRef)}
      data-media-ref={mediaRef}
      data-media-preset={mediaPreset}
    />
  );
}
