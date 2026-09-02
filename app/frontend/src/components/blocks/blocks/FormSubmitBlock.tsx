/**
 * Blocco `form-submit` (ADR-46 § 1, RFC-46 D1): pulsante di invio di un `form`, tipo a sé —
 * non riuso di `button` (che ha `href` obbligatoria). Prop dichiarate dal registro: `label`
 * (default `'Invia'`, `form-submit.block.ts`) più `styleBackgroundColor`/`styleTextColor`
 * (`kind: 'color'`, ADR-47 § 1), aggiunte con la firma già approvata — non una modifica di
 * schema non autorizzata. Entrambe applicate per proprietà separate a un oggetto `style`
 * React, mai concatenate in una stringa CSS/HTML (vincolo permanente ADR-47). Foglia.
 */
import type { CSSProperties } from 'react';
import styles from './FormSubmitBlock.module.css';

interface FormSubmitBlockProps {
  label?: unknown;
  styleBackgroundColor?: unknown;
  styleTextColor?: unknown;
}

export default function FormSubmitBlock({
  label,
  styleBackgroundColor,
  styleTextColor,
}: FormSubmitBlockProps) {
  const text = typeof label === 'string' && label ? label : 'Invia';

  const inlineStyle: CSSProperties = {
    ...(typeof styleBackgroundColor === 'string' && styleBackgroundColor
      ? { backgroundColor: styleBackgroundColor }
      : {}),
    ...(typeof styleTextColor === 'string' && styleTextColor ? { color: styleTextColor } : {}),
  };
  const resolvedInlineStyle = Object.keys(inlineStyle).length > 0 ? inlineStyle : undefined;

  return (
    <button type="submit" className={styles.submit} style={resolvedInlineStyle}>
      {text}
    </button>
  );
}
