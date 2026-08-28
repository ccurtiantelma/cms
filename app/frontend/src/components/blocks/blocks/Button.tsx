/**
 * Blocco `button`: `label` (plainText) e `href` (url, già validato
 * server-side contro lo schema ammesso, SPEC-F02-blocchi.md § 3.6), più le
 * sei props di stile responsive di ADR-29 (incluso `styleFontFamily`). `label`
 * è interpolato come contenuto JSX, mai `dangerouslySetInnerHTML`.
 *
 * `editable`/`onLabelChange`/`onLabelInput` (PLAN-F04c-editor-maturo.md T9): stesso
 * principio di `Heading.tsx` — opzionali, valorizzate solo dall'editor
 * (`EditorBlockWrapper.tsx`) sul nodo selezionato, mai dal sito pubblico, dove restano
 * `undefined` e il componente rende esattamente come prima. In editing il click non deve
 * navigare (`event.preventDefault()` solo quando `editable` è vero): il sito pubblico,
 * dove `editable` è sempre `undefined`, non è toccato da questo comportamento. Questo file
 * non importa Mantine né lo store dell'editor (CLAUDE.md § confine Mantine/blocchi):
 * l'unica concessione è `contentEditable` nativo, nessuna dipendenza nuova.
 */
import { useLayoutEffect, useRef } from 'react';
import styles from './Button.module.css';
import tokenStyles from '../style-tokens.module.css';
import {
  resolveHideClassName,
  resolveLayerClassName,
  resolveResponsiveClassNames,
} from '../style-tokens';

interface ButtonProps {
  label: string;
  href: string;
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
  /** Commit dell'etichetta modificata — chiamato su `blur`, mai ad ogni tasto. */
  onLabelChange?: (nextLabel: string) => void;
  /** Notifica ad ogni tasto (debounce lato chiamante) — non è un commit definitivo. */
  onLabelInput?: (nextLabel: string) => void;
}

export default function Button({
  label,
  href,
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
  onLabelChange,
  onLabelInput,
}: ButtonProps) {
  /** Nodo DOM dell'etichetta in editing. */
  const elementRef = useRef<HTMLAnchorElement | null>(null);

  useLayoutEffect(() => {
    if (!editable) return;
    const element = elementRef.current;
    if (element && element.textContent !== label) {
      element.textContent = label;
    }
  }, [editable, label]);

  const className = [
    styles.button,
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
    return (
      <a className={className} href={href}>
        {label}
      </a>
    );
  }

  // Come in `Heading.tsx`: il DOM resta l'unica fonte di verità del testo in corso di
  // modifica, nessun `value` controllato che sposterebbe il cursore ad ogni digitazione.
  // `onClick` con `preventDefault` impedisce la navigazione mentre si sta modificando
  // l'etichetta nel canvas dell'editor.
  return (
    <a
      ref={elementRef}
      className={className}
      href={href}
      contentEditable
      suppressContentEditableWarning
      onClick={(event) => {
        if (editable) event.preventDefault();
      }}
      onInput={(event) => onLabelInput?.(event.currentTarget.textContent ?? '')}
      onBlur={(event) => onLabelChange?.(event.currentTarget.textContent ?? '')}
    />
  );
}
