/**
 * Motore delle scorciatoie da tastiera dell'Editor Visivo full-screen
 * (`FullScreenEditorLayout.tsx`): un solo listener globale `keydown` per Ctrl/Cmd+Z
 * (undo), Ctrl/Cmd+Shift+Z / Ctrl+Y (redo), Delete/Backspace (elimina il blocco
 * selezionato), Escape (deseleziona) e Ctrl/Cmd+D (duplica il blocco selezionato).
 *
 * Sostituisce l'effetto locale che prima viveva dentro `FullScreenEditorLayout` (limitato
 * a Ctrl/Cmd+D) — stesso principio, esteso alle altre quattro scorciatoie e isolato in un
 * hook dedicato e testabile.
 *
 * Legge dallo store con selettori Zustand mirati (`selectedId`, azioni), mai l'intera
 * fetta dell'albero: coerente con CLAUDE.md § dominio CMS — una scorciatoia non deve
 * ri-renderizzare l'intero editor.
 */
import { useEffect } from 'react';
import { useBlockEditorStore, useSelectedId } from '../../../hooks/useBlockEditorStore';

/**
 * `true` se il fuoco è su un campo di digitazione (`input`, `textarea`, o un elemento
 * `contentEditable`, come l'editor RichText o i campi del `PropertyInspector`): in quel
 * caso le scorciatoie non intervengono, per non rubare Ctrl+Z/Delete/Escape alla
 * digitazione dell'utente.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') return true;
  return target.isContentEditable;
}

/**
 * Registra le scorciatoie da tastiera dell'editor sull'intera finestra, finché il
 * componente chiamante resta montato e `enabled` è `true`.
 *
 * `enabled` di default `true`: `FullScreenEditorLayout` è la chrome di una rotta dedicata
 * (`/studio/:guid`, ADR-54) o del Builder Sezioni Globali — in entrambi i casi, se è montato è
 * sempre quello che occupa lo schermo, quindi non serve un interruttore esterno.
 * @param enabled `false` per non registrare il listener (o rimuoverlo se già presente).
 */
export function useEditorShortcuts(enabled = true): void {
  const selectedId = useSelectedId();

  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) return;

      const isModifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (isModifier && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        useBlockEditorStore.getState().undo();
        return;
      }

      if ((isModifier && key === 'z' && event.shiftKey) || (event.ctrlKey && key === 'y')) {
        event.preventDefault();
        useBlockEditorStore.getState().redo();
        return;
      }

      if (key === 'delete' || key === 'backspace') {
        if (!selectedId) return;
        event.preventDefault();
        useBlockEditorStore.getState().removeBlockAction(selectedId);
        return;
      }

      if (key === 'escape') {
        event.preventDefault();
        useBlockEditorStore.getState().selectNode(null);
        return;
      }

      if (isModifier && key === 'd') {
        if (!selectedId) return;
        event.preventDefault();
        useBlockEditorStore.getState().duplicateNodeAction(selectedId);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, selectedId]);
}
