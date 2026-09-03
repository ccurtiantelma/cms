/**
 * Component test dell'ispettore delle proprietà (PLAN-F04-editor-visivo.md T5, coperto da T6).
 *
 * Il criterio di Done di T5 è strutturale — **un solo componente per tutti i tipi di
 * blocco**, indicizzato per `PropSpec.kind` e non per `type`. Il modo di verificarlo con un
 * test è coprire tutti e sette i `kind` del registro (`BlockPropDescriptor`) su questo
 * unico componente: se un giorno comparisse un `HeadingInspector`, questi test
 * continuerebbero a passare guardando un componente ormai vuoto — per questo il file
 * verifica anche che il registro reale sia interamente coperto (vedi ultimo `describe`).
 *
 * Il registro reale non copre da solo tutti i kind del contratto (`BlockPropDescriptor`):
 * per non lasciare scoperto ciò che manca si affianca ai tipi veri un descrittore sintetico,
 * iniettato mockando il **modulo generato** `types/blocks.types`. È il registro che viene
 * esteso, non il componente: esattamente il gesto che il criterio di Done di T5 dichiara che
 * deve bastare ("aggiungere una prop nel registro non richiede toccare questo file").
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import type { BlockNode } from './block-tree.utils';
import { DEFAULT_THEME_CONFIG } from '../../../theme';

/**
 * Tipo sintetico che copre i sette `kind` in un blocco solo, aggiunto **in coda** ai
 * cinque tipi veri del registro generato. I tipi reali restano quelli approvati (ADR-21):
 * nessun test qui finge che esista un sesto tipo di blocco nel prodotto.
 */
const SYNTHETIC_TYPE = {
  type: 'kindProbe',
  v: 1,
  enabled: true,
  childrenAllow: [] as const,
  props: [
    { name: 'flag', kind: 'boolean', required: false },
    { name: 'quantita', kind: 'number', required: false },
    { name: 'descrizione', kind: 'plainText', required: false, maxLength: 5000 },
  ],
  meta: { label: 'Sonda dei kind', category: 'test' },
} as const;

/**
 * Tipo sintetico senza alcuna prop, per coprire il ramo "nessuna proprietà modificabile"
 * dell'ispettore (T6). `section` non lo copre più: dalla Decisione 2 di RFC-F04c ha quattro
 * props di stile (`styleSpaceBefore/After`, `stylePadding`, `styleBackground`).
 */
const EMPTY_PROPS_TYPE = {
  type: 'emptyPropsProbe',
  v: 1,
  enabled: true,
  childrenAllow: [] as const,
  props: [] as const,
  meta: { label: 'Sonda senza props', category: 'test' },
} as const;

/**
 * La Media Library è mockata al confine di rete (`services/media.service`): questi test
 * coprono l'ispettore, non la modal — che ha la sua suite in
 * `components/media/MediaLibraryModal.test.tsx`. Mockare il service invece del componente
 * lascia però la modal **vera** nell'albero, quindi il percorso "clic su Sfoglia → scelta
 * → scrittura in store" è esercitato per intero.
 */
const fetchMediaFiles = vi.fn();
const uploadMediaFile = vi.fn();

vi.mock('../../../services/media.service', () => ({
  fetchMediaFiles: (params: unknown) => fetchMediaFiles(params),
  uploadMediaFile: (file: unknown) => uploadMediaFile(file),
}));

vi.mock('../../../types/blocks.types', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../types/blocks.types')>();
  return {
    ...original,
    BLOCK_TYPES: [...original.BLOCK_TYPES, SYNTHETIC_TYPE, EMPTY_PROPS_TYPE],
  };
});

const { BLOCK_TYPES } = await import('../../../types/blocks.types');
const { useBlockEditorStore } = await import('../../../hooks/useBlockEditorStore');
const { default: PropertyInspector } = await import('./PropertyInspector');

/** Nodo di comodo con `children` sempre presente. */
function node(id: string, type: string, props: Record<string, unknown> = {}): BlockNode {
  return { id, type, props, children: [] };
}

/** Monta l'ispettore con `node` selezionato nello store, come farebbe un click nel canvas. */
function renderInspectorWith(
  selected: BlockNode | null,
  tree: BlockNode[] = selected ? [selected] : [],
) {
  useBlockEditorStore.getState().initTree(tree);
  useBlockEditorStore.getState().selectNode(selected ? selected.id : null);
  return renderWithProviders(<PropertyInspector />);
}

/** Le props correnti del nodo `id` nello store: è lì che l'ispettore deve scrivere. */
function propsInStore(id: string): Record<string, unknown> {
  const found = useBlockEditorStore.getState().tree.find((entry) => entry.id === id);
  if (!found) throw new Error(`nodo ${id} assente dallo store`);
  return found.props;
}

/** Un media di comodo, come lo restituirebbe `GET app/files`. */
const MEDIA_RECORD = {
  guid: 'a1b2c3d4e5f6a7b8',
  originalName: 'logo.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  width: 800,
  height: 600,
  url: null,
  entity: 'page-media',
  entityId: null,
  createdAt: '2026-08-25T10:00:00.000Z',
  focalX: 50,
  focalY: 50,
};

beforeEach(() => {
  fetchMediaFiles.mockReset();
  uploadMediaFile.mockReset();
  fetchMediaFiles.mockResolvedValue({
    items: [MEDIA_RECORD],
    totalItems: 1,
    totalPages: 1,
    currentPage: 1,
    itemsPerPage: 20,
  });
  useBlockEditorStore.getState().initTree([]);
  useBlockEditorStore.getState().setActiveViewport('desktop');
  // F07 step 2: nessun Global Design Token idratato di default — ogni test che ne ha bisogno
  // (token picker di `case 'color'`) lo dichiara esplicitamente con `hydrateGlobalTokens`.
  useBlockEditorStore.setState({ globalTokens: null });
});

