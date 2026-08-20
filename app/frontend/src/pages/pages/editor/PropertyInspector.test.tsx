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
import { screen } from '@testing-library/react';
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

beforeEach(() => {
  useBlockEditorStore.getState().initTree([]);
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
  it('section (nessuna prop di contenuto, solo di stile) mostra una sola scheda, senza tab, con le etichette del registro', () => {
    renderInspectorWith(node('sec-1', 'section'));

    expect(screen.queryByRole('tab', { name: 'Contenuto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Stile' })).not.toBeInTheDocument();
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

  it('richText → Textarea grezza (nessun WYSIWYG) che avverte della sanitizzazione server-side', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('r-1', 'richText', { html: '' }));

    const textarea = screen.getByRole('textbox', { name: 'Contenuto' });
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('maxlength', '20000');
    expect(screen.getByText(/ripulito dal server al salvataggio/i)).toBeInTheDocument();

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

  it('mediaRef → campo disabilitato che dichiara l’assenza della libreria media (F09)', async () => {
    const user = userEvent.setup();
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: '' }));

    const input = screen.getByRole('textbox', { name: 'File' });
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', expect.stringContaining('F09'));

    await user.type(input, 'file-123');

    // Disabilitato davvero: nessuna scorciatoia che finga una media library.
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
    renderInspectorWith(node('i-1', 'image', { mediaRef: '', alt: '' }));

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

    const textarea = screen.getByRole('textbox', { name: 'Contenuto' });
    await user.clear(textarea);
    await user.type(textarea, '<p>digitato ma non salvato</p>');

    // Il server ha risposto al salvataggio con il contenuto ripulito: l'albero si reinizializza.
    useBlockEditorStore.getState().initTree([node('r-1', 'richText', { html: '<p>ripulito</p>' })]);
    useBlockEditorStore.getState().selectNode('r-1');
    rerender(<PropertyInspector />);

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

    // I kind assenti dai tipi approvati (boolean, number) sono coperti dal tipo sintetico.
    expect([...kindsNelRegistro].sort()).toEqual([
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
      'enum',
      'mediaRef',
      'number',
      'plainText',
      'richText',
      'url',
    ]);
  });
});
