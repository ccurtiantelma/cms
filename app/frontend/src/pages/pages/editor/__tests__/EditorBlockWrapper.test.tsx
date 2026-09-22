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
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../test/utils';
import { findNode, type BlockNode } from '../block-tree.utils';

const { useBlockEditorStore } = await import('../../../../hooks/useBlockEditorStore');
const { default: EditorBlockWrapper } = await import('../EditorBlockWrapper');
const styles = (await import('../EditorBlockWrapper.module.css')).default;
const chromeStyles = (await import('../blocks/BlockSelectionChrome.module.css')).default;

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
 * Rimozione toolbar contestuale galleggiante (T-elementor-parity): `InlineFormattingToolbar`/
 * `InlineFloatingToolbar` sono stati eliminati — un blocco testuale selezionato non deve più
 * montare alcuna barra di formattazione fluttuante sul canvas, solo il bounding box di
 * `BlockHoverOverlay` e l'editing nativo `contentEditable` già garantito da `Heading.tsx`/
 * `RichText.tsx`.
 */
describe('EditorBlockWrapper — nessuna toolbar contestuale galleggiante (T-elementor-parity)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveViewport('desktop');
    useBlockEditorStore.getState().selectNode(null);
  });

  it('richText selezionato: nessuna barra "Formattazione del blocco"', () => {
    const richText = node('rt-1', 'richText', { html: '<p>Ciao</p>' });
    useBlockEditorStore.getState().initTree([richText]);
    useBlockEditorStore.getState().selectNode('rt-1');

    renderWithProviders(<EditorBlockWrapper id="rt-1" />);

    expect(
      screen.queryByRole('toolbar', { name: 'Formattazione del blocco' }),
    ).not.toBeInTheDocument();
  });

  it('heading vuoto selezionato mostra un placeholder visibile per mantenere la struttura del canvas', () => {
    const heading = node('h-empty', 'heading', { level: 'h2', text: '' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-empty');

    const { container } = renderWithProviders(<EditorBlockWrapper id="h-empty" />);

    expect(container.querySelector('h2[data-placeholder="Titolo"]')).toBeInTheDocument();
  });

  it('heading selezionato: nessuna barra "Livello del titolo"', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    expect(screen.queryByRole('toolbar', { name: 'Livello del titolo' })).not.toBeInTheDocument();
  });
});

/**
 * Hover overlay e toolbar di selezione (F04d-02). I due stati portano segnali distinti,
 * mai sovrapposti sullo stesso blocco: hover **senza** selezione mostra solo il badge
 * nome (`.hoverBadge`, icona + `meta.label`); la toolbar di sette controlli base
 * (`BlockHoverOverlay.tsx` — aggiungi sopra/trascina/seleziona genitore/duplica/modifica/
 * elimina/aggiungi sotto) è montata **solo** su `isSelected`. Gli handler del wrapper usano `onMouseOver`/
 * `onMouseOut` (non `onMouseEnter`/`onMouseLeave`, che in React non attraversano mai il
 * bubbling — `stopPropagation()` lì sarebbe un no-op, vedi il commento di testa di
 * `EditorBlockWrapper.tsx`): `fireEvent.mouseOver`/`mouseOut` sono quindi gli eventi
 * corretti da simulare qui, non `mouseEnter`/`mouseLeave`.
 */
