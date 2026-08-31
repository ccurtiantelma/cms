/**
 * Component test del bug di collasso colonne (`EditorBlockWrapper.tsx`, righe ~1110-1127):
 * una `section` a più colonne senza figli deve mostrare un segnaposto `.emptyContainer`
 * per traccia della griglia, non uno solo — altrimenti la griglia CSS piazza l'unico grid
 * item nella prima traccia e le colonne successive restano vuote e invisibili,
 * indistinguibile da una sezione a colonna singola (vedi commento di testa di
 * `effectiveColumnsCount` nel componente).
 *
 * Il numero di colonne effettivo si legge da `node.props.columns`, prop responsive
 * (`{ default, tablet?, mobile? }`, ADR-29): qui si valorizza solo `default`, il
 * viewport attivo di default è `desktop` (`useActiveViewport`, store).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, createEvent } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/utils';
import { findNode, type BlockNode } from '../block-tree.utils';

const { useBlockEditorStore } = await import('../../../../hooks/useBlockEditorStore');
const { default: EditorBlockWrapper } = await import('../EditorBlockWrapper');
const styles = (await import('../EditorBlockWrapper.module.css')).default;

/** Nodo di comodo con `children` sempre presente. */
function node(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  children: BlockNode[] = [],
): BlockNode {
  return { id, type, props, children };
}

/** `.childrenArea` reale del contenitore, `display: contents` — unico genitore DOM atteso dei segnaposto. */
function childrenAreaOf(container: HTMLElement): HTMLElement {
  const area = container.querySelector<HTMLElement>(`.${styles.childrenArea}`);
  if (!area) throw new Error('.childrenArea non trovato nel markup renderizzato');
  return area;
}

beforeEach(() => {
  useBlockEditorStore.getState().initTree([]);
  useBlockEditorStore.getState().setActiveViewport('desktop');
});