describe('PropertyInspector — nessuna selezione e tipi fuori registro', () => {
  it('senza selezione invita a sceglierne uno, senza campi', () => {
    renderInspectorWith(null);

    expect(screen.getByText(/Seleziona un blocco nel canvas/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('su un tipo non presente nel registro non esplode: spiega perché non è modificabile', () => {
    renderInspectorWith(node('n-1', 'tipoRimosso', { qualcosa: 'x' }));

    expect(screen.getByText(/non è nel registro/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('su un tipo senza alcuna prop dichiara che si configura con i figli', () => {
    renderInspectorWith(node('e-1', 'emptyPropsProbe'));

    expect(screen.getByText(/non ha proprietà modificabili/i)).toBeInTheDocument();
  });
});

describe('PropertyInspector — schede Contenuto/Stile (T6)', () => {
  it('section (nessuna prop di contenuto, solo di stile e avanzate) mostra Stile e Avanzato, mai Contenuto, con le etichette del registro', () => {
    renderInspectorWith(node('sec-1', 'section'));

    expect(screen.queryByRole('tab', { name: 'Contenuto' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Stile' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Avanzato' })).toBeInTheDocument();
    expect(screen.getByText('Spazio prima')).toBeInTheDocument();
    expect(screen.getByText('Spazio dopo')).toBeInTheDocument();
    expect(screen.getByText('Spaziatura interna')).toBeInTheDocument();
    expect(screen.getByText('Sfondo')).toBeInTheDocument();
    expect(screen.getByText('Allineamento verticale')).toBeInTheDocument();
    expect(screen.getByText('Colore di sfondo')).toBeInTheDocument();
    expect(screen.queryByText('styleSpaceBefore')).not.toBeInTheDocument();
  });

  it('un tipo senza alcuna prop tab:"style" mostra una sola scheda, senza tab', () => {
    renderInspectorWith(node('k-1', 'kindProbe', { flag: false, quantita: 0, descrizione: '' }));

    expect(screen.queryByRole('tab', { name: 'Contenuto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Stile' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('descrizione')).toBeInTheDocument();
  });

  it('heading (props di contenuto e di stile) mostra le due schede con le etichette del registro', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    expect(screen.getByRole('tab', { name: 'Contenuto' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Livello' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Testo' })).toBeInTheDocument();

    const styleTab = screen.getByRole('tab', { name: 'Stile' });
    await user.click(styleTab);

    expect(screen.getByText('Colore testo')).toBeInTheDocument();
    expect(screen.getByText('Dimensione testo')).toBeInTheDocument();
    expect(screen.getByText('Spessore testo')).toBeInTheDocument();
  });

  it('modificare il controllo desktop di una prop responsive lascia intatti tablet e mobile', async () => {
    const user = userEvent.setup();
    renderInspectorWith(
      node('sec-1', 'section', {
        styleSpaceBefore: { default: 'none', tablet: 'sm', mobile: 'lg' },
      }),
    );

    const select = screen.getByRole('textbox', { name: 'Spazio prima' });
    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'md' }));

    expect(propsInStore('sec-1').styleSpaceBefore).toEqual({
      default: 'md',
      tablet: 'sm',
      mobile: 'lg',
    });
  });

  it('una prop responsive senza valore ancora scritto nasce come oggetto { default } dal registro, non uno scalare', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('sec-1', 'section'));

    const select = screen.getByRole('textbox', { name: 'Spazio prima' });
    expect(select).toHaveValue('none');

    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'lg' }));

    expect(propsInStore('sec-1').styleSpaceBefore).toEqual({ default: 'lg' });
  });

  it('con lo Switcher su Tablet il controllo scrive solo la chiave tablet, lasciando default e mobile intatti', async () => {
    const user = userEvent.setup();
    useBlockEditorStore.getState().setActiveViewport('tablet');
    renderInspectorWith(
      node('sec-1', 'section', {
        styleSpaceBefore: { default: 'none', mobile: 'lg' },
      }),
    );

    const select = screen.getByRole('textbox', { name: 'Spazio prima (Tablet)' });
    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'sm' }));

    expect(propsInStore('sec-1').styleSpaceBefore).toEqual({
      default: 'none',
      tablet: 'sm',
      mobile: 'lg',
    });
  });

  it('con lo Switcher su Mobile il controllo mostra il valore in cascata (tablet, poi default) quando mobile non è ancora scritto', async () => {
    useBlockEditorStore.getState().setActiveViewport('mobile');
    renderInspectorWith(
      node('sec-1', 'section', {
        styleSpaceBefore: { default: 'none', tablet: 'sm' },
      }),
    );

    expect(screen.getByRole('textbox', { name: 'Spazio prima (Mobile)' })).toHaveValue('sm');
  });

  /**
   * T8 (SPEC-F04-grid-responsive-engine.md § 6, gap 4): stesso invariante già coperto sopra
   * per `styleSpaceBefore`, replicato sulle tre props di layout a colonne di ADR-31
   * (`section.columns`/`gap`/`alignItems`) — anch'esse un `Select` responsive generico
   * (ramo `enum` di `PropField.tsx`, nessuna delle tre è in `SPACING_SLIDER_PROPS` né in
   * `CONTAINER_FLEX_SEGMENTED_PROPS`).
   */
  it('section.columns: modificare il controllo desktop lascia intatti tablet e mobile', async () => {
    const user = userEvent.setup();
    renderInspectorWith(
      node('sec-columns', 'section', {
        columns: { default: '1', tablet: '2', mobile: '1' },
      }),
    );

    const select = screen.getByRole('textbox', { name: 'Colonne' });
    await user.click(select);
    await user.click(screen.getByRole('option', { name: '3' }));

    expect(propsInStore('sec-columns').columns).toEqual({
      default: '3',
      tablet: '2',
      mobile: '1',
    });
  });

  it('section.gap: modificare il controllo desktop lascia intatti tablet e mobile', async () => {
    const user = userEvent.setup();
    renderInspectorWith(
      node('sec-gap', 'section', {
        gap: { default: 'none', tablet: 'sm', mobile: 'lg' },
      }),
    );

    const select = screen.getByRole('textbox', { name: 'Spaziatura tra colonne' });
    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'md' }));

    expect(propsInStore('sec-gap').gap).toEqual({
      default: 'md',
      tablet: 'sm',
      mobile: 'lg',
    });
  });

  /**
   * `alignItems` è riconosciuta per **nome** da `CONTAINER_FLEX_SEGMENTED_PROPS`
   * (`inspector.utils.ts`), non per tipo di blocco: `section.alignItems` condivide quindi il
   * ramo `SegmentedControl` con `container.alignItems`, non il `Select` generico — a
   * differenza di `columns`/`gap` sopra, che restano estranee a quell'insieme.
   */
  it('section.alignItems (SegmentedControl, stesso nome di container.alignItems): modificare il controllo desktop lascia intatti tablet e mobile', async () => {
    const user = userEvent.setup();
    renderInspectorWith(
      node('sec-align', 'section', {
        alignItems: { default: 'stretch', tablet: 'center', mobile: 'flex-end' },
      }),
    );

    const flexStartRadio = screen.getByRole('radio', { name: 'flex-start' });
    await user.click(flexStartRadio);

    expect(propsInStore('sec-align').alignItems).toEqual({
      default: 'flex-start',
      tablet: 'center',
      mobile: 'flex-end',
    });
  });

  /**
   * Stesso invariante T8, sul ramo `SegmentedControl` di `container`
   * (`CONTAINER_FLEX_SEGMENTED_PROPS`, `inspector.utils.ts`): il controllo scrive `{
   * ...envelope, [breakpointKey]: next }`, mai una sovrascrittura dell'intero oggetto — qui
   * verificato su `flexDirection`, una delle quattro props del set (`justifyContent`/
   * `alignItems`/`wrap` condividono lo stesso ramo di `PropField.tsx`).
   */
  it('container.flexDirection (SegmentedControl): modificare il controllo desktop lascia intatti tablet e mobile', async () => {
    const user = userEvent.setup();
    renderInspectorWith(
      node('cont-flex', 'container', {
        flexDirection: { default: 'row', tablet: 'column', mobile: 'column-reverse' },
      }),
    );

    const rowReverseRadio = screen.getByRole('radio', { name: 'row-reverse' });
    await user.click(rowReverseRadio);

    expect(propsInStore('cont-flex').flexDirection).toEqual({
      default: 'row-reverse',
      tablet: 'column',
      mobile: 'column-reverse',
    });
  });

  it('container.flexDirection (SegmentedControl): con lo Switcher su Tablet scrive solo la chiave tablet', async () => {
    const user = userEvent.setup();
    useBlockEditorStore.getState().setActiveViewport('tablet');
    renderInspectorWith(
      node('cont-flex-tablet', 'container', {
        flexDirection: { default: 'row', mobile: 'column-reverse' },
      }),
    );

    const columnRadio = screen.getByRole('radio', { name: 'column' });
    await user.click(columnRadio);

    expect(propsInStore('cont-flex-tablet').flexDirection).toEqual({
      default: 'row',
      tablet: 'column',
      mobile: 'column-reverse',
    });
  });
});

