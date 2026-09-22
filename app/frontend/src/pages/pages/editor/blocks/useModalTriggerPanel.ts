import { useState, type MouseEvent } from 'react';
import type { BlockNode } from '../block-tree.utils';

/**
 * Apertura visiva del pannello `modalTrigger` (ADR-59 § 2): stato locale, mai `location.hash`.
 * `onAnchorClick` intercetta il trigger (`href="#modal-{id}"`) e il "Chiudi" (`href="#"`): il
 * browser non deve mai navigare (altererebbe `location.hash` dell'admin).
 */
export function useModalTriggerPanel(node: BlockNode | undefined) {
  const [isOpen, setIsOpen] = useState(false);

  function onAnchorClick(event: MouseEvent<HTMLDivElement>): void {
    if (node?.type !== 'modalTrigger') return;
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#modal-')) {
      event.preventDefault();
      setIsOpen(true);
    } else if (href === '#') {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  return { isOpen: node?.type === 'modalTrigger' && isOpen, onAnchorClick };
}
