/**
 * Blocco `image`: `mediaRef` (guid) e `alt` (plainText, obbligatorio e
 * non vuoto, SPEC-F02-blocchi.md § 3.5). La risoluzione del `mediaRef` in
 * un URL è di F09 ed è esplicitamente fuori scope di T8 (PLAN-F02-blocchi.md
 * "Fuori scope, dichiarato"): niente `src` risolta, solo un placeholder
 * strutturale con `data-media-ref` in attesa della media library.
 */
import styles from './Image.module.css';

interface ImageProps {
  mediaRef: string;
  alt: string;
}

export default function Image({ mediaRef, alt }: ImageProps) {
  return <img className={styles.image} alt={alt} data-media-ref={mediaRef} />;
}
