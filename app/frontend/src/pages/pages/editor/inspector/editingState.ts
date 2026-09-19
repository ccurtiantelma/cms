import { createContext, useContext, useState } from 'react';
import type { EditableStateName } from './StateSwitcher';

interface EditingStateContextValue {
  state: EditableStateName;
  setState: (state: EditableStateName) => void;
}

/**
 * Stato in editing condiviso dalla scheda Stile (switcher unico in testa, come Elementor).
 * `null` fuori da `StyleTab` (es. un field montato da solo): ogni campo tiene allora il
 * proprio stato e mostra il proprio switcher, comportamento storico invariato.
 */
export const EditingStateContext = createContext<EditingStateContextValue | null>(null);

/** Stato in editing di un campo stateful: quello di pannello se c'è un provider, altrimenti locale. */
export function useEditingState(): {
  editingState: EditableStateName;
  setEditingState: (state: EditableStateName) => void;
  hasPanelSwitcher: boolean;
} {
  const [localState, setLocalState] = useState<EditableStateName>('normal');
  const panel = useContext(EditingStateContext);
  return panel
    ? { editingState: panel.state, setEditingState: panel.setState, hasPanelSwitcher: true }
    : { editingState: localState, setEditingState: setLocalState, hasPanelSwitcher: false };
}
