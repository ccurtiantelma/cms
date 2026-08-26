/**
 * Barra di formattazione fluttuante sopra la selezione testuale del blocco `richText` in
 * editing (PLAN-F04c-editor-maturo.md T9, estensione richiesta esplicitamente: la toolbar
 * generica del nodo selezionato — `floatingActionBar`/`sectionActionTab`, EditorBlockWrapper.tsx
 * — governa drag/duplica/elimina, non la formattazione del testo). Solo su `richText`: `heading`
 * ha `text` dichiarato `plainText` dal registro (SPEC-F02-blocchi.md § 3.3) — Grassetto/Corsivo/
 * Link cambierebbero il `kind` della prop, una modifica di schema blocco fuori scope (CLAUDE.md
 * § Ask first), quindi questo componente non viene montato su `heading`.
 *
 * Nessuna dipendenza pesante nuova (requisito tassativo del task): i comandi passano da
 * `document.execCommand`, l'unica via nativa disponibile per manipolare la selezione di un
 * `contentEditable` senza introdurre un secondo motore di rich text accanto a quello già
 * approvato (`@mantine/tiptap`, usato solo dall'ispettore a schede — `RichTextFieldEditor.tsx`,
 * ADR-26 — mai dal canvas). `execCommand` è deprecato ma ancora universalmente supportato nei
 * browser desktop di amministrazione di questo CMS; ogni comando qui prodotto (`<b>`/`<strong>`,
 * `<i>`/`<em>`, `<u>`, `<a>`, `text-align` su `<p>`) resta dentro l'allowlist del profilo
 * `basic` (`block-sanitize-profiles.config.ts`), verificata server-side pre-persistenza
 * (ADR-20/ADR-21) — questo componente non sanitizza nulla, propone solo l'HTML risultante al
 * chiamante, che lo affida a `updateBlockPropsAction` come ogni altro commit di questo file.
 *
 * Posizionamento: `position: fixed` (CSS module), ancorato al bounding box della selezione
 * corrente o, se non c'è nulla di selezionato (solo un cursore), a quello dell'intero blocco
 * `contentEditable` — clampato al viewport in un secondo passaggio (`useLayoutEffect`), una
 * volta nota la dimensione reale della barra dopo il primo render.
 */
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { ActionIcon, Popover, TextInput, Tooltip } from '@mantine/core';
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconClearFormatting,
  IconItalic,
  IconLink,
  IconUnlink,
} from '@tabler/icons-react';
import styles from './InlineFloatingToolbar.module.css';

interface InlineFloatingToolbarProps {
  /**
   * Risolve il nodo `contentEditable` su cui operano i comandi, o `null` se non è (più)
   * montato. Una funzione, non un `RefObject`: il chiamante (`EditorBlockWrapper.tsx`) lo
   * trova con un `querySelector` sul proprio wrapper, non con un ref forwardato da
   * `RichText.tsx` — che così non acquisisce dipendenze di editor.
   */
  getTarget: () => HTMLElement | null;
  /** Commit immediato (non debounced) dell'HTML risultante dopo un comando di formattazione. */
  onApplied: (nextHtml: string) => void;
}

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

/** `true` se il nodo di ancoraggio della selezione corrente è dentro `target` (o è `target` stesso). */
function isSelectionInside(target: HTMLElement, node: Node | null): boolean {
  return !!node && (node === target || target.contains(node));
}

/** Risale dagli antenati del nodo di ancoraggio per trovare un `<a>` — `null` se la selezione non è dentro un link. */
function findEnclosingLink(target: HTMLElement, node: Node | null): HTMLAnchorElement | null {
  let current = node;
  while (current && current !== target) {
    if (current instanceof HTMLAnchorElement) return current;
    current = current.parentNode;
  }
  return null;
}

