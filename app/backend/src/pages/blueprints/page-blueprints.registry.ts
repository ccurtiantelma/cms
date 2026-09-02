import { BlockNode, ContentTree } from '../content-tree';

/**
 * Registro dei Template di partenza (Page Blueprints), consultato da
 * `PagesService.create()` quando `CreatePageDto.templateSlug` è valorizzato
 * (RFC-43). Ogni blueprint è un albero blocchi `v:1` conforme al registro
 * dei tipi (`blocks/block-registry.ts`) — stessa forma di un `draftContent`
 * scritto da un client, così da poter attraversare invariata la pipeline di
 * scrittura (`assertValidContentTreeShape` → migrazione → validazione →
 * sanitizzazione) in `PagesService`.
 *
 * Gli `id` qui sotto sono placeholder statici: `PagesService` li rigenera
 * tutti con `Utils.randomString(16)` alla clonazione, per evitare collisioni
 * fra Pagine create dallo stesso blueprint (business-rules.md § Blocchi,
 * ogni nodo ha un `id` proprio).
 */
export interface PageBlueprint {
  /** Identificativo stabile del blueprint, usato come `templateSlug` in `CreatePageDto`. */
  slug: string;
  /** Etichetta leggibile per la UI di selezione template. */
  label: string;
  /** Descrizione breve del caso d'uso del blueprint. */
  description: string;
  /** Albero blocchi iniziale, stessa forma di `draftContent`. */
  content: ContentTree;
}

const emptyBlueprintBlocks: BlockNode[] = [
  {
    id: 'section-root',
    type: 'section',
    v: 1,
    props: {},
    children: [],
  },
];

const landingPageBlueprintBlocks: BlockNode[] = [
  {
    id: 'hero-section',
    type: 'section',
    v: 1,
    props: { columns: { default: '1' }, contentWidth: 'boxed', stylePadding: { default: 'lg' } },
    children: [
      {
        id: 'hero-heading',
        type: 'heading',
        v: 1,
        props: { level: 'h2', text: 'Il titolo della tua landing page' },
        children: [],
      },
      {
        id: 'hero-richtext',
        type: 'richText',
        v: 1,
        props: { html: '<p>Descrivi qui la proposta di valore in una o due frasi.</p>' },
        children: [],
      },
      {
        id: 'hero-button',
        type: 'button',
        v: 1,
        props: { label: 'Scopri di più', href: '/' },
        children: [],
      },
    ],
  },
  {
    id: 'two-columns-section',
    type: 'section',
    v: 1,
    props: { columns: { default: '2' }, contentWidth: 'boxed' },
    children: [
      {
        id: 'column-one-richtext',
        type: 'richText',
        v: 1,
        props: { html: '<p>Contenuto della prima colonna.</p>' },
        children: [],
      },
      {
        id: 'column-two-richtext',
        type: 'richText',
        v: 1,
        props: { html: '<p>Contenuto della seconda colonna.</p>' },
        children: [],
      },
    ],
  },
];

const servicePageBlueprintBlocks: BlockNode[] = [
  {
    id: 'service-section',
    type: 'section',
    v: 1,
    props: { columns: { default: '1' }, contentWidth: 'boxed' },
    children: [
      {
        id: 'service-heading',
        type: 'heading',
        v: 1,
        props: { level: 'h2', text: 'Nome del servizio' },
        children: [],
      },
      {
        id: 'service-cover-image',
        type: 'image',
        v: 1,
        props: { mediaRef: '0000000000000000', alt: 'Immagine di copertina del servizio' },
        children: [],
      },
      {
        id: 'service-richtext',
        type: 'richText',
        v: 1,
        props: {
          html: '<p>Descrizione del servizio: cosa comprende, a chi si rivolge, come funziona.</p>',
        },
        children: [],
      },
    ],
  },
];

const contactPageBlueprintBlocks: BlockNode[] = [
  {
    id: 'contact-heading-section',
    type: 'section',
    v: 1,
    props: { columns: { default: '1' }, contentWidth: 'boxed' },
    children: [
      {
        id: 'contact-heading',
        type: 'heading',
        v: 1,
        props: { level: 'h2', text: 'Contattaci' },
        children: [],
      },
      {
        id: 'contact-intro-richtext',
        type: 'richText',
        v: 1,
        props: { html: '<p>Compila il modulo o scrivici direttamente per qualsiasi informazione.</p>' },
        children: [],
      },
    ],
  },
  {
    id: 'contact-form-section',
    type: 'section',
    v: 1,
    props: { columns: { default: '1' }, contentWidth: 'boxed' },
    children: [
      {
        id: 'contact-form-placeholder-container',
        type: 'container',
        v: 1,
        props: {},
        children: [],
      },
    ],
  },
];

/**
 * Registro indicizzato per `slug`. I quattro blueprint del primo rilascio
 * (RFC-43): `empty`, `landing-page`, `service-page`, `contact-page`.
 */
export const PAGE_BLUEPRINTS: ReadonlyMap<string, PageBlueprint> = new Map(
  [
    {
      slug: 'empty',
      label: 'Vuoto',
      description: 'Una singola Sezione senza contenuto, punto di partenza neutro.',
      content: { version: 1, blocks: emptyBlueprintBlocks },
    },
    {
      slug: 'landing-page',
      label: 'Landing page',
      description: 'Hero con titolo, testo e pulsante, seguita da una Sezione a due colonne.',
      content: { version: 1, blocks: landingPageBlueprintBlocks },
    },
    {
      slug: 'service-page',
      label: 'Pagina servizio',
      description: 'Titolo, immagine di copertina e testo strutturato per descrivere un servizio.',
      content: { version: 1, blocks: servicePageBlueprintBlocks },
    },
    {
      slug: 'contact-page',
      label: 'Pagina contatti',
      description: 'Intestazione e struttura pronta ad accogliere il modulo di contatto.',
      content: { version: 1, blocks: contactPageBlueprintBlocks },
    },
  ].map((blueprint) => [blueprint.slug, blueprint]),
);

/** Ritorna il blueprint per `slug`, o `undefined` se non registrato. */
export function getPageBlueprint(slug: string): PageBlueprint | undefined {
  return PAGE_BLUEPRINTS.get(slug);
}
