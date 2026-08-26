/**
 * Clipboard di stile della sessione di editing ("Copia Stile"/"Incolla Stile" del menu
 * contestuale di `EditorBlockWrapper.tsx`). Store Zustand separato da
 * `useBlockEditorStore.ts` di proposito: ogni `EditorBlockWrapper` è un'istanza diversa
 * per nodo, e non condividono altrimenti un canale per scambiarsi "cosa si è copiato" —
 * uno stato locale al singolo wrapper non sopravviverebbe alla chiusura del menu né
 * sarebbe visibile agli altri blocchi su cui si vuole incollare. Non persiste su disco:
 * si svuota a un refresh di pagina, come ogni altro stato di chrome dell'editor
 * (`activeViewport`/`isStructurePanelOpen` in `useBlockEditorStore.ts`).
 */
import { create } from 'zustand';

/** Prefisso che marca una prop come "di stile" nel registro dei blocchi (`BlockEditorPropMeta.tab === 'style'`, `blocks.types.ts`). */
const STYLE_PROP_PREFIX = 'style';

interface StyleClipboardState {
  /** Le prop di stile copiate dall'ultimo blocco su cui è stata usata "Copia Stile", o `null` se la clipboard è vuota. */
  copiedProps: Record<string, unknown> | null;
  /** Sostituisce il contenuto della clipboard con le prop di stile del blocco sorgente. */
  copyStyle: (props: Record<string, unknown>) => void;
}

export const useStyleClipboardStore = create<StyleClipboardState>((set) => ({
  copiedProps: null,
  copyStyle: (props) => set({ copiedProps: props }),
}));

/**
 * Estrae dalle `props` di un nodo solo quelle il cui nome inizia per `style` (namespace di
 * stile del registro, § "Copia Stile" — le stesse che finiscono nella scheda "Stile"
 * dell'ispettore). Nessuna copia profonda dei valori: sono scalari/enum/oggetti responsive
 * già immutabili per come li scrive `updateBlockPropsAction` (mai mutati in place).
 */
export function extractStyleProps(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => key.startsWith(STYLE_PROP_PREFIX)),
  );
}
