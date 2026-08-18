/**
 * Blocco `richText`: `html` è già sanitizzato server-side pre-persistenza
 * contro l'allowlist del profilo `basic` (ADR-20/ADR-21, SPEC-F02-blocchi.md
 * § 2.1). Unico blocco del CMS in cui `dangerouslySetInnerHTML` è ammesso:
 * nessuna prop plainText usa questa via.
 */
import styles from './RichText.module.css';

interface RichTextProps {
  html: string;
}

export default function RichText({ html }: RichTextProps) {
  return <div className={styles.richText} dangerouslySetInnerHTML={{ __html: html }} />;
}
