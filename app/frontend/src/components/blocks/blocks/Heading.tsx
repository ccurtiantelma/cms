/**
 * Blocco `heading`: `level` (h2-h6) e `text` (plainText, SPEC-F02-blocchi.md
 * § 3.3), più le sei props di stile responsive di ADR-29
 * (`styleSpaceBefore`/`styleSpaceAfter`/`styleTextColor`/`styleFontSize`/
 * `styleFontWeight`/`styleFontFamily`). `text` è interpolato come contenuto JSX, mai
 * `dangerouslySetInnerHTML`: `plainText` è persistito verbatim, l'escaping è
 * responsabilità del renderer.
 *
 * `editable`/`onTextChange`/`onTextInput` (PLAN-F04c-editor-maturo.md T9): opzionali,
 * valorizzate solo dal chiamante editor (`EditorBlockWrapper.tsx`) quando questo nodo è
 * selezionato — mai dal sito pubblico, dove restano `undefined` e il componente rende
 * esattamente come prima. `onTextChange` è il commit su `blur`; `onTextInput` notifica ad
 * ogni tasto e il chiamante lo usa per un dispatch allo store debounced (il debounce vive
 * in `EditorBlockWrapper.tsx`, non qui). Questo file non importa Mantine né lo store
 * dell'editor (CLAUDE.md § confine Mantine/blocchi): l'unica concessione è
 * `contentEditable` nativo, nessuna dipendenza nuova (niente TipTap).
 */
import styles from './Heading.module.css';
import tokenStyles from '../style-tokens.module.css';
import {
  resolveHideClassName,
  resolveLayerClassName,
  resolveResponsiveClassNames,
} from '../style-tokens';

interface HeadingProps {
  level: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  text: string;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  styleTextColor?: unknown;
  styleFontSize?: unknown;
  styleFontWeight?: unknown;
  styleFontFamily?: unknown;
  styleLayer?: unknown;
  styleHideDesktop?: unknown;
  styleHideTablet?: unknown;
  styleHideMobile?: unknown;
  /** Editing in-place attivo (solo editor, solo nodo selezionato — mai sul sito pubblico). */
  editable?: boolean;
  /** Commit del testo modificato — chiamato su `blur`. */
  onTextChange?: (nextText: string) => void;
  /** Notifica ad ogni tasto (debounce lato chiamante) — non è un commit definitivo. */
  onTextInput?: (nextText: string) => void;
}

export default function Heading({
  level: Level,
  text,
  styleSpaceBefore,
  styleSpaceAfter,
  styleTextColor,
  styleFontSize,
  styleFontWeight,
  styleFontFamily,
  styleLayer,
  styleHideDesktop,
  styleHideTablet,
  styleHideMobile,
  editable = false,
  onTextChange,
  onTextInput,
}: HeadingProps) {
  const className = [
    styles.heading,
    editable ? styles.editable : '',
    resolveResponsiveClassNames(tokenStyles, 'spaceBefore', styleSpaceBefore),
    resolveResponsiveClassNames(tokenStyles, 'spaceAfter', styleSpaceAfter),
    resolveResponsiveClassNames(tokenStyles, 'textColor', styleTextColor),
    resolveResponsiveClassNames(tokenStyles, 'fontSize', styleFontSize),
    resolveResponsiveClassNames(tokenStyles, 'fontWeight', styleFontWeight),
    resolveResponsiveClassNames(tokenStyles, 'fontFamily', styleFontFamily),
    resolveLayerClassName(tokenStyles, styleLayer),
    resolveHideClassName(tokenStyles, 'hideDesktop', styleHideDesktop),
    resolveHideClassName(tokenStyles, 'hideTablet', styleHideTablet),
    resolveHideClassName(tokenStyles, 'hideMobile', styleHideMobile),
  ]
    .filter(Boolean)
    .join(' ');

  if (!editable) {
    return <Level className={className}>{text}</Level>;
  }

  // `text` non viene ri-scritto nell'elemento mentre l'utente digita (nessun `value`
  // controllato su un `contentEditable`, che sposterebbe il cursore ad ogni render): il DOM
  // resta l'unica fonte di verità del contenuto in corso di modifica. `onInput` notifica
  // ad ogni tasto (il chiamante decide se/come debounced verso lo store), `onBlur` resta il
  // commit immediato e definitivo.
  //
  // `Enter` consolida e sfoca (un titolo è testo su una riga sola, mai multi-paragrafo):
  // `blur()` innesca `onBlur` sotto, che commit il testo già presente nel DOM. `Escape`
  // annulla le modifiche non consolidate riportando il DOM al valore di `text` — l'ultima
  // prop committata, che resta invariata durante l'editing (vedi commento di testa) — e
  // sfoca a sua volta: lo stesso `onBlur` committa quindi il valore appena ripristinato,
  // cancellando anche un eventuale aggiornamento debounced ancora in sospeso lato chiamante
  // (`EditorBlockWrapper.tsx`, che cancella il timer prima di ogni `onTextChange`).
  return (
    <Level
      className={className}
      contentEditable
      suppressContentEditableWarning
      onInput={(event) => onTextInput?.(event.currentTarget.textContent ?? '')}
      onBlur={(event) => onTextChange?.(event.currentTarget.textContent ?? '')}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.textContent = text;
          event.currentTarget.blur();
        }
      }}
    >
      {text}
    </Level>
  );
}
