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
 *
 * Sincronizzazione DOM ↔ `html` (Canvas Sync, editing in-place): stesso principio di
 * `Heading.tsx` — un `useLayoutEffect` scrive `innerHTML` sul nodo referenziato solo se
 * differisce da quanto già presente, cosicché il giro di ritorno del debounce
 * (`onHtmlInput` → store → prop `html` aggiornata → re-render) non riscriva mai un
 * contenuto identico a quello appena digitato, che sposterebbe il cursore. Un cambio
 * genuino dall'esterno (undo/redo, cambio pagina, HTML ri-sanitizzato dal server) resta
 * scritto normalmente.
 */
import { useLayoutEffect, useRef } from 'react';
import styles from './RichText.module.css';
import tokenStyles from '../style-tokens.module.css';
import {
  resolveHideClassName,
  resolveLayerClassName,
  resolveResponsiveClassNames,
} from '../style-tokens';

interface RichTextProps {
  html: string;
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
  styleLayer,
  styleHideDesktop,
  styleHideTablet,
  styleHideMobile,
  editable = false,
  onHtmlChange,
  onHtmlInput,
}: RichTextProps) {
  /** Nodo DOM del blocco in editing — vedi il commento di testa del file. */
  const elementRef = useRef<HTMLDivElement | null>(null);

  // Scrive `html` nel DOM solo quando differisce da ciò che c'è già: mount iniziale (il
  // `div` in editing parte senza `dangerouslySetInnerHTML`, vedi sotto) e cambi genuini
  // dall'esterno, mai il giro di ritorno del proprio debounce (vedi commento di testa).
  useLayoutEffect(() => {
    if (!editable) return;
    const element = elementRef.current;
    if (element && element.innerHTML !== html) {
      element.innerHTML = html;
    }
  }, [editable, html]);

  const className = [
    styles.richText,
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
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // `dangerouslySetInnerHTML` resta il modo in cui il DOM riceve il contenuto iniziale;
  // da lì in poi, come in `Heading.tsx`, il DOM è l'unica fonte di verità — nessun
  // re-render con `html` come `value` controllato, che sposterebbe il cursore ad ogni
  // digitazione. `onInput` notifica ad ogni tasto, `onBlur` resta il commit definitivo.
  //
  // `defaultParagraphSeparator` a `p` (su `focus`, non una sola volta al mount: il comando
  // agisce sul documento attivo, e più blocchi `richText` possono alternarsi in editing
  // nella stessa sessione): senza, Chrome andrebbe a capo con un `<div>` a ogni `Enter`, un
  // tag fuori dall'allowlist del profilo `basic` (`block-sanitize-profiles.config.ts`) che
  // il server scarterebbe silenziosamente al salvataggio — la formattazione sparirebbe
  // senza errore visibile. `Shift+Enter` forza esplicitamente un `<br>` (a capo semplice,
  // sempre ammesso), invece di affidarsi al comportamento di default del browser per quel
  // tasto. `Escape` annulla le modifiche non consolidate riportando il DOM a `html` — la
  // prop resta invariata durante l'editing (vedi commento di testa del file) — e sfoca:
  // l'`onBlur` sotto committa quindi il valore appena ripristinato, cancellando anche un
  // eventuale aggiornamento debounced ancora in sospeso lato chiamante
  // (`EditorBlockWrapper.tsx`, che cancella il timer prima di ogni `onHtmlChange`).
  // Nessun `dangerouslySetInnerHTML` qui (a differenza del ramo sola lettura sopra): il
  // contenuto iniziale è scritto dal `useLayoutEffect` di testa, e da lì in poi il DOM
  // resta l'unica fonte di verità — mai un `html` riconciliato da React ad ogni render.
  return (
    <div
      ref={elementRef}
      className={className}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
      onInput={(event) => onHtmlInput?.(event.currentTarget.innerHTML)}
      onBlur={(event) => onHtmlChange?.(event.currentTarget.innerHTML)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.shiftKey) {
          event.preventDefault();
          document.execCommand('insertLineBreak');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.innerHTML = html;
          event.currentTarget.blur();
        }
      }}
    />
  );
}