/**
 * Indicatore di override per breakpoint (ADR-29 § 2, RFC-F04c): un pallino accanto
 * all'etichetta di un campo `responsive` quando il breakpoint attivo dello Switcher porta
 * un valore esplicito nell'envelope, distinto dal valore mostrato per cascata. `default`
 * non è mai un "override" — è la base della cascata, quindi mai un pallino su Desktop.
 */
describe('PropertyInspector — indicatore di override per breakpoint (RFC-F04c)', () => {
  const DOT_TESTID = 'breakpoint-override-dot';

  it('su Desktop nessun pallino, anche quando tablet e mobile hanno valori espliciti', () => {
    renderInspectorWith(
      node('sec-1', 'section', {
        styleSpaceBefore: { default: 'none', tablet: 'sm', mobile: 'lg' },
      }),
    );

    expect(screen.queryByTestId(DOT_TESTID)).not.toBeInTheDocument();
  });

  it('su Tablet il pallino compare quando la prop porta un valore esplicito per tablet (Select generico)', () => {
    useBlockEditorStore.getState().setActiveViewport('tablet');
    renderInspectorWith(
      node('sec-1', 'section', {
        styleSpaceBefore: { default: 'none', tablet: 'sm' },
      }),
    );

    expect(screen.getByTestId(DOT_TESTID)).toBeInTheDocument();
  });

  it('su Tablet nessun pallino quando tablet non è ancora scritto (il campo mostra solo il valore in cascata dal default)', () => {
    useBlockEditorStore.getState().setActiveViewport('tablet');
    renderInspectorWith(
      node('sec-1', 'section', {
        styleSpaceBefore: { default: 'none' },
      }),
    );

    expect(screen.queryByTestId(DOT_TESTID)).not.toBeInTheDocument();
  });

  it('su Mobile il pallino compare solo quando mobile è esplicito, non quando eredita da tablet', () => {
    useBlockEditorStore.getState().setActiveViewport('mobile');
    renderInspectorWith(
      node('sec-1', 'section', {
        styleSpaceBefore: { default: 'none', tablet: 'sm' },
      }),
    );

    expect(screen.queryByTestId(DOT_TESTID)).not.toBeInTheDocument();
  });

  it('ramo SegmentedControl (alignItems): il pallino segue lo stesso invariante su Tablet', () => {
    useBlockEditorStore.getState().setActiveViewport('tablet');
    renderInspectorWith(
      node('sec-align', 'section', {
        alignItems: { default: 'stretch', tablet: 'center' },
      }),
    );

    expect(screen.getByTestId(DOT_TESTID)).toBeInTheDocument();
  });

  /**
   * Le otto prop di spaziatura per lato di `section`/`container` non passano dal ramo
   * Slider di `PropField.tsx` (`SPACING_SLIDER_PROPS`): `StyleTab.tsx` le raggruppa tutte e
   * otto in `VisualBoxModelInspector` (ADR-33 § 4/ADR-41 § 5), che porta il proprio
   * indicatore d'override — stesso invariante, componente diverso.
   */
  it('VisualBoxModelInspector (stylePaddingTop di section): il pallino segue lo stesso invariante su Mobile, solo sul lato esplicito', () => {
    useBlockEditorStore.getState().setActiveViewport('mobile');
    renderInspectorWith(
      node('sec-padding', 'section', {
        stylePaddingTop: { default: '0', mobile: '16' },
        stylePaddingRight: { default: '0', tablet: '8' },
      }),
    );

    // Un solo lato porta un override esplicito su Mobile (`stylePaddingTop`): l'altro lato
    // valorizzato (`stylePaddingRight`, esplicito solo su tablet) non deve accenderne uno.
    expect(screen.getAllByTestId(DOT_TESTID)).toHaveLength(1);
  });
});

