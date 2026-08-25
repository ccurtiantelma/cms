/**
 * Blocco `richText`: `html` è già sanitizzato server-side pre-persistenza
 * contro l'allowlist del profilo `basic` (ADR-20/ADR-21, SPEC-F02-blocchi.md
 * § 2.1). Unico blocco del CMS in cui `dangerouslySetInnerHTML` è ammesso:
 * nessuna prop plainText usa questa via. Più le cinque props di stile
 * responsive di ADR-29.
 *
 * `editable`/`onHtmlChange`/`onHtmlInput` (PLAN-F04c-editor-maturo.md T9): stesso principio
 * di `Heading.tsx` — opzionali, valorizzate solo dall'editor sul nodo selezionato. In editing
 * l'intero `div` diventa `contentEditable`; il commit su `blur` (`onHtmlChange`) e la
 * notifica ad ogni tasto (`onHtmlInput`, per un dispatch debounced lato chiamante) leggono
 * entrambi `innerHTML` (non `textContent`: questo blocco è HTML, non plainText). Nessuna
 * sanitizzazione lato client: resta autorità esclusiva del server pre-persistenza,
 * invariata — questo componente non fa altro che proporre l'HTML digitato al chiamante,
 * che lo affiderà a `updateBlockPropsAction` e infine al salvataggio server-side.
 */
import styles from './RichText.module.css';
import tokenStyles from '../style-tokens.module.css';
import { resolveResponsiveClassNames } from '../style-tokens';

interface RichTextProps {
  html: string;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  styleTextColor?: unknown;
  styleFontSize?: unknown;
  styleFontWeight?: unknown;
  styleFontFamily?: unknown;
  /** Editing in-place attivo (solo editor, solo nodo selezionato — mai sul sito pubblico). */
  editable?: boolean;
  /** Commit dell'HTML modificato — chiamato su `blur`. */
  onHtmlChange?: (nextHtml: string) => void;
  /** Notifica ad ogni tasto (debounce lato chiamante) — non è un commit definitivo. */
  onHtmlInput?: (nextHtml: string) => void;
}

export default function RichText({
  html,
  styleSpaceBefore,
  styleSpaceAfter,
  styleTextColor,
  styleFontSize,
  styleFontWeight,
  styleFontFamily,
  editable = false,
  onHtmlChange,
  onHtmlInput,
}: RichTextProps) {
  const className = [
    styles.richText,
    editable ? styles.editable : '',
    resolveResponsiveClassNames(tokenStyles, 'spaceBefore', styleSpaceBefore),
    resolveResponsiveClassNames(tokenStyles, 'spaceAfter', styleSpaceAfter),
    resolveResponsiveClassNames(tokenStyles, 'textColor', styleTextColor),
    resolveResponsiveClassNames(tokenStyles, 'fontSize', styleFontSize),
    resolveResponsiveClassNames(tokenStyles, 'fontWeight', styleFontWeight),
    resolveResponsiveClassNames(tokenStyles, 'fontFamily', styleFontFamily),
  ]
    .filter(Boolean)
    .join(' ');

  if (!editable) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // `dangerouslySetInnerHTML` resta il modo in cui il DOM riceve il contenuto iniziale;
  // da lì in poi, come in `Heading.tsx`, il DOM è l'unica fonte di verità — nessun
  // re-render con `html` come `value` controllato, che sposterebbe il cursore ad ogni
  // digitazione. `onInput` notifica ad ogni tasto, `onBlur` resta il commit definitivo.
  return (
    <div
      className={className}
      contentEditable
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: html }}
      onInput={(event) => onHtmlInput?.(event.currentTarget.innerHTML)}
      onBlur={(event) => onHtmlChange?.(event.currentTarget.innerHTML)}
    />
  );
}
