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
 * Il registro reale non usa `boolean` né `number` in nessuno dei cinque tipi approvati:
 * per non lasciarli scoperti si affianca ai tipi veri un descrittore sintetico, iniettato
 * mockando il **modulo generato** `types/blocks.types`. È il registro che viene esteso,
 * non il componente: esattamente il gesto che il criterio di Done di T5 dichiara che deve
 * bastare ("aggiungere una prop nel registro non richiede toccare questo file").
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import type { BlockNode } from './block-tree.utils';

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

  it('mediaRef → campo in sola lettura affiancato dal pulsante della libreria', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: '' }));

    const input = screen.getByRole('textbox', { name: 'File' });
    expect(input).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: /Sfoglia Media Library/ })).toBeInTheDocument();

    await user.type(input, 'file-123');

    // Il `guid` non si digita: la scrittura passa solo dalla libreria, che restituisce un
    // riferimento davvero presente in `files`.
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

    // `boolean` è in uso reale da ADR-37 (styleHideDesktop/Tablet/Mobile). `number` resta
    // l'unico kind assente dai tipi approvati, coperto dal solo tipo sintetico.
    expect([...kindsNelRegistro].sort()).toEqual([
      'boolean',
      'color',
      'enum',
      'mediaRef',
      'plainText',
      'richText',
      'url',
    ]);
  });

  it('i sette kind del contratto sono tutti rappresentati fra tipi reali e sonda sintetica', () => {
    const coperti = new Set(
      BLOCK_TYPES.flatMap((descriptor) => descriptor.props).map((prop) => prop.kind),
    );

    expect([...coperti].sort()).toEqual([
      'boolean',
      'color',
      'enum',
      'mediaRef',
      'number',
      'plainText',
      'richText',
      'url',
    ]);
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
  /** Apre la libreria dal pulsante dell'ispettore e attende la griglia. */
  async function openLibrary(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /Sfoglia Media Library/ }));
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

  it('riflette il guid scelto nel campo in sola lettura e chiude la libreria', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: 'Logo' }));

    const tile = await openLibrary(user);
    await user.click(tile);
    await user.click(screen.getByRole('button', { name: /Seleziona Immagine/ }));

    expect(screen.getByRole('textbox', { name: 'File' })).toHaveValue('a1b2c3d4e5f6a7b8');
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

  it('nessun altro kind mostra il pulsante della libreria (mappa per kind, non per type)', async () => {
    renderInspectorWith(node('h-1', 'heading', { text: 'Titolo', level: 'h2' }));

    expect(screen.queryByRole('button', { name: /Sfoglia Media Library/ })).not.toBeInTheDocument();
  });
});