describe('PropertyInspector — i sette kind del registro', () => {
  it('enum → Select con i soli valori del registro, scrittura immediata in store', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    const select = screen.getByRole('textbox', { name: 'Livello' });
    expect(select).toHaveAttribute('aria-haspopup', 'listbox');
    expect(select).toHaveValue('h2');

    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'h4' }));

    // `Select` non ha un "fine modifica": la scelta è già l'atto conclusivo.
    expect(propsInStore('h-1').level).toBe('h4');
    expect(screen.queryByRole('option', { name: 'h1' })).not.toBeInTheDocument();
  });

  it('plainText corto → TextInput su una riga, con il maxLength del registro, scritto onBlur', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: '' }));

    const input = screen.getByRole('textbox', { name: 'Testo' });
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('maxlength', '200');

    await user.type(input, 'Titolo della sezione');
    // Ancora nessuna scrittura: il dispatch avviene al blur, non a ogni tasto.
    expect(propsInStore('h-1').text).toBe('');

    await user.tab();

    expect(propsInStore('h-1').text).toBe('Titolo della sezione');
  });

  it('plainText lungo → Textarea multiriga invece di un campo su una riga', () => {
    renderInspectorWith(node('k-1', 'kindProbe', { flag: false, quantita: 0, descrizione: '' }));

    expect(screen.getByLabelText('descrizione').tagName).toBe('TEXTAREA');
  });

  it('richText → editor dual-mode Visuale/Codice che avverte della sanitizzazione server-side', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('r-1', 'richText', { html: '' }));

    // Di default la scheda "Visuale" è attiva (editor WYSIWYG Tiptap).
    expect(screen.getByRole('tab', { name: 'Visuale' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/ripulito dal server al salvataggio/i)).toBeInTheDocument();

    // La scheda "Codice" espone l'HTML grezzo, stessa textarea di prima (maxLength dal registro).
    await user.click(screen.getByRole('tab', { name: 'Codice' }));
    const textarea = screen.getByRole('textbox', { name: 'Contenuto' });
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('maxlength', '20000');

    await user.type(textarea, '<p>Testo <strong>ricco</strong></p>');
    await user.tab();

    expect(propsInStore('r-1').html).toBe('<p>Testo <strong>ricco</strong></p>');
  });

  it('url → TextInput con avviso UX sugli schemi ammessi, che non blocca la scrittura', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('b-1', 'button', { label: 'Vai', href: '' }));

    const input = screen.getByRole('textbox', { name: 'Link' });
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('maxlength', '2048');

    await user.type(input, 'javascript:alert(1)');
    await user.tab();

    expect(screen.getByText(/Ammessi: http\(s\):\/\//i)).toBeInTheDocument();
    // La validazione client è solo UX: il valore arriva in store, l'autorità è il 400 del server.
    expect(propsInStore('b-1').href).toBe('javascript:alert(1)');

    await user.clear(input);
    await user.type(input, 'https://esempio.it/contatti');
    await user.tab();

    expect(screen.queryByText(/Ammessi: http\(s\):\/\//i)).not.toBeInTheDocument();
    expect(propsInStore('b-1').href).toBe('https://esempio.it/contatti');
  });

  it('mediaRef vuoto → miniatura placeholder e pulsante "Scegli Immagine", nessun campo digitabile', () => {
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: '' }));

    // Il `guid` non si digita mai: niente `textbox` per questo controllo — solo la
    // miniatura e i pulsanti verso la libreria.
    expect(screen.queryByRole('textbox', { name: 'File' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scegli Immagine' })).toBeInTheDocument();
    // Senza un `guid` non c'è nulla da rimuovere.
    expect(screen.queryByRole('button', { name: 'Rimuovi' })).not.toBeInTheDocument();
  });

  it('mediaRef valorizzato → miniatura risolta via resolveMediaSrc e pulsante "Sostituisci Immagine"', () => {
    // La miniatura è decorativa (`alt=""`, ridondante col pulsante accanto): si legge dal
    // DOM via `container`, non da un ruolo d'accessibilità che un `alt` vuoto non espone.
    const { container } = renderInspectorWith(
      node('i-1', 'image', { mediaRef: 'a1b2c3d4e5f6a7b8', alt: 'Logo' }),
    );

    const thumb = container.querySelector('img') as HTMLImageElement;
    expect(thumb).not.toBeNull();
    expect(thumb.src).toContain('a1b2c3d4e5f6a7b8');
    expect(screen.getByRole('button', { name: 'Sostituisci Immagine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rimuovi' })).toBeInTheDocument();
  });

  it('"Rimuovi" scrive un mediaRef vuoto tramite lo stesso canale di commit di ogni altra prop (undo/redo)', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: 'a1b2c3d4e5f6a7b8', alt: 'Logo' }));

    await user.click(screen.getByRole('button', { name: 'Rimuovi' }));
    expect(propsInStore('i-1').mediaRef).toBe('');

    useBlockEditorStore.getState().undo();
    expect(propsInStore('i-1').mediaRef).toBe('a1b2c3d4e5f6a7b8');

    useBlockEditorStore.getState().redo();
    expect(propsInStore('i-1').mediaRef).toBe('');
  });

  it('boolean → Switch, scrittura immediata in store', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('k-1', 'kindProbe', { flag: false, quantita: 0, descrizione: '' }));

    const toggle = screen.getByLabelText('flag');
    expect(toggle).toHaveAttribute('type', 'checkbox');
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    expect(propsInStore('k-1').flag).toBe(true);
  });

  it('number → NumberInput che scrive un numero, non una stringa', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('k-1', 'kindProbe', { flag: false, quantita: 0, descrizione: '' }));

    const input = screen.getByLabelText('quantita');
    await user.clear(input);
    await user.type(input, '42');
    await user.tab();

    expect(propsInStore('k-1').quantita).toBe(42);
    expect(typeof propsInStore('k-1').quantita).toBe('number');
  });

  it('color → il picker scrive l\'hex risolto del colore di tema, mai un riferimento "var(...)"', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));
    await user.click(screen.getByRole('tab', { name: 'Stile' }));

    const tokenPicker = screen.getByRole('button', { name: 'Colori del tema' });
    expect(tokenPicker).toBeEnabled();
    await user.click(tokenPicker);

    // `findByText`, non `getByText`: il dropdown del Popover entra con la transizione
    // Mantine (150ms), quindi non è ancora nel DOM nel tick del click. È il motivo per cui
    // la versione precedente di questo test era rossa.
    const primaryOption = await screen.findByText(
      `Primario · ${DEFAULT_THEME_CONFIG.colors.primary}`,
    );
    await user.click(primaryOption);

    expect(propsInStore('h-1').styleTextColorCustom).toBe(DEFAULT_THEME_CONFIG.colors.primary);
  });
});

