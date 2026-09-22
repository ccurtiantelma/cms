/**
 * Editing in-place del testo di un blocco (T9): props `editing` per `BlockRenderer` e stato
 * "focus dentro un discendente `contentEditable`".
 *
 * Il DOM resta l'unica fonte di verità mentre si digita (`Heading.tsx`), ma lo store riceve
 * comunque un `updateBlockPropsAction` dopo {@link EDIT_DEBOUNCE_MS}ms di inattività, così
 * undo stack e altri consumatori non restano indietro di un paragrafo. Timer manuale in un
 * `useRef`: un cancel/flush sotto controllo diretto, non `useDebouncedCallback`.
 */
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent as ReactFocusEvent,
} from 'react';
import { useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import type BlockRenderer from '../../../../components/blocks/BlockRenderer';

/** Millisecondi di inattività prima che un `on*Input` raggiunga lo store. */
const EDIT_DEBOUNCE_MS = 300;

type EditingProps = ComponentProps<typeof BlockRenderer>['editing'];

export function useBlockTextEditing(id: string, isSelected: boolean) {
  const updateBlockPropsAction = useBlockEditorStore((state) => state.updateBlockPropsAction);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * `true` mentre il focus è dentro un discendente `contentEditable`: il chiamante lo passa a
   * `useBlockDrag` (`disabled`), così un trascinamento accidentale non interrompe una
   * selezione di testo. Il bubbling nativo di focus/blur (React 17+) risale anche dai
   * contenitori che ospitano un figlio in editing: conservativo per costruzione.
   */
  const [isEditingText, setIsEditingText] = useState(false);

  function cancelDebouncedUpdate(): void {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function scheduleDebouncedUpdate(props: Record<string, unknown>): void {
    cancelDebouncedUpdate();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      updateBlockPropsAction(id, props);
    }, EDIT_DEBOUNCE_MS);
  }

  /** Commit immediato di `html` (`richText`), mai un tasto da debounced. */
  function commitHtml(nextHtml: string): void {
    cancelDebouncedUpdate();
    updateBlockPropsAction(id, { html: nextHtml });
  }

  // Il timer in sospeso non deve mai sparare contro un nodo deselezionato o smontato: il
  // cleanup del giro precedente copre cambio di `id`, flip di `isSelected` e smontaggio.
  useEffect(() => {
    return () => cancelDebouncedUpdate();
  }, [id, isSelected]);

  /** Solo sul nodo selezionato (mai su hover); i `*Change` (blur) committano subito, i `*Input` con debounce. */
  const editing: EditingProps = isSelected
    ? {
        editable: true,
        onTextChange: (nextText) => {
          cancelDebouncedUpdate();
          updateBlockPropsAction(id, { text: nextText });
        },
        onTextInput: (nextText) => scheduleDebouncedUpdate({ text: nextText }),
        onHtmlChange: commitHtml,
        onHtmlInput: (nextHtml) => scheduleDebouncedUpdate({ html: nextHtml }),
        onLabelChange: (nextLabel) => {
          cancelDebouncedUpdate();
          updateBlockPropsAction(id, { label: nextLabel });
        },
        onLabelInput: (nextLabel) => scheduleDebouncedUpdate({ label: nextLabel }),
      }
    : undefined;

  /** Solo un discendente in editing (mai il wrapper stesso, raggiunto da tab). */
  function onFocus(event: ReactFocusEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget && (event.target as HTMLElement).isContentEditable) {
      setIsEditingText(true);
    }
  }

  function onBlur(event: ReactFocusEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).isContentEditable) setIsEditingText(false);
  }

  return { editing, isEditingText, onFocus, onBlur };
}
