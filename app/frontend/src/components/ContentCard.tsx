/**
 * Contenitore bianco arrotondato per le pagine non-elenco (dashboard, profilo,
 * dettaglio, admin…). Le pagine senza il pattern elenco usano questo wrapper
 * per restare dentro una card.
 */
import type { ReactNode } from 'react';
import classes from './ContentCard.module.css';

interface ContentCardProps {
  children: ReactNode;
  /** Classe opzionale aggiuntiva (es. per estendere l'altezza in pagine specifiche). */
  className?: string;
}

/** Card bianca a tutta larghezza per il contenuto di pagina. */
export default function ContentCard({ children, className }: ContentCardProps): JSX.Element {
  return (
    <div className={className ? `${classes.card} ${className}` : classes.card}>{children}</div>
  );
}
