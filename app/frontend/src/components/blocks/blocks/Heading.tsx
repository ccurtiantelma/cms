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
 *
 * Sincronizzazione DOM ↔ `text` (Canvas Sync, editing in-place): il nodo `contentEditable`
 * non riceve mai `text` come figlio JSX in editing — un `useLayoutEffect` scrive
 * `textContent` sul nodo referenziato **solo se differisce** da quanto già presente nel
 * DOM. Senza questo confronto, il giro di andata e ritorno del debounce
 * (`EditorBlockWrapper.tsx`: `onTextInput` → store → prop `text` aggiornata → re-render)
 * farebbe scrivere a React lo stesso testo già digitato dall'utente: la reconciliation
 * confronta il valore committato in precedenza (quello ANTE la digitazione) con quello
 * nuovo, li trova diversi e riscrive comunque il nodo di testo, spostando il cursore alla
 * fine — esattamente il difetto che questo confronto elimina. Un cambio genuino dall'esterno
 * (undo/redo, cambio di pagina, contenuto ri-sanitizzato dal server dopo il salvataggio)
 * resta scritto normalmente, perché in quei casi il DOM e la prop divergono davvero.
 */
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import styles from './Heading.module.css';
import tokenStyles from '../style-tokens.module.css';
import {
  resolveHideClassName,
  resolveLayerClassName,
  resolveResponsiveClassNames,
} from '../style-tokens';

/** `styleTextAlign` è già validato server-side contro l'enum del registro (ADR-47 § 1). */
function isTextAlign(value: unknown): value is 'left' | 'center' | 'right' | 'justify' {
  return typeof value === 'string' && ['left', 'center', 'right', 'justify'].includes(value);
}

interface HeadingProps {
  level: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  text: string;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  styleTextColor?: unknown;
  styleTextColorCustom?: unknown;
  styleFontSize?: unknown;
  styleFontWeight?: unknown;
  styleFontFamily?: unknown;
  styleLayer?: unknown;
  styleHideDesktop?: unknown;
  styleHideTablet?: unknown;
  styleHideMobile?: unknown;
  /** ADR-47 § 1: `left | center | right | justify`, applicato come `text-align` inline. */
  styleTextAlign?: unknown;
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
  styleTextColorCustom,
  styleFontSize,
  styleFontWeight,
  styleFontFamily,
  styleLayer,
  styleHideDesktop,
  styleHideTablet,
  styleHideMobile,
  styleTextAlign,
  editable = false,
  onTextChange,
  onTextInput,
}: HeadingProps) {
  /** Nodo DOM del titolo in editing — vedi il commento di testa del file. */
  const elementRef = useRef<HTMLHeadingElement | null>(null);
  const placeholder = 'Titolo';

  // Scrive `text` nel DOM solo quando differisce da ciò che c'è già: mount iniziale (il
  // nodo `contentEditable` parte senza figli JSX, vedi sotto) e cambi genuini dall'esterno,
  // mai il giro di ritorno del proprio debounce (vedi commento di testa).
  useLayoutEffect(() => {
    if (!editable) return;
    const element = elementRef.current;
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }, [editable, text]);

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

  // Il colore/allineamento arrivano dal JSON già validato server-side e vengono applicati
  // al nodo principale (stesso pattern di `Section.tsx` per `styleBackgroundColor`), con
  // priorità sul token `styleTextColor` a parità di specificità inline vs. classe.
  const inlineStyle: CSSProperties = {
    ...(typeof styleTextColorCustom === 'string' && styleTextColorCustom
      ? { color: styleTextColorCustom }
      : {}),
    ...(isTextAlign(styleTextAlign) ? { textAlign: styleTextAlign } : {}),
  };
  const resolvedInlineStyle = Object.keys(inlineStyle).length > 0 ? inlineStyle : undefined;

  if (!editable) {
    return (
      <Level className={className} style={resolvedInlineStyle}>
        {text}
      </Level>
    );
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
  // Nessun figlio JSX qui (a differenza del ramo sola lettura sopra): il contenuto
  // iniziale è scritto dal `useLayoutEffect` di testa, e da lì in poi il DOM resta
  // l'unica fonte di verità — mai un `text` passato come children che React
  // riconcilierebbe ad ogni render.
  return (
    <Level
      ref={elementRef}
      className={className}
      style={resolvedInlineStyle}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(event) => onTextInput?.(event.currentTarget.textContent ?? '')}
      onBlur={(event) => onTextChange?.(event.currentTarget.textContent ?? '')}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.textContent = text ?? '';
          event.currentTarget.blur();
        }
      }}
    />
  );
}
