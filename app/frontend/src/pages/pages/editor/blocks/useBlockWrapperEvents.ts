/**
 * Hover e input del wrapper. L'hover è stato React locale (`isHovered`, mai Zustand):
 * `onMouseOver`/`onMouseOut` con `stopPropagation()` sul nodo più interno, così solo il nodo
 * effettivamente sotto il puntatore è "hovered" (un `:hover` CSS cascherebbe su ogni antenato).
 */
import { useState, type HTMLAttributes, type MouseEvent } from 'react';
import { useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';

interface UseBlockWrapperEventsArgs {
  id: string;
  onAnchorClick: (event: MouseEvent<HTMLDivElement>) => void;
  onFocus: HTMLAttributes<HTMLDivElement>['onFocus'];
  onBlur: HTMLAttributes<HTMLDivElement>['onBlur'];
}

export function useBlockWrapperEvents({
  id,
  onAnchorClick,
  onFocus,
  onBlur,
}: UseBlockWrapperEventsArgs) {
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const [isHovered, setIsHovered] = useState(false);

  const eventProps: HTMLAttributes<HTMLDivElement> = {
    // Selezione da tastiera: solo Invio/Spazio sul wrapper stesso, mai su un discendente focusabile.
    tabIndex: 0,
    onClick: (event) => {
      // Il click seleziona il nodo più interno, mai la sezione che lo contiene.
      event.stopPropagation();
      onAnchorClick(event);
      selectNode(id);
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        selectNode(id);
      }
    },
    onFocus,
    onBlur,
    onMouseOver: (event) => {
      event.stopPropagation();
      setIsHovered(true);
    },
    onMouseOut: (event) => {
      event.stopPropagation();
      setIsHovered(false);
    },
    onMouseEnter: (event) => event.stopPropagation(),
    onMouseLeave: (event) => event.stopPropagation(),
  };
  return { isHovered, eventProps };
}
