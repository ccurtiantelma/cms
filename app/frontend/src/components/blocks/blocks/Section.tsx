/**
 * Blocco `section`: unico contenitore del registro (SPEC-F02-blocchi.md
 * § 3.2), nessuna prop propria. Il rendering dei figli è delegato al
 * chiamante (`BlockRenderer`), che ricorre e applica il proprio Error
 * Boundary a ciascuno.
 */
import type { ReactNode } from 'react';
import styles from './Section.module.css';

interface SectionProps {
  children: ReactNode;
}

export default function Section({ children }: SectionProps) {
  return <section className={styles.section}>{children}</section>;
}