describe('PropertyInspector — i cinque kind di ADR-38 (unitValue/border/shadow/cssClassName/htmlId)', () => {
  it("unitValue → NumberInput scrive { value, unit }, preservando l'unità corrente", async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    await user.click(screen.getByRole('tab', { name: 'Stile' }));

    const label = 'Dimensione testo personalizzata';
    const numberInput = screen.getByRole('textbox', { name: `${label} — Valore` });
    await user.clear(numberInput);
    await user.type(numberInput, '24');

    expect(propsInStore('h-1').styleFontSizeCustom).toEqual({ value: 24, unit: 'px' });
  });

  it('unitValue → il Select unità scrive solo `unit`, preservando `value`', async () => {
    const user = userEvent.setup();
    renderInspectorWith(
      node('h-1', 'heading', {
        level: 'h2',
        text: 'Titolo',
        styleFontSizeCustom: { value: 18, unit: 'px' },
      }),
    );

    await user.click(screen.getByRole('tab', { name: 'Stile' }));

    const label = 'Dimensione testo personalizzata';
    const unitSelect = screen.getByRole('textbox', { name: `${label} — Unità` });
    await user.click(unitSelect);
    await user.click(screen.getByRole('option', { name: 'rem' }));

    expect(propsInStore('h-1').styleFontSizeCustom).toEqual({ value: 18, unit: 'rem' });
  });

  it('border → il Select stile scrive i 4 campi fissi, mai un valore libero', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    await user.click(screen.getByRole('tab', { name: 'Stile' }));

    const styleSelect = screen.getByRole('textbox', { name: 'Bordo — Stile' });
    await user.click(styleSelect);
    await user.click(screen.getByRole('option', { name: 'dashed' }));

    expect(propsInStore('h-1').styleBorder).toEqual({
      width: 0,
      style: 'dashed',
      color: '#000000',
      radius: 0,
    });
  });

  it('border → un solo controllo di raggio, mai quattro campi per angolo (ADR-38 § 3)', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    await user.click(screen.getByRole('tab', { name: 'Stile' }));

    expect(screen.getByRole('slider', { name: 'Bordo — Raggio' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /Angolo/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('slider', { name: /Raggio/i })).toHaveLength(1);
  });

  it('border → lo Slider dello spessore scrive `width` via tastiera, lasciando gli altri campi intatti', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    await user.click(screen.getByRole('tab', { name: 'Stile' }));

    const widthSlider = screen.getByRole('slider', { name: 'Bordo — Spessore' });
    widthSlider.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');

    expect(propsInStore('h-1').styleBorder).toEqual({
      width: 2,
      style: 'solid',
      color: '#000000',
      radius: 0,
    });
  });

  it('shadow → stessa forma per box-shadow e text-shadow, nessun toggle Box/Text', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    await user.click(screen.getByRole('tab', { name: 'Stile' }));

    expect(screen.queryByRole('radio', { name: /Box|Text/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Box|Text/i })).not.toBeInTheDocument();

    const blurSlider = screen.getByRole('slider', { name: 'Ombra — Sfocatura' });
    blurSlider.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');

    expect(propsInStore('h-1').styleShadow).toEqual({
      x: 0,
      y: 0,
      blur: 3,
      spread: 0,
      color: '#000000',
    });
  });

  it('cssClassName → TextInput, avviso UX non bloccante sul formato, scrittura onBlur', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    await user.click(screen.getByRole('tab', { name: 'Avanzato' }));

    const input = screen.getByRole('textbox', { name: 'Classe CSS personalizzata' });
    await user.type(input, '1classe-non-valida');
    await user.tab();

    expect(screen.getByText(/Ammessi 1-3 nomi/i)).toBeInTheDocument();
    // La validazione client è solo UX: il valore arriva comunque in store.
    expect(propsInStore('h-1').customCssClass).toBe('1classe-non-valida');

    await user.clear(input);
    await user.type(input, 'hero-titolo hero-titolo--grande');
    await user.tab();

    expect(screen.queryByText(/Ammessi 1-3 nomi/i)).not.toBeInTheDocument();
    expect(propsInStore('h-1').customCssClass).toBe('hero-titolo hero-titolo--grande');
  });

  it('htmlId → TextInput a token singolo, messaggio UX distinto da cssClassName', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    await user.click(screen.getByRole('tab', { name: 'Avanzato' }));

    const input = screen.getByRole('textbox', { name: 'ID elemento personalizzato' });
    await user.type(input, 'due token');
    await user.tab();

    expect(screen.getByText(/Ammesso un solo identificativo/i)).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'hero-titolo');
    await user.tab();

    expect(screen.queryByText(/Ammesso un solo identificativo/i)).not.toBeInTheDocument();
    expect(propsInStore('h-1').customElementId).toBe('hero-titolo');
  });
});

