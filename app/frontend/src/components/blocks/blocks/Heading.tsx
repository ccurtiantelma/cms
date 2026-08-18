/**
 * Blocco `heading`: `level` (h2-h6) e `text` (plainText, SPEC-F02-blocchi.md
 * § 3.3). `text` è interpolato come contenuto JSX, mai `dangerouslySetInnerHTML`:
 * `plainText` è persistito verbatim, l'escaping è responsabilità del renderer.
 */
import styles from './Heading.module.css';

interface HeadingProps {
  level: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  text: string;
}

export default function Heading({ level: Level, text }: HeadingProps) {
  return <Level className={styles.heading}>{text}</Level>;
}
