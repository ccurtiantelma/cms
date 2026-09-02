/**
 * Blocco `form-submit` (ADR-46 § 1, RFC-46 D1): pulsante di invio di un `form`, tipo a sé —
 * non riuso di `button` (che ha `href` obbligatoria). Unica prop dichiarata dal registro:
 * `label` (default `'Invia'`, `form-submit.block.ts`). Nessuna prop di variante/allineamento:
 * il registro non ne dichiara (ADR-46 § Conformità, "nessuna prop di blocco chiamata
 * .../equivalenti in nessun tipo del registro" — aggiungerne una qui senza una nuova ADR
 * sarebbe una modifica di schema non autorizzata, CLAUDE.md § Ask first). Foglia.
 */
import styles from './FormSubmitBlock.module.css';

interface FormSubmitBlockProps {
  label?: unknown;
}

export default function FormSubmitBlock({ label }: FormSubmitBlockProps) {
  const text = typeof label === 'string' && label ? label : 'Invia';
  return (
    <button type="submit" className={styles.submit}>
      {text}
    </button>
  );
}