describe('EditorBlockWrapper — hover overlay e toolbar di selezione (F04d-02)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveViewport('desktop');
    useBlockEditorStore.getState().selectNode(null);
  });

  it('hover senza selezione: il badge nome compare (icona + label del tipo)', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Testo' });
    useBlockEditorStore.getState().initTree([heading]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="h-1" />);
    const wrapperEl = container.querySelector('[data-block-id="h-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    expect(container.querySelector(`.${styles.hoverBadge}`)).not.toBeInTheDocument();

    fireEvent.mouseOver(wrapperEl);

    const badge = container.querySelector(`.${styles.hoverBadge}`);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Titolo');
  });

  it('mouseOut nasconde di nuovo il badge nome', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Testo' });
    useBlockEditorStore.getState().initTree([heading]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="h-1" />);
    const wrapperEl = container.querySelector('[data-block-id="h-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    fireEvent.mouseOver(wrapperEl);
    expect(container.querySelector(`.${styles.hoverBadge}`)).toBeInTheDocument();

    fireEvent.mouseOut(wrapperEl);
    expect(container.querySelector(`.${styles.hoverBadge}`)).not.toBeInTheDocument();
  });

  it('hover su un figlio annidato non marca "hovered" anche il genitore (stopPropagation)', () => {
    const child = node('h-child', 'heading', { level: 'h2', text: 'Testo' });
    const section = node('sec-1', 'section', { columns: { default: '1' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-1" />);
    const childEl = container.querySelector('[data-block-id="h-child"]');
    if (!childEl) throw new Error('figlio non trovato');

    fireEvent.mouseOver(childEl);

    // Un solo badge nell'albero: quello del figlio (heading, "Titolo"), mai anche quello
    // del genitore (section, "Sezione") — il bubbling nativo fermato da `stopPropagation`
    // sul nodo più interno garantisce che solo il nodo sotto il puntatore sia "hovered".
    const badges = container.querySelectorAll(`.${styles.hoverBadge}`);
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('Titolo');
  });

  it('blocco selezionato: la toolbar con i sette controlli base compare, il badge nome resta assente', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Testo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    const { container } = renderWithProviders(<EditorBlockWrapper id="h-1" />);

    expect(container.querySelector('[data-block-overlay="true"]')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Trascina per spostare il blocco Titolo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Seleziona il blocco genitore di Titolo' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplica il blocco Titolo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifica il blocco Titolo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elimina il blocco Titolo' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aggiungi blocco sopra Titolo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aggiungi blocco sotto Titolo' }),
    ).toBeInTheDocument();
    expect(container.querySelector(`.${styles.hoverBadge}`)).not.toBeInTheDocument();
  });

  it('"Seleziona blocco genitore" è disabilitato su un nodo di radice (nessun genitore)', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Testo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    expect(
      screen.getByRole('button', { name: 'Seleziona il blocco genitore di Titolo' }),
    ).toBeDisabled();
  });

  it('"Seleziona blocco genitore" seleziona il genitore quando esiste', () => {
    const child = node('h-child', 'heading', { level: 'h2', text: 'Testo' });
    const section = node('sec-1', 'section', { columns: { default: '1' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);
    useBlockEditorStore.getState().selectNode('h-child');

    renderWithProviders(<EditorBlockWrapper id="sec-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Seleziona il blocco genitore di Titolo' }));

    expect(useBlockEditorStore.getState().selectedId).toBe('sec-1');
  });

  it('"Duplica" clona il blocco nell\'albero (duplicateNodeAction)', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Testo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Duplica il blocco Titolo' }));

    expect(useBlockEditorStore.getState().tree).toHaveLength(2);
  });

  it('"Elimina" apre una conferma; confermando rimuove il blocco dall\'albero (removeBlockAction)', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Testo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="h-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Elimina il blocco Titolo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

    expect(useBlockEditorStore.getState().tree).toHaveLength(0);
  });

  it('"+" apre la palette e inserisce un blocco prima di questo nodo (RE-2, primo controllo della maniglia)', async () => {
    const user = userEvent.setup();
    const child = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    const section = node('sec-1', 'section', { columns: { default: '1' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="sec-1" />);

    await user.click(screen.getByRole('button', { name: 'Aggiungi blocco sopra Titolo' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Titolo' }));

    const updatedSection = findNode(useBlockEditorStore.getState().tree, 'sec-1');
    expect(updatedSection?.children).toHaveLength(2);
    // Il nuovo blocco è inserito **prima** del nodo originale (stesso `location.index`),
    // non in coda: il figlio preesistente resta il secondo, non il primo.
    expect(updatedSection?.children[0]?.id).not.toBe('h-1');
    expect(updatedSection?.children[1]?.id).toBe('h-1');
  });

  it('"+" sotto apre la palette e inserisce un blocco dopo questo nodo (controllo speculare)', async () => {
    const user = userEvent.setup();
    const child = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    const section = node('sec-1', 'section', { columns: { default: '1' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);
    useBlockEditorStore.getState().selectNode('h-1');

    renderWithProviders(<EditorBlockWrapper id="sec-1" />);

    await user.click(screen.getByRole('button', { name: 'Aggiungi blocco sotto Titolo' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Titolo' }));

    const updatedSection = findNode(useBlockEditorStore.getState().tree, 'sec-1');
    expect(updatedSection?.children).toHaveLength(2);
    // Il nuovo blocco è inserito **dopo** il nodo originale (`location.index + 1`), non
    // prima: il figlio preesistente resta il primo, non il secondo.
    expect(updatedSection?.children[0]?.id).toBe('h-1');
    expect(updatedSection?.children[1]?.id).not.toBe('h-1');
  });
});

/**
 * Codice colore per livello di annidamento e demarcazione dei contenitori (RE-2, restyle
 * chrome Elementor Pro): un solo calcolo del colore (`blockLevelColor`,
 * `EditorBlockWrapper.tsx`), esposto come custom property CSS `--block-level-color`
 * sull'inline `style` del wrapper — ereditata sia dalla maniglia contestuale
 * (`BlockHoverOverlay.module.css`, `.overlay`) sia dai bordi di hover/selezione
 * (`.hoveredChrome`/`.selectedChrome`, `EditorBlockWrapper.module.css`). jsdom non applica
 * un motore CSS reale (i CSS Module qui sono solo nomi di classe): la copertura verifica
 * quindi il valore della custom property impostata via `style` (il meccanismo di colore)
 * e le classi applicate (il meccanismo di stato), non il pixel renderizzato.
 */
describe('EditorBlockWrapper — colore di livello di annidamento (RE-2)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveViewport('desktop');
    useBlockEditorStore.getState().selectNode(null);
  });

  it('sezione di primo livello: --block-level-color magenta Elementor (#e0007b)', () => {
    const section = node('sec-1', 'section', {}, []);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-1" />);
    const wrapperEl = container.querySelector<HTMLElement>('[data-block-id="sec-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    expect(wrapperEl.style.getPropertyValue('--block-level-color')).toBe('#e0007b');
  });

  it('globalRef: --block-level-color magenta Elementor (#e0007b), stesso livello di una sezione di primo livello', () => {
    const globalRef = node('gr-1', 'globalRef', { globalSectionGuid: '0123456789abcdef' });
    useBlockEditorStore.getState().initTree([globalRef]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="gr-1" />);
    const wrapperEl = container.querySelector<HTMLElement>('[data-block-id="gr-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    expect(wrapperEl.style.getPropertyValue('--block-level-color')).toBe('#e0007b');
  });

  it('container annidato (figlio di una section): --block-level-color azzurro (#0284c7)', () => {
    const nestedContainer = node('cont-child', 'container', {}, []);
    const section = node('sec-1', 'section', {}, [nestedContainer]);
    useBlockEditorStore.getState().initTree([section]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-1" />);
    const wrapperEl = container.querySelector<HTMLElement>('[data-block-id="cont-child"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    expect(wrapperEl.style.getPropertyValue('--block-level-color')).toBe('#0284c7');
  });

  it('section annidata (non di primo livello): --block-level-color azzurro (#0284c7), non viola', () => {
    const nestedSection = node('sec-child', 'section', {}, []);
    const outer = node('cont-outer', 'container', {}, [nestedSection]);
    useBlockEditorStore.getState().initTree([outer]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="cont-outer" />);
    const wrapperEl = container.querySelector<HTMLElement>('[data-block-id="sec-child"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    expect(wrapperEl.style.getPropertyValue('--block-level-color')).toBe('#0284c7');
  });

  it('widget foglia (heading): --block-level-color blu (#2563eb)', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="h-1" />);
    const wrapperEl = container.querySelector<HTMLElement>('[data-block-id="h-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    expect(wrapperEl.style.getPropertyValue('--block-level-color')).toBe('#2563eb');
  });

  it('la maniglia contestuale (toolbar di selezione) è annidata nel wrapper e ne eredita il colore di livello', () => {
    const section = node('sec-1', 'section', {}, []);
    useBlockEditorStore.getState().initTree([section]);
    useBlockEditorStore.getState().selectNode('sec-1');

    const { container } = renderWithProviders(<EditorBlockWrapper id="sec-1" />);
    const wrapperEl = container.querySelector<HTMLElement>('[data-block-id="sec-1"]');
    const overlayEl = container.querySelector('[data-block-overlay="true"]');
    if (!wrapperEl || !overlayEl) throw new Error('wrapper/overlay non trovati');

    expect(wrapperEl.style.getPropertyValue('--block-level-color')).toBe('#e0007b');
    // La custom property CSS eredita lungo il DOM: la maniglia deve essere un discendente
    // del wrapper che la imposta, non un elemento portato altrove (`withinPortal` di un
    // controllo interno non sposta l'intera toolbar fuori dal wrapper).
    expect(wrapperEl.contains(overlayEl)).toBe(true);
  });
});

/**
 * Cornice di hover/selezione (ADR-92, `blocks/BlockSelectionChrome.tsx`): overlay assoluto
 * figlio del wrapper (`[data-block-chrome]`), mai classi di bordo sul wrapper stesso — così
 * hover/selezione non toccano il box model del contenuto. Nessuna "gabbia permanente": senza
 * interazione l'overlay non è montato. Colore per livello (ADR-95): Sezione viola (`"section"`), Contenitore
 * arancione (`"container"`), Widget foglia verde (`"widget"`).
 */
describe('EditorBlockWrapper — cornice di hover/selezione (ADR-92/95, overlay fuori dal flusso)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveViewport('desktop');
    useBlockEditorStore.getState().selectNode(null);
  });

  function chromeOf(wrapperEl: Element): HTMLElement | null {
    return wrapperEl.querySelector<HTMLElement>(':scope > [data-block-chrome]');
  }

  it('section vuota e container vuoto, senza interazione: nessuna cornice, il segnaposto interno porta il proprio bordo', () => {
    const section = node('sec-empty', 'section', {}, []);
    const emptyContainer = node('cont-empty', 'container', {}, []);
    useBlockEditorStore.getState().initTree([section, emptyContainer]);

    const { container } = renderWithProviders(
      <>
        <EditorBlockWrapper id="sec-empty" />
        <EditorBlockWrapper id="cont-empty" />
      </>,
    );
    for (const id of ['sec-empty', 'cont-empty']) {
      const wrapperEl = container.querySelector(`[data-block-id="${id}"]`);
      if (!wrapperEl) throw new Error('wrapper non trovato');
      expect(chromeOf(wrapperEl)).not.toBeInTheDocument();
      expect(wrapperEl.querySelector(`.${styles.emptyContainer}`)).toBeInTheDocument();
    }
  });

  it('container con figli, senza hover/selezione: nessuna cornice (niente gabbia permanente)', () => {
    const child = node('h-child', 'heading', { level: 'h2', text: 'Titolo' });
    const containerWithChild = node('cont-full', 'container', {}, [child]);
    useBlockEditorStore.getState().initTree([containerWithChild]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="cont-full" />);
    const wrapperEl = container.querySelector('[data-block-id="cont-full"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    expect(container.querySelector('[data-block-chrome]')).not.toBeInTheDocument();
  });

  it('hover su un container (non selezionato): cornice 1px di livello Contenitore (#ea580c)', () => {
    const emptyContainer = node('cont-1', 'container', {}, []);
    useBlockEditorStore.getState().initTree([emptyContainer]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="cont-1" />);
    const wrapperEl = container.querySelector('[data-block-id="cont-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    fireEvent.mouseOver(wrapperEl);

    const chrome = chromeOf(wrapperEl);
    expect(chrome).toHaveAttribute('data-block-chrome', 'hover');
    expect(chrome).toHaveAttribute('data-block-chrome-tone', 'container');
    expect(chrome).toHaveClass(chromeStyles.hover);
    expect(chrome).toHaveClass(chromeStyles.container);
  });

  it('selezione di un container: cornice 2px + ombra, livello Contenitore', () => {
    const emptyContainer = node('cont-1', 'container', {}, []);
    useBlockEditorStore.getState().initTree([emptyContainer]);
    useBlockEditorStore.getState().selectNode('cont-1');

    const { container } = renderWithProviders(<EditorBlockWrapper id="cont-1" />);
    const wrapperEl = container.querySelector('[data-block-id="cont-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    const chrome = chromeOf(wrapperEl);
    expect(chrome).toHaveAttribute('data-block-chrome', 'selected');
    expect(chrome).toHaveAttribute('data-block-chrome-tone', 'container');
    expect(chrome).toHaveClass(chromeStyles.selected);
  });

  it('hover su un widget foglia (heading, non selezionato): cornice 1px di categoria Widget (#16a34a)', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="h-1" />);
    const wrapperEl = container.querySelector('[data-block-id="h-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    fireEvent.mouseOver(wrapperEl);

    const chrome = chromeOf(wrapperEl);
    expect(chrome).toHaveAttribute('data-block-chrome', 'hover');
    expect(chrome).toHaveAttribute('data-block-chrome-tone', 'widget');
    expect(chrome).toHaveClass(chromeStyles.widget);
  });

  it('selezione di un widget foglia (heading): cornice 2px di categoria Widget, non quella di Sezione/Container', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    const { container } = renderWithProviders(<EditorBlockWrapper id="h-1" />);
    const wrapperEl = container.querySelector('[data-block-id="h-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    const chrome = chromeOf(wrapperEl);
    expect(chrome).toHaveAttribute('data-block-chrome', 'selected');
    expect(chrome).toHaveAttribute('data-block-chrome-tone', 'widget');
    expect(chrome).not.toHaveClass(chromeStyles.section);
  });

  it('la cornice non entra nel flusso: è aria-hidden e il wrapper non riceve classi di bordo di stato', () => {
    const heading = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    useBlockEditorStore.getState().initTree([heading]);
    useBlockEditorStore.getState().selectNode('h-1');

    const { container } = renderWithProviders(<EditorBlockWrapper id="h-1" />);
    const wrapperEl = container.querySelector('[data-block-id="h-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    expect(chromeOf(wrapperEl)).toHaveAttribute('aria-hidden', 'true');
    expect(wrapperEl.className.split(' ')).toEqual(
      expect.not.arrayContaining([chromeStyles.selected, chromeStyles.hover]),
    );
  });
});

/**
 * Identità "Sezione" preservata attraverso `migrate-section-to-container.ts` (ADR-82): il
 * backend migra ogni nodo `{type:'section'}` in `{type:'container', v:2, props:{tag:'section',
 * ...}}` al salvataggio/parsing. `resolveBlockKind` (`blocks/resolve-block-kind.ts`) deve
 * riconoscere `props.tag === 'section'` su un `container` come equivalente a `type === 'section'`
 * legacy: stesso tono di cornice (`data-block-chrome-tone="section"`, viola) e stesso badge —
 * un `container` con un altro `tag` (o nessuno) resta "Contenitore" normale.
 */
describe('EditorBlockWrapper — identità "Sezione" preservata su container migrato (ADR-82)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveViewport('desktop');
    useBlockEditorStore.getState().selectNode(null);
  });

  function chromeOf(wrapperEl: Element): HTMLElement | null {
    return wrapperEl.querySelector<HTMLElement>(':scope > [data-block-chrome]');
  }

  it('container con props.tag="section" in hover: cornice di tono Sezione (viola), non Contenitore', () => {
    const migratedSection = node('mig-sec-1', 'container', { tag: 'section' }, []);
    useBlockEditorStore.getState().initTree([migratedSection]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="mig-sec-1" />);
    const wrapperEl = container.querySelector('[data-block-id="mig-sec-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    fireEvent.mouseOver(wrapperEl);

    const chrome = chromeOf(wrapperEl);
    expect(chrome).toHaveAttribute('data-block-chrome-tone', 'section');
    expect(chrome).toHaveClass(chromeStyles.section);
  });

  it('container con props.tag="section" selezionato: --block-level-color magenta di primo livello, come una section legacy', () => {
    const migratedSection = node('mig-sec-2', 'container', { tag: 'section' }, []);
    useBlockEditorStore.getState().initTree([migratedSection]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="mig-sec-2" />);
    const wrapperEl = container.querySelector<HTMLElement>('[data-block-id="mig-sec-2"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    expect(wrapperEl.style.getPropertyValue('--block-level-color')).toBe('#e0007b');
  });

  it('container con props.tag="section" e figlio, selezionato: la toolbar offre "Salva come Preset Globale" (controllo esclusivo delle Sezioni)', () => {
    const child = node('h-1', 'heading', { level: 'h2', text: 'Titolo' });
    const migratedSection = node('mig-sec-3', 'container', { tag: 'section' }, [child]);
    useBlockEditorStore.getState().initTree([migratedSection]);
    useBlockEditorStore.getState().selectNode('mig-sec-3');

    renderWithProviders(<EditorBlockWrapper id="mig-sec-3" />);

    expect(
      screen.getByRole('button', { name: /come Preset Globale$/i }),
    ).toBeInTheDocument();
  });

  it('container con tag="div" (o assente): resta cornice/tono Contenitore normale, nessuna identità Sezione', () => {
    const plainContainer = node('cont-div-1', 'container', { tag: 'div' }, []);
    useBlockEditorStore.getState().initTree([plainContainer]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="cont-div-1" />);
    const wrapperEl = container.querySelector('[data-block-id="cont-div-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    fireEvent.mouseOver(wrapperEl);

    const chrome = chromeOf(wrapperEl);
    expect(chrome).toHaveAttribute('data-block-chrome-tone', 'container');
    expect(chrome).not.toHaveClass(chromeStyles.section);

    expect(wrapperEl.style.getPropertyValue('--block-level-color')).toBe('#0284c7');
  });

  it('container senza props.tag: comportamento identico a "div", mai trattato come Sezione', () => {
    const plainContainer = node('cont-notag-1', 'container', {}, []);
    useBlockEditorStore.getState().initTree([plainContainer]);
    useBlockEditorStore.getState().selectNode('cont-notag-1');

    const { container } = renderWithProviders(<EditorBlockWrapper id="cont-notag-1" />);
    const wrapperEl = container.querySelector('[data-block-id="cont-notag-1"]');
    if (!wrapperEl) throw new Error('wrapper non trovato');

    const chrome = chromeOf(wrapperEl);
    expect(chrome).toHaveAttribute('data-block-chrome-tone', 'container');
    expect(
      screen.queryByRole('button', { name: /come Preset Globale$/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Interattività in-canvas dei widget a `children` (RE-4/ADR-59): `EditorBlockWrapper`
 * possiede ora la ricorsione dei figli di `accordion`/`accordionItem`/`tabs`/`tabPanel`/
 * `carousel`/`carouselSlide`/`modalTrigger` (`CONTAINER_COMPONENTS`,
 * `resolveContainerComponentProps`), sullo stesso modello già coperto sopra per
 * `section`/`container`. I sette componenti puri (ADR-57 § 2, T4 di
 * `PLAN-widget-interattivi-enterprise.md`) restano bit-per-bit invariati — la loro
 * regressione sorgente (`expect(source).not.toMatch(/onClick|useState|useEffect/)`) vive
 * già nei rispettivi `.test.tsx` e non si duplica qui: questa suite verifica solo il
 * comportamento risultante nel Canvas (apertura nativa di `<details>`/radio-hack — governata
 * dal browser, non da un handler React scritto in questo file —, editing in-place generico
 * già esistente, dropzone vuota riusata, mitigazione ADR-59 § 2 sul click di
 * `modalTrigger`).
 */
describe('EditorBlockWrapper — interattività in-canvas widget a children (RE-4/ADR-59)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().setActiveViewport('desktop');
    useBlockEditorStore.getState().selectNode(null);
  });

  it('accordionItem: click su <summary> apre nativamente il <details> (comportamento del browser, zero JS/handler in questo file)', () => {
    const item = node('item-1', 'accordionItem', { title: 'Voce 1' }, []);
    const accordion = node('acc-1', 'accordion', { exclusive: false }, [item]);
    useBlockEditorStore.getState().initTree([accordion]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="acc-1" />);

    const details = container.querySelector('details');
    if (!details) throw new Error('<details> non trovato nel markup renderizzato');
    expect(details).not.toHaveAttribute('open');

    fireEvent.click(screen.getByText('Voce 1'));

    expect(details).toHaveAttribute('open');
  });

  it('tabPanel: click sulla <label> marca il relativo <input type="radio"> come checked (radio-hack CSS-only)', () => {
    const panel1 = node('panel-1', 'tabPanel', { label: 'Tab 1' }, []);
    const panel2 = node('panel-2', 'tabPanel', { label: 'Tab 2' }, []);
    const tabs = node('tabs-1', 'tabs', {}, [panel1, panel2]);
    useBlockEditorStore.getState().initTree([tabs]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="tabs-1" />);

    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(2);
    // Primo pannello `checked` di default (ADR-57 § "Tabs produce ... primo pannello
    // checked di default"), calcolato da `resolveContainerComponentProps` guardando la
    // posizione fra i fratelli.
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);

    fireEvent.click(screen.getByText('Tab 2'));

    expect(radios[1].checked).toBe(true);
    // Stesso `name` (radio group condiviso, `groupName` derivato dal genitore): selezionarne
    // uno deseleziona nativamente l'altro, nessuno stato React coinvolto.
    expect(radios[0].checked).toBe(false);
    expect(radios[0].name).toBe(radios[1].name);
  });

  it('heading annidato in un accordionItem, selezionato, entra in editing in-place e committa su blur (stesso canale generico `editing` di BlockRenderer)', () => {
    const heading = node('h-nested', 'heading', { level: 'h3', text: 'Titolo annidato' });
    const item = node('item-1', 'accordionItem', { title: 'Voce 1' }, [heading]);
    const accordion = node('acc-1', 'accordion', {}, [item]);
    useBlockEditorStore.getState().initTree([accordion]);
    useBlockEditorStore.getState().selectNode('h-nested');

    const { container } = renderWithProviders(<EditorBlockWrapper id="acc-1" />);

    const headingEl = container.querySelector(
      '[data-block-id="h-nested"] [contenteditable="true"]',
    );
    if (!headingEl) throw new Error('heading annidato in editing non trovato');

    headingEl.textContent = 'Titolo modificato';
    fireEvent.blur(headingEl);

    const updated = findNode(useBlockEditorStore.getState().tree, 'h-nested');
    expect(updated?.props.text).toBe('Titolo modificato');
  });

  it('richText annidato in un tabPanel, selezionato, entra in editing in-place e committa `html` su blur', () => {
    const richText = node('rt-nested', 'richText', { html: '<p>Ciao</p>' });
    const panel = node('panel-1', 'tabPanel', { label: 'Tab 1' }, [richText]);
    const tabs = node('tabs-1', 'tabs', {}, [panel]);
    useBlockEditorStore.getState().initTree([tabs]);
    useBlockEditorStore.getState().selectNode('rt-nested');

    const { container } = renderWithProviders(<EditorBlockWrapper id="tabs-1" />);

    const richTextEl = container.querySelector(
      '[data-block-id="rt-nested"] [contenteditable="true"]',
    );
    if (!richTextEl) throw new Error('richText annidato in editing non trovato');

    richTextEl.innerHTML = '<p>Modificato</p>';
    fireEvent.blur(richTextEl);

    const updated = findNode(useBlockEditorStore.getState().tree, 'rt-nested');
    expect(updated?.props.html).toBe('<p>Modificato</p>');
  });

  it('button annidato in un carouselSlide, selezionato, entra in editing in-place e committa `label` su blur', () => {
    const button = node('btn-nested', 'button', { label: 'Vai', href: '/pagina' });
    const slide = node('slide-1', 'carouselSlide', {}, [button]);
    const carousel = node('car-1', 'carousel', { autoplay: false, transition: 'manual-scroll' }, [
      slide,
    ]);
    useBlockEditorStore.getState().initTree([carousel]);
    useBlockEditorStore.getState().selectNode('btn-nested');

    const { container } = renderWithProviders(<EditorBlockWrapper id="car-1" />);

    const buttonEl = container.querySelector(
      '[data-block-id="btn-nested"] [contenteditable="true"]',
    );
    if (!buttonEl) throw new Error('button annidato in editing non trovato');

    buttonEl.textContent = 'Scopri di più';
    fireEvent.blur(buttonEl);

    const updated = findNode(useBlockEditorStore.getState().tree, 'btn-nested');
    expect(updated?.props.label).toBe('Scopri di più');
  });

  it('accordionItem senza figli: placeholder generico "Contenitore vuoto" + BlockPalette (nessun nuovo componente, riuso di container/section)', () => {
    const item = node('item-empty', 'accordionItem', { title: 'Voce vuota' }, []);
    const accordion = node('acc-1', 'accordion', {}, [item]);
    useBlockEditorStore.getState().initTree([accordion]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="acc-1" />);

    const wrapperEl = container.querySelector('[data-block-id="item-empty"]');
    if (!wrapperEl) throw new Error('wrapper di item-empty non trovato');
    expect(wrapperEl.querySelector(`.${styles.emptyContainer}`)).toBeInTheDocument();
    expect(wrapperEl.querySelector('[aria-label="Aggiungi blocco"]')).toBeInTheDocument();
  });

  it('tabPanel senza figli: stesso placeholder generico "Contenitore vuoto" + BlockPalette', () => {
    const panel = node('panel-empty', 'tabPanel', { label: 'Tab vuoto' }, []);
    const tabs = node('tabs-1', 'tabs', {}, [panel]);
    useBlockEditorStore.getState().initTree([tabs]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="tabs-1" />);

    const wrapperEl = container.querySelector('[data-block-id="panel-empty"]');
    if (!wrapperEl) throw new Error('wrapper di panel-empty non trovato');
    expect(wrapperEl.querySelector(`.${styles.emptyContainer}`)).toBeInTheDocument();
    expect(wrapperEl.querySelector('[aria-label="Aggiungi blocco"]')).toBeInTheDocument();
  });

  it('carouselSlide senza figli: stesso placeholder generico "Contenitore vuoto" + BlockPalette', () => {
    const slide = node('slide-empty', 'carouselSlide', {}, []);
    const carousel = node('car-1', 'carousel', {}, [slide]);
    useBlockEditorStore.getState().initTree([carousel]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="car-1" />);

    const wrapperEl = container.querySelector('[data-block-id="slide-empty"]');
    if (!wrapperEl) throw new Error('wrapper di slide-empty non trovato');
    expect(wrapperEl.querySelector(`.${styles.emptyContainer}`)).toBeInTheDocument();
    expect(wrapperEl.querySelector('[aria-label="Aggiungi blocco"]')).toBeInTheDocument();
  });

  it('accordionItem senza figli: la palette del segnaposto accetta un inserimento reale (stessa infrastruttura di container/section, mai un secondo meccanismo)', async () => {
    const user = userEvent.setup();
    const item = node('item-empty', 'accordionItem', { title: 'Voce vuota' }, []);
    const accordion = node('acc-1', 'accordion', {}, [item]);
    useBlockEditorStore.getState().initTree([accordion]);

    renderWithProviders(<EditorBlockWrapper id="acc-1" />);

    await user.click(screen.getByRole('button', { name: 'Aggiungi blocco' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Titolo' }));

    const updatedItem = findNode(useBlockEditorStore.getState().tree, 'item-empty');
    expect(updatedItem?.children).toHaveLength(1);
    expect(updatedItem?.children[0]?.type).toBe('heading');
  });

  it('modalTrigger: click sul trigger e poi sulla chiusura non modifica mai `window.location.hash` (ADR-59 § 2, mitigazione preventDefault, mai un secondo `<iframe>`/HashRouter)', () => {
    const heading = node('h-modal', 'heading', { level: 'h3', text: 'Contenuto modale' });
    const modalTrigger = node(
      'modal-1',
      'modalTrigger',
      { triggerLabel: 'Apri modale', animation: 'fade' },
      [heading],
    );
    useBlockEditorStore.getState().initTree([modalTrigger]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="modal-1" />);
    const hashBeforeOpen = window.location.hash;
    const wrapperEl = container.querySelector('[data-block-id="modal-1"]');
    if (!wrapperEl) throw new Error('wrapper di modal-1 non trovato');

    fireEvent.click(screen.getByText('Apri modale'));

    expect(window.location.hash).toBe(hashBeforeOpen);
    // Apertura visiva mitigata via attributo (regola CSS mirata in
    // EditorBlockWrapper.module.css), mai via navigazione verso `#modal-{id}`.
    expect(wrapperEl).toHaveAttribute('data-modal-open', 'true');

    fireEvent.click(screen.getByLabelText('Chiudi'));

    expect(window.location.hash).toBe(hashBeforeOpen);
    expect(wrapperEl).not.toHaveAttribute('data-modal-open');
  });

  it('modalTrigger: un heading annidato dentro il pannello resta selezionabile ed editabile, il click su di esso non passa mai da `handleModalTriggerAnchorClick` del genitore', () => {
    const heading = node('h-modal', 'heading', { level: 'h3', text: 'Contenuto modale' });
    const modalTrigger = node(
      'modal-1',
      'modalTrigger',
      { triggerLabel: 'Apri modale', animation: 'fade' },
      [heading],
    );
    useBlockEditorStore.getState().initTree([modalTrigger]);

    const { container } = renderWithProviders(<EditorBlockWrapper id="modal-1" />);
    const headingWrapperEl = container.querySelector('[data-block-id="h-modal"]');
    if (!headingWrapperEl) throw new Error('wrapper di h-modal non trovato');

    fireEvent.click(headingWrapperEl);

    // Il click seleziona il proprio nodo (heading), non riapre/richiude il modale del
    // genitore — `stopPropagation` sul wrapper più interno impedisce la risalita
    // dell'evento fino a `handleModalTriggerAnchorClick`.
    expect(useBlockEditorStore.getState().selectedId).toBe('h-modal');
    const wrapperEl = container.querySelector('[data-block-id="modal-1"]');
    expect(wrapperEl).not.toHaveAttribute('data-modal-open');
  });
});