describe('EditorBlockWrapper — segnaposto colonne vuote (bug collasso griglia)', () => {
  it('section columns=2 senza figli: esattamente 2 segnaposto .emptyContainer dentro .childrenArea', () => {
    const section = node('sec-2col', 'section', { columns: { default: '2' } }, []);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-2col" />);

    const area = childrenAreaOf(container);
    const placeholders = area.querySelectorAll(`:scope > .${styles.emptyContainer}`);
    expect(placeholders).toHaveLength(2);
  });

  it('section columns=3 senza figli: esattamente 3 segnaposto .emptyContainer', () => {
    const section = node('sec-3col', 'section', { columns: { default: '3' } }, []);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-3col" />);

    const area = childrenAreaOf(container);
    const placeholders = area.querySelectorAll(`:scope > .${styles.emptyContainer}`);
    expect(placeholders).toHaveLength(3);
  });

  it('section columns=1 senza figli: un solo .emptyContainer, fuori da .childrenArea (ramo colonna singola)', () => {
    const section = node('sec-1col', 'section', { columns: { default: '1' } }, []);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-1col" />);

    const placeholders = container.querySelectorAll(`.${styles.emptyContainer}`);
    expect(placeholders).toHaveLength(1);
    // A una sola colonna il ramo del componente non passa da `.childrenArea`
    // (righe 1123-1127): niente wrapper grid per un unico segnaposto.
    expect(container.querySelector(`.${styles.childrenArea}`)).not.toBeInTheDocument();
  });

  it('section con figli presenti: nessun segnaposto .emptyContainer iniettato', () => {
    const child = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    const section = node('sec-with-child', 'section', { columns: { default: '2' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-with-child" />);

    expect(container.querySelectorAll(`.${styles.emptyContainer}`)).toHaveLength(0);
    // I figli veri restano grid item diretti di `.childrenArea` (`display: contents`).
    expect(container.querySelector('[data-block-id="h-1"]')).toBeInTheDocument();
  });

  it('section con figli presenti: mantiene un drop target distinto per ogni colonna', () => {
    const child = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    const section = node('sec-with-targets', 'section', { columns: { default: '3' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);

    renderWithProviders(<EditorBlockWrapper id="sec-with-targets" />);

    expect(screen.getAllByLabelText(/^Drop target Colonna /)).toHaveLength(3);
  });
});

/**
 * `InlineFormattingToolbar` (T-integrazione-toolbar): ancorata al bordo superiore del
 * blocco `richText` selezionato, mutuamente esclusiva con `InlineFloatingToolbar` (che
 * prende il posto solo una volta iniziato l'editing, `isEditingText`). Vedi il commento di
 * testa di `InlineFormattingToolbar.tsx` e il montaggio in `EditorBlockWrapper.tsx`.
 */
describe('EditorBlockWrapper — InlineFormattingToolbar (T-integrazione-toolbar)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveViewport('desktop');
    useBlockEditorStore.getState().selectNode(null);
    // jsdom non implementa `execCommand`/`queryCommandState` (usati da `RichText.tsx` on
    // focus e da `applyFormattingCommand`/`InlineFloatingToolbar.tsx` sui comandi di
    // formattazione): mock locale a questo describe, nessun impatto sul resto della suite.
    document.execCommand = vi.fn().mockReturnValue(true);
    document.queryCommandState = vi.fn().mockReturnValue(false);
  });

  it('richText selezionato ma non in editing: la toolbar ancorata compare', () => {
    const richText = node('rt-1', 'richText', { html: '<p>Ciao</p>' });
    useBlockEditorStore.getState().initTree([richText]);
    useBlockEditorStore.getState().selectNode('rt-1');

    renderWithProviders(<EditorBlockWrapper id="rt-1" />);

    expect(screen.getByRole('toolbar', { name: 'Formattazione del blocco' })).toBeInTheDocument();
  });

  it('heading vuoto selezionato mostra un placeholder visibile per mantenere la struttura del canvas', () => {
    const heading = node('h-empty', 'heading', { level: 'h2', text: '' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-empty');

    const { container } = renderWithProviders(<EditorBlockWrapper id="h-empty" />);

    expect(container.querySelector('h2[data-placeholder="Titolo"]')).toBeInTheDocument();
  });

  it('heading selezionato: la toolbar di formattazione non compare mai (solo richText)', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    expect(
      screen.queryByRole('toolbar', { name: 'Formattazione del blocco' }),
    ).not.toBeInTheDocument();
  });

  it('richText non selezionato: nessuna toolbar di formattazione', () => {
    const richText = node('rt-1', 'richText', { html: '<p>Ciao</p>' });
    useBlockEditorStore.getState().initTree([richText]);

    renderWithProviders(<EditorBlockWrapper id="rt-1" />);

    expect(
      screen.queryByRole('toolbar', { name: 'Formattazione del blocco' }),
    ).not.toBeInTheDocument();
  });

  it("appena inizia l'editing (focus sul contentEditable) la toolbar ancorata lascia il posto a quella di selezione", () => {
    const richText = node('rt-1', 'richText', { html: '<p>Ciao</p>' });
    useBlockEditorStore.getState().initTree([richText]);
    useBlockEditorStore.getState().selectNode('rt-1');

    const { container } = renderWithProviders(<EditorBlockWrapper id="rt-1" />);

    expect(screen.getByRole('toolbar', { name: 'Formattazione del blocco' })).toBeInTheDocument();

    const editable = container.querySelector('[contenteditable="true"]');
    if (!editable) throw new Error('contentEditable non trovato');
    // jsdom non implementa `isContentEditable` (resta sempre `undefined`, verificato sulla
    // versione installata): il gestore `onFocus` del wrapper lo legge per decidere se il
    // focus è entrato in un discendente in editing — si simula qui il comportamento reale
    // del browser, altrimenti `isEditingText` non scatterebbe mai in questo ambiente di
    // test, indipendentemente dal codice sotto test.
    Object.defineProperty(editable, 'isContentEditable', { value: true, configurable: true });
    // React 17+ ascolta `focusin` (bubbling) per il proprio `onFocus` sintetico: un
    // `fireEvent.focus` nudo (nativamente non-bubbling) non attraverserebbe la delega di
    // React fino al gestore sul wrapper — occorre l'evento che bolle davvero.
    fireEvent.focusIn(editable);

    expect(
      screen.queryByRole('toolbar', { name: 'Formattazione del blocco' }),
    ).not.toBeInTheDocument();
  });

  it('click su Grassetto non fa perdere la selezione del blocco (mousedown con preventDefault)', () => {
    const richText = node('rt-1', 'richText', { html: '<p>Ciao</p>' });
    useBlockEditorStore.getState().initTree([richText]);
    useBlockEditorStore.getState().selectNode('rt-1');

    renderWithProviders(<EditorBlockWrapper id="rt-1" />);

    const boldButton = screen.getByRole('button', { name: 'Grassetto' });
    const mouseDownEvent = createEvent.mouseDown(boldButton);
    fireEvent(boldButton, mouseDownEvent);
    expect(mouseDownEvent.defaultPrevented).toBe(true);

    fireEvent.click(boldButton);
    // Il blocco resta selezionato: il click sulla toolbar non deve deselezionarlo né farlo
    // "perdere" (nessun blur/riselezione indesiderata verso un antenato).
    expect(useBlockEditorStore.getState().selectedId).toBe('rt-1');
  });

  it('"Chiudi" nasconde la toolbar senza deselezionare il blocco', () => {
    const richText = node('rt-1', 'richText', { html: '<p>Ciao</p>' });
    useBlockEditorStore.getState().initTree([richText]);
    useBlockEditorStore.getState().selectNode('rt-1');

    renderWithProviders(<EditorBlockWrapper id="rt-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi toolbar' }));

    expect(
      screen.queryByRole('toolbar', { name: 'Formattazione del blocco' }),
    ).not.toBeInTheDocument();
    expect(useBlockEditorStore.getState().selectedId).toBe('rt-1');
  });

  it('"Allinea giustificato" applica `justifyFull` a tutto il blocco', () => {
    const richText = node('rt-1', 'richText', { html: '<p>Ciao</p>' });
    useBlockEditorStore.getState().initTree([richText]);
    useBlockEditorStore.getState().selectNode('rt-1');

    renderWithProviders(<EditorBlockWrapper id="rt-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Allinea giustificato' }));

    expect(document.execCommand).toHaveBeenCalledWith('justifyFull', false, undefined);
  });
});

/**
 * Controllo rapido del livello titolo (gap #4, T-integrazione-toolbar): estende
 * `InlineFormattingToolbar` con una modalità `heading`, montata nello stesso momento
 * (`isSelected && !isEditingText`) della modalità `text` per `richText` — vedi il commento
 * di testa di `InlineFormattingToolbar.tsx`. Usa un `aria-label` distinto ("Livello del
 * titolo") per non collidere con le query del describe precedente su
 * "Formattazione del blocco", che deve restare **assente** su `heading` (Grassetto/
 * Corsivo/Link restano esclusi, `text` è `plainText`).
 */
describe('EditorBlockWrapper — controllo rapido livello titolo H2-H6 (gap #4)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveViewport('desktop');
    useBlockEditorStore.getState().selectNode(null);
  });

  it('heading selezionato ma non in editing: compare la barra "Livello del titolo" con i 5 pulsanti H2-H6', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    const toolbar = screen.getByRole('toolbar', { name: 'Livello del titolo' });
    expect(toolbar).toBeInTheDocument();
    for (const level of ['H2', 'H3', 'H4', 'H5', 'H6']) {
      expect(screen.getByRole('button', { name: `Titolo ${level}` })).toBeInTheDocument();
    }
    // Nessun Grassetto/Corsivo/Link su heading: `text` è `plainText` per il registro.
    expect(screen.queryByRole('button', { name: 'Grassetto' })).not.toBeInTheDocument();
  });

  it('il livello corrente è marcato attivo (`aria-pressed`)', () => {
    const heading = node('h-1', 'heading', { level: 'h4', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    expect(screen.getByRole('button', { name: 'Titolo H4' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Titolo H2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('click su un livello scrive `level` sul nodo tramite lo stesso canale di commit (undo/redo incluso), senza debounce', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Titolo H4' }));

    const updated = findNode(useBlockEditorStore.getState().tree, 'h-1');
    expect(updated?.props.level).toBe('h4');
  });

  it('"Chiudi" nasconde la barra "Livello del titolo" senza deselezionare il blocco', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi toolbar' }));

    expect(screen.queryByRole('toolbar', { name: 'Livello del titolo' })).not.toBeInTheDocument();
    expect(useBlockEditorStore.getState().selectedId).toBe('h-1');
  });

  it('richText selezionato: mai la barra "Livello del titolo" (solo heading)', () => {
    const richText = node('rt-1', 'richText', { html: '<p>Ciao</p>' });
    useBlockEditorStore.getState().initTree([richText]);
    useBlockEditorStore.getState().selectNode('rt-1');
    document.execCommand = vi.fn().mockReturnValue(true);
    document.queryCommandState = vi.fn().mockReturnValue(false);

    renderWithProviders(<EditorBlockWrapper id="rt-1" />);

    expect(screen.queryByRole('toolbar', { name: 'Livello del titolo' })).not.toBeInTheDocument();
  });
});
