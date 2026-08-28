import styles from './CanvasDropIndicator.module.css';

interface CanvasDropIndicatorProps {
  /** Mostra la linea solo quando il punto di rilascio è il target corrente. */
  visible: boolean;
}

/** Linea orizzontale che evidenzia il punto di rilascio nel canvas. */
export default function CanvasDropIndicator({
  visible,
}: CanvasDropIndicatorProps): JSX.Element | null {
  if (!visible) return null;

  return <div className={styles.indicator} aria-hidden="true" />;
}