describe('PropertyInspector — sezioni Accordion stile Elementor', () => {
  it('le sezioni con campi compaiono (Bordo, Ombra, Spaziatura) sul tab Stile di heading, tutte aperte di default', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    await user.click(screen.getByRole('tab', { name: 'Stile' }));

    // Il nome dell'intestazione Accordion (`Accordion.Control`, un `button`) coincide col
    // nome della sezione — `getByRole('button', ...)` la distingue dall'etichetta di
    // gruppo omonima dentro `PropField` (es. il "Bordo" del controllo composito stesso).
    expect(screen.getByRole('button', { name: 'Tipografia & Colori' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bordo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ombra' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spaziatura' })).toBeInTheDocument();
    // Aperte di default: i campi sono già nel DOM, nessun click extra sull'Accordion.
    expect(screen.getByText('Colore testo')).toBeInTheDocument();
  });

  it('la sezione "Attributi Custom" compare sul tab Avanzato, insieme a "Layout & Responsive"', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    await user.click(screen.getByRole('tab', { name: 'Avanzato' }));

    expect(screen.getByText('Layout & Responsive')).toBeInTheDocument();
    expect(screen.getByText('Attributi Custom')).toBeInTheDocument();
    expect(screen.getByText('Classe CSS personalizzata')).toBeInTheDocument();
  });

  it('la sezione "Allineamento" del tab Contenuto non compare per nessun tipo reale (nessuna prop di contenuto è di allineamento oggi)', () => {
    renderInspectorWith(node('h-1', 'heading', { level: 'h2', text: 'Titolo' }));

    expect(screen.queryByText('Allineamento')).not.toBeInTheDocument();
    expect(screen.getByText('Testo / Media')).toBeInTheDocument();
  });
});