/** Bounding box della selezione non collassata, o del blocco intero come fallback (vedi commento di testa). */
function computeAnchorRect(target: HTMLElement): AnchorRect | null {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }
  }
  const rect = target.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export default function InlineFloatingToolbar({
  getTarget,
  onApplied,
}: InlineFloatingToolbarProps): JSX.Element | null {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);
  const [style, setStyle] = useState<{ top: number; left: number } | null>(null);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [linkPopoverOpened, setLinkPopoverOpened] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  /** Ricalcolata ad ogni `selectionchange`: solo se la selezione è ancora dentro `targetRef`. */
  const refreshFromSelection = useCallback(() => {
    const target = getTarget();
    if (!target) {
      setAnchorRect(null);
      return;
    }
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode ?? null;
    if (!isSelectionInside(target, anchorNode)) {
      setAnchorRect(null);
      return;
    }
    setAnchorRect(computeAnchorRect(target));
    setIsBold(document.queryCommandState('bold'));
    setIsItalic(document.queryCommandState('italic'));
    setIsLink(!!findEnclosingLink(target, anchorNode));
  }, [getTarget]);

  useLayoutEffect(() => {
    refreshFromSelection();
    document.addEventListener('selectionchange', refreshFromSelection);
    return () => document.removeEventListener('selectionchange', refreshFromSelection);
  }, [refreshFromSelection]);

  // Secondo passaggio: la dimensione reale della barra è nota solo dopo il primo render,
  // qui si clampa la posizione al viewport (mai fuori, requisito del task).
  useLayoutEffect(() => {
    if (!anchorRect || !toolbarRef.current) {
      setStyle(null);
      return;
    }
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    let top = anchorRect.top - toolbarRect.height - GAP_PX;
    if (top < VIEWPORT_MARGIN_PX) {
      // Non c'è spazio sopra la selezione: la barra si sposta sotto, mai fuori dal viewport.
      top = anchorRect.top + anchorRect.height + GAP_PX;
    }
    const left = anchorRect.left + anchorRect.width / 2 - toolbarRect.width / 2;
    setStyle({
      top: clamp(
        top,
        VIEWPORT_MARGIN_PX,
        window.innerHeight - toolbarRect.height - VIEWPORT_MARGIN_PX,
      ),
      left: clamp(
        left,
        VIEWPORT_MARGIN_PX,
        window.innerWidth - toolbarRect.width - VIEWPORT_MARGIN_PX,
      ),
    });
  }, [anchorRect]);

  /**
   * Ogni bottone della barra: `onMouseDown` con `preventDefault` impedisce al bottone di
   * rubare il focus al `contentEditable` — senza questo, il browser sposterebbe la
   * selezione prima ancora che `onClick` scatti, e `execCommand` non avrebbe più nulla su
   * cui operare.
   */
  function preserveSelection(event: ReactMouseEvent): void {
    event.preventDefault();
  }

  function runCommand(command: string, value?: string): void {
    const target = getTarget();
    if (!target) return;
    document.execCommand(command, false, value);
    onApplied(target.innerHTML);
    refreshFromSelection();
  }

  function openLinkPopover(): void {
    const target = getTarget();
    if (!target) return;
    if (isLink) {
      runCommand('unlink');
      return;
    }
    const selection = window.getSelection();
    const existingLink = findEnclosingLink(target, selection?.anchorNode ?? null);
    setLinkUrl(existingLink?.getAttribute('href') ?? '');
    setLinkPopoverOpened(true);
  }

  function submitLink(): void {
    const url = linkUrl.trim();
    setLinkPopoverOpened(false);
    if (!url) return;
    runCommand('createLink', url);
  }

  if (!style) return null;

  return (
    <div
      ref={toolbarRef}
      className={`${styles.toolbar} ${styles.toolbarVisible}`}
      style={{ top: style.top, left: style.left }}
      onMouseDown={preserveSelection}
      role="toolbar"
      aria-label="Formattazione testo"
    >
      <Tooltip label="Grassetto" withArrow>
        <ActionIcon
          variant={isBold ? 'filled' : 'subtle'}
          size="sm"
          aria-label="Grassetto"
          aria-pressed={isBold}
          onClick={() => runCommand('bold')}
        >
          <IconBold size={14} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Corsivo" withArrow>
        <ActionIcon
          variant={isItalic ? 'filled' : 'subtle'}
          size="sm"
          aria-label="Corsivo"
          aria-pressed={isItalic}
          onClick={() => runCommand('italic')}
        >
          <IconItalic size={14} />
        </ActionIcon>
      </Tooltip>

      <div className={styles.divider} />

      <Popover
        opened={linkPopoverOpened}
        onClose={() => setLinkPopoverOpened(false)}
        position="bottom"
        withArrow
        shadow="md"
        zIndex={1100}
      >
        <Popover.Target>
          <Tooltip label={isLink ? 'Rimuovi link' : 'Inserisci link'} withArrow>
            <ActionIcon
              variant={isLink ? 'filled' : 'subtle'}
              size="sm"
              aria-label={isLink ? 'Rimuovi link' : 'Inserisci link'}
              onClick={openLinkPopover}
            >
              {isLink ? <IconUnlink size={14} /> : <IconLink size={14} />}
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown onMouseDown={preserveSelection}>
          <div className={styles.linkForm}>
            <TextInput
              className={styles.linkInput}
              size="xs"
              placeholder="https://…"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitLink();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setLinkPopoverOpened(false);
                }
              }}
              autoFocus
            />
            <ActionIcon variant="filled" size="sm" aria-label="Conferma link" onClick={submitLink}>
              <IconLink size={14} />
            </ActionIcon>
          </div>
        </Popover.Dropdown>
      </Popover>

      <div className={styles.divider} />

      <Tooltip label="Allinea a sinistra" withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Allinea a sinistra"
          onClick={() => runCommand('justifyLeft')}
        >
          <IconAlignLeft size={14} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Allinea al centro" withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Allinea al centro"
          onClick={() => runCommand('justifyCenter')}
        >
          <IconAlignCenter size={14} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Allinea a destra" withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Allinea a destra"
          onClick={() => runCommand('justifyRight')}
        >
          <IconAlignRight size={14} />
        </ActionIcon>
      </Tooltip>

      <div className={styles.divider} />

      <Tooltip label="Cancella formattazione" withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Cancella formattazione"
          onClick={() => runCommand('removeFormat')}
        >
          <IconClearFormatting size={14} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}
