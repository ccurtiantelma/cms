/**
 * Blocco `gallery` (`PLAN-parita-elementor-pro.md` § R4 "Widget base CSS-only"):
 * `children.allow: ['image']` — nessun tipo-figlio dedicato (a differenza di
 * `carousel`/`carouselSlide`, ADR-57 § 2), i figli sono nodi `image` ordinari già
 * renderizzati ricorsivamente da `BlockRenderer.tsx`/`EditorBlockWrapper.tsx` esattamente
 * come i figli di `container`. Questo componente si limita a `{children}`.
 *
 * `layout` (`kind: 'layout'`, identico a `container` v2, ADR-82 § "Decisione" punto 1)
 * **non è letto qui**: è un valore libero PropKind v2, reso dal Runtime Style Bridge
 * (`generateCanvasCss.ts`) via il selettore `[data-canvas-style-id="<id>"]` su questo
 * stesso elemento radice — mai una seconda implementazione locale della stessa
 * conversione valore→CSS (CLAUDE.md, mirror unico). `generateCanvasCss.ts` itera
 * genericamente sulle prop dichiarate dal registro per ogni tipo di blocco: `gallery`
 * ottiene quindi il CSS di `layout` senza alcuna modifica a quel modulo.
 *
 * `galleryMode`/`lightbox` sono invece le poche prop scalari semplici non coperte dal
 * Bridge, rese qui con `data-gallery-mode`/`data-lightbox` (stesso principio delle prop
 * scalari di `Container.tsx`, ma via attributo `data-*` anziché `style` inline: la resa
 * `masonry`/`metro` è puro CSS-only via selettore attributo, `GalleryBlock.module.css`).
 * `lightbox` è **solo persistito in questo round**: nessun runtime JS lo onora ancora — il
 * runtime pubblico che lo consumerebbe è R5 di `PLAN-parita-elementor-pro.md`, non ancora
 * costruito, stesso debito dichiarato già presente per `container.background.video`/
 * `slideshow`. L'attributo `data-lightbox` resta quindi privo di comportamento qui: solo
 * un aggancio futuro per quel runtime.
 *
 * `hideOn` (`kind: 'hideOn'`) **non è letto qui**: nessun componente del registro rende
 * ancora questo `kind` (la migrazione frontend v1→v2 di `styleHideDesktop/Tablet/Mobile`
 * a `hideOn` non è completa — vedi `Image.tsx`, che dichiara ancora i tre booleani v1),
 * quindi la prop resta dichiarata nello schema ma senza resa CSS qui — stesso debito
 * esplicito già accettato altrove (`container.background.video`, ADR-82 § "Conseguenze").
 */
import type { ReactNode } from 'react';
import styles from './GalleryBlock.module.css';

const GALLERY_MODES = ['grid', 'masonry', 'metro'] as const;
type GalleryMode = (typeof GALLERY_MODES)[number];

function resolveGalleryMode(value: unknown): GalleryMode {
  return typeof value === 'string' && (GALLERY_MODES as readonly string[]).includes(value)
    ? (value as GalleryMode)
    : 'grid';
}

interface GalleryBlockProps {
  /** `node.id` strutturale — vedi il commento di testa del file, paragrafo `layout`. */
  id?: string;
  children: ReactNode;
  galleryMode?: unknown;
  lightbox?: unknown;
  customCssClass?: unknown;
  customElementId?: unknown;
}

export default function GalleryBlock({
  id,
  children,
  galleryMode,
  lightbox,
  customCssClass,
  customElementId,
}: GalleryBlockProps) {
  const className = [
    styles.gallery,
    typeof customCssClass === 'string' && customCssClass ? customCssClass : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      id={typeof customElementId === 'string' && customElementId ? customElementId : undefined}
      data-canvas-style-id={id}
      data-gallery-mode={resolveGalleryMode(galleryMode)}
      data-lightbox={lightbox === true ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