describe('PropertyInspector — obbligatorietà e cambio di selezione', () => {
  it('segnala le prop obbligatorie vuote senza impedire nulla', () => {
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: '' }));

    expect(
      screen.getAllByText(/Obbligatoria: il salvataggio verrà rifiutato/i).length,
    ).toBeGreaterThan(0);
  });

  it('nonEmpty è trattato come obbligatorio quanto required (alt di image)', async () => {
    const user = userEvent.setup();
    // `mediaRef` valorizzato di proposito: da quando la Media Library esiste anche quel
    // campo segnala l'obbligatorietà, e qui l'unica prop sotto esame deve restare `alt`.
    renderInspectorWith(node('i-1', 'image', { mediaRef: 'a1b2c3d4e5f6a7b8', alt: '' }));

    const alt = screen.getByRole('textbox', { name: 'Testo alternativo' });
    await user.type(alt, '   ');
    await user.tab();

    expect(screen.getByText(/Obbligatoria: il salvataggio verrà rifiutato/i)).toBeInTheDocument();
  });

  it('cambiando selezione il form mostra i valori del nuovo nodo, non quelli del precedente', () => {
    const primo = node('h-1', 'heading', { level: 'h2', text: 'Primo' });
    const secondo = node('h-2', 'heading', { level: 'h4', text: 'Secondo' });
    const { rerender } = renderInspectorWith(primo, [primo, secondo]);

    expect(screen.getByRole('textbox', { name: 'Testo' })).toHaveValue('Primo');

    useBlockEditorStore.getState().selectNode('h-2');
    rerender(<PropertyInspector />);

    expect(screen.getByRole('textbox', { name: 'Testo' })).toHaveValue('Secondo');
    expect(screen.getByRole('textbox', { name: 'Livello' })).toHaveValue('h4');
  });

  it('una nuova initTree butta via la bozza locale non ancora committata (contenuto sanitizzato dal server)', async () => {
    const user = userEvent.setup();
    const nodo = node('r-1', 'richText', { html: '<p>originale</p>' });
    const { rerender } = renderInspectorWith(nodo, [nodo]);

    await user.click(screen.getByRole('tab', { name: 'Codice' }));
    const textarea = screen.getByRole('textbox', { name: 'Contenuto' });
    await user.clear(textarea);
    await user.type(textarea, '<p>digitato ma non salvato</p>');

    // Il server ha risposto al salvataggio con il contenuto ripulito: l'albero si reinizializza.
    useBlockEditorStore.getState().initTree([node('r-1', 'richText', { html: '<p>ripulito</p>' })]);
    useBlockEditorStore.getState().selectNode('r-1');
    rerender(<PropertyInspector />);

    await user.click(screen.getByRole('tab', { name: 'Codice' }));
    expect(screen.getByRole('textbox', { name: 'Contenuto' })).toHaveValue('<p>ripulito</p>');
  });
});

describe('PropertyInspector — copertura del registro reale', () => {
  it('ogni kind dichiarato dai tipi approvati è coperto da un caso di questo file', () => {
    const kindsNelRegistro = new Set(
      BLOCK_TYPES.filter(
        (descriptor) =>
          descriptor.type !== SYNTHETIC_TYPE.type && descriptor.type !== EMPTY_PROPS_TYPE.type,
      )
        .flatMap((descriptor) => descriptor.props)
        .map((prop) => prop.kind),
    );

    // `boolean` è in uso reale da ADR-37 (styleHideDesktop/Tablet/Mobile). `border`,
    // `cssClassName`, `htmlId`, `shadow`, `unitValue` sono in uso reale da ADR-38
    // (`styleBorder`/`styleShadow`/`customCssClass`/`customElementId`/`styleFontSizeCustom`).
    // `number` è in uso reale da ADR-47 (`section.styleOverlayOpacity`): non è più l'unico
    // kind assente dai tipi approvati, non c'è più bisogno del tipo sintetico per coprirlo.
    expect([...kindsNelRegistro].sort()).toEqual(
      [
        'border',
        'boolean',
        'color',
        'cssClassName',
        'enum',
        'htmlId',
        'mediaRef',
        'number',
        'plainText',
        'richText',
        'shadow',
        'unitValue',
        'url',
      ].sort(),
    );
  });

  it('i dodici kind del contratto sono tutti rappresentati fra tipi reali e sonda sintetica', () => {
    const coperti = new Set(
      BLOCK_TYPES.flatMap((descriptor) => descriptor.props).map((prop) => prop.kind),
    );

    expect([...coperti].sort()).toEqual(
      [
        'border',
        'boolean',
        'color',
        'cssClassName',
        'enum',
        'htmlId',
        'mediaRef',
        'number',
        'plainText',
        'richText',
        'shadow',
        'unitValue',
        'url',
      ].sort(),
    );
  });
});

/**
 * Integrazione della Media Library nell'ispettore (RFC-F05/F09 § 5, PLAN T5/T7).
 *
 * Il criterio che questi test difendono è **dove finisce la scelta**: nello store Zustand,
 * sotto la prop `mediaRef`, come un `guid` nudo. Verificarlo sul solo DOM lascerebbe
 * passare una scrittura mancata, una scrittura su `props.url` (prop che il blocco `image`
 * non ha) o un URL composto qui invece che da `resolveMediaSrc()` in rendering (ADR-27 § 6).
 */
describe('PropertyInspector — Media Library', () => {
  /**
   * Apre la libreria dal pulsante dell'ispettore e attende la griglia. L'etichetta del
   * pulsante dipende dal valore corrente di `mediaRef` ("Scegli Immagine" a vuoto,
   * "Sostituisci Immagine" quando un `guid` è già scritto).
   */
  async function openLibrary(
    user: ReturnType<typeof userEvent.setup>,
    buttonName: RegExp = /Scegli Immagine|Sostituisci Immagine/,
  ) {
    await user.click(screen.getByRole('button', { name: buttonName }));
    return screen.findByRole('button', { name: 'logo.png' });
  }

  it('scrive il guid scelto nello store, sotto la prop mediaRef', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: 'Logo' }));

    const tile = await openLibrary(user);
    await user.click(tile);
    await user.click(screen.getByRole('button', { name: /Seleziona Immagine/ }));

    expect(propsInStore('i-1').mediaRef).toBe('a1b2c3d4e5f6a7b8');
  });

  it('scrive un guid nudo, mai un URL composto (ADR-27 § 6)', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: 'Logo' }));

    const tile = await openLibrary(user);
    await user.click(tile);
    await user.click(screen.getByRole('button', { name: /Seleziona Immagine/ }));

    const written = propsInStore('i-1').mediaRef as string;
    expect(written).toMatch(/^[0-9a-f]{16}$/);
    expect(written).not.toContain('/');
    expect(written).not.toContain('http');
  });

  it('non introduce una prop `url` sul blocco image (nessuna modifica al registro)', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: 'Logo' }));

    const tile = await openLibrary(user);
    await user.click(tile);
    await user.click(screen.getByRole('button', { name: /Seleziona Immagine/ }));

    expect(propsInStore('i-1')).not.toHaveProperty('url');
    expect(Object.keys(propsInStore('i-1'))).toEqual(['mediaRef', 'alt']);
  });

  it('la selezione è annullabile: passa da updateBlockPropsAction, quindi da undo/redo', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: 'Logo' }));

    const tile = await openLibrary(user);
    await user.click(tile);
    await user.click(screen.getByRole('button', { name: /Seleziona Immagine/ }));
    expect(propsInStore('i-1').mediaRef).toBe('a1b2c3d4e5f6a7b8');

    useBlockEditorStore.getState().undo();
    expect(propsInStore('i-1').mediaRef).toBe('');

    useBlockEditorStore.getState().redo();
    expect(propsInStore('i-1').mediaRef).toBe('a1b2c3d4e5f6a7b8');
  });

  it('riflette il guid scelto nella miniatura e nel pulsante, e chiude la libreria', async () => {
    const user = userEvent.setup();
    const { container } = renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: 'Logo' }));

    const tile = await openLibrary(user);
    await user.click(tile);
    await user.click(screen.getByRole('button', { name: /Seleziona Immagine/ }));

    expect(screen.getByRole('button', { name: 'Sostituisci Immagine' })).toBeInTheDocument();
    const thumb = container.querySelector('img') as HTMLImageElement;
    expect(thumb.src).toContain('a1b2c3d4e5f6a7b8');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'logo.png' })).not.toBeInTheDocument(),
    );
  });

  it('preseleziona nella libreria il media già referenziato dal blocco', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: 'a1b2c3d4e5f6a7b8', alt: 'Logo' }));

    const tile = await openLibrary(user);
    expect(tile).toHaveAttribute('aria-pressed', 'true');
  });

  it('chiudere senza scegliere non tocca lo store', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: 'aaaabbbbccccdddd', alt: 'Logo' }));

    await openLibrary(user);
    const [annulla] = screen.getAllByRole('button', { name: 'Annulla' });
    await user.click(annulla);

    expect(propsInStore('i-1').mediaRef).toBe('aaaabbbbccccdddd');
  });

  it('la libreria filtra sui soli media editoriali di tipo immagine', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: 'Logo' }));

    await openLibrary(user);

    expect(fetchMediaFiles.mock.calls[0][0]).toMatchObject({
      entity: 'page-media',
      mimePrefix: 'image/',
    });
  });

  it('nessun altro kind mostra il pulsante della libreria (mappa per kind, non per type)', () => {
    renderInspectorWith(node('h-1', 'heading', { text: 'Titolo', level: 'h2' }));

    expect(
      screen.queryByRole('button', { name: /Scegli Immagine|Sostituisci Immagine/ }),
    ).not.toBeInTheDocument();
  });
});

/**
 * ADR-50 — `styleBackgroundType` sceglie fra colore/immagine/gradiente: `StyleTab` nasconde i
 * campi non pertinenti al tipo attivo (presentazione, non validazione — stesso principio di
 * `maxWidth` sotto `contentWidth = full-width`, ADR-33 § 1). Le prop restano comunque
 * dichiarate nel registro: qui si verifica solo la visibilità del controllo, non la scrittura
 * (già coperta genericamente da "i sette kind del registro" per `enum`/`color`/`mediaRef`).
 */
describe('PropertyInspector — section.styleBackgroundType (ADR-50)', () => {
  it('type "color" (default, nessun valore ancora scritto): niente campi di immagine o gradiente', () => {
    renderInspectorWith(node('sec-bg', 'section', {}));

    expect(screen.getByRole('textbox', { name: 'Tipo sfondo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Scegli Immagine|Sostituisci Immagine/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Posizione sfondo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Dimensione sfondo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Colore iniziale gradiente')).not.toBeInTheDocument();
    expect(screen.queryByText('Colore finale gradiente')).not.toBeInTheDocument();
  });

  it('type "image": compaiono media picker, posizione e dimensione; il gradiente resta nascosto', () => {
    renderInspectorWith(node('sec-bg', 'section', { styleBackgroundType: 'image' }));

    expect(
      screen.getByRole('button', { name: /Scegli Immagine|Sostituisci Immagine/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Posizione sfondo' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Dimensione sfondo' })).toBeInTheDocument();
    expect(screen.queryByText('Colore iniziale gradiente')).not.toBeInTheDocument();
    expect(screen.queryByText('Colore finale gradiente')).not.toBeInTheDocument();
  });

  it('type "gradient": compaiono i due color picker; immagine/posizione/dimensione restano nascosti', () => {
    renderInspectorWith(node('sec-bg', 'section', { styleBackgroundType: 'gradient' }));

    expect(screen.getByText('Colore iniziale gradiente')).toBeInTheDocument();
    expect(screen.getByText('Colore finale gradiente')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Scegli Immagine|Sostituisci Immagine/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Posizione sfondo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Dimensione sfondo' })).not.toBeInTheDocument();
  });

  it('passare da "color" a "image" scrive il tipo in store e fa comparire i campi immagine', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('sec-bg', 'section', { styleBackgroundType: 'color' }));

    expect(screen.queryByRole('textbox', { name: 'Posizione sfondo' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('textbox', { name: 'Tipo sfondo' }));
    await user.click(screen.getByRole('option', { name: 'image' }));

    expect(propsInStore('sec-bg').styleBackgroundType).toBe('image');
    expect(screen.getByRole('textbox', { name: 'Posizione sfondo' })).toBeInTheDocument();
  });
});
