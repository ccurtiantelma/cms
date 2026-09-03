/**
 * Fixture dell'albero di blocchi per la pagina "Antelma Contatti" (F13-03): quattro
 * `section` di primo livello (Hero, Form, Sub-Footer CTA, Footer), stessa forma di
 * `ContentTree.blocks` (`content-tree.ts`, backend — non importato qui per l'isolamento
 * frontend, vedi `types.ts`). Esercita i due motori additivi appena estesi al registro:
 * ADR-50 (`styleBackgroundType`/overlay su `section`) e ADR-51 (`colSpan` su `form-field`).
 *
 * Due scostamenti dal brief letterale, entrambi per rispettare lo schema del registro già
 * approvato (mai una prop/valore inventati fuori ADR):
 * - Titolo Hero a `level: 'h2'`, non `h1` — l'enum di `heading` lo esclude (`h1` è riservato
 *   al template del consumer HTML, mai a un blocco, SPEC-F02-blocchi.md § 3.3).
 * - Pulsante telefono con `href` root-relative, non `tel:` — `kind: 'url'` ammette solo
 *   `http`/`https`/`mailto`/root-relative (`isAllowedUrl`,
 *   `block-tree-validator.service.ts`); "danger" è reso con `styleBackgroundColor`/
 *   `styleTextColor` (`kind: 'color'`), perché `button` non dichiara una prop `variant`
 *   (`button.block.ts`: "nessuna prop di rendering (variant, size, icon)").
 */
import type { RenderableBlockNode } from '../../components/blocks/types';

export const antelmaContattiTree: RenderableBlockNode[] = [
  {
    id: 'hero-section',
    type: 'section',
    props: {
      contentWidth: 'full-width',
      styleBackgroundType: 'image',
      styleBackgroundImageRef: 'a1b2c3d4e5f60001',
      styleBackgroundPosition: 'center center',
      styleBackgroundSize: 'cover',
      styleOverlayColor: '#0c2340',
      styleOverlayOpacity: 0.6,
      stylePaddingTop: { default: '96' },
      stylePaddingBottom: { default: '96' },
    },
    children: [
      {
        id: 'hero-heading',
        type: 'heading',
        props: {
          level: 'h2',
          text: 'RICHIEDI UN CONTATTO ANTELMA',
          styleTextColor: { default: 'inverse' },
          styleTextAlign: 'center',
          styleFontSize: { default: 'xl' },
          styleFontWeight: { default: 'bold' },
        },
        children: [],
      },
    ],
  },
  {
    id: 'form-section',
    type: 'section',
    props: {
      // "large" (brief) mappato al token dichiarato più vicino: la scala di
      // `stylePaddingTop`/`stylePaddingBottom` è numerica (0-96px), nessun valore 'large'.
      stylePaddingTop: { default: '64' },
      stylePaddingBottom: { default: '64' },
    },
    children: [
      {
        id: 'form-heading',
        type: 'heading',
        props: {
          level: 'h2',
          text: 'Hai necessità di ricevere un nostro contatto?',
          styleTextAlign: 'center',
        },
        children: [],
      },
      {
        id: 'form-phone-cta-wrapper',
        type: 'container',
        props: {
          justifyContent: { default: 'center' },
        },
        children: [
          {
            id: 'form-phone-cta',
            type: 'button',
            props: {
              label: '+39 0331 651 811',
              href: '/contatti',
              styleBackgroundColor: '#c0392b',
              styleTextColor: { default: 'inverse' },
            },
            children: [],
          },
        ],
      },
      {
        id: 'contact-form',
        type: 'form',
        props: { formKey: 'antelma-contatti' },
        children: [
          {
            id: 'field-nome',
            type: 'form-field',
            props: {
              fieldType: 'text',
              name: 'nome',
              label: 'Nome',
              required: true,
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-cognome',
            type: 'form-field',
            props: {
              fieldType: 'text',
              name: 'cognome',
              label: 'Cognome',
              required: true,
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-azienda',
            type: 'form-field',
            props: {
              fieldType: 'text',
              name: 'azienda',
              label: 'Azienda',
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-telefono',
            type: 'form-field',
            props: {
              fieldType: 'text',
              name: 'telefono',
              label: 'Telefono',
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-email',
            type: 'form-field',
            props: {
              fieldType: 'email',
              name: 'email',
              label: 'Email',
              required: true,
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-note',
            type: 'form-field',
            props: {
              fieldType: 'textarea',
              name: 'note',
              label: 'Note / Messaggio',
              colSpan: { default: '12' },
            },
            children: [],
          },
          {
            id: 'field-privacy',
            type: 'form-field',
            props: {
              fieldType: 'checkbox',
              name: 'privacy',
              label: 'Ho letto e accetto la Privacy Policy',
              required: true,
              colSpan: { default: '12' },
            },
            children: [],
          },
          {
            id: 'field-submit',
            type: 'form-submit',
            props: { label: 'Invia richiesta' },
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'subfooter-cta-section',
    type: 'section',
    props: {
      contentWidth: 'full-width',
      styleBackgroundType: 'image',
      styleBackgroundImageRef: 'a1b2c3d4e5f60002',
      styleOverlayColor: '#051329',
      styleOverlayOpacity: 0.8,
    },
    children: [
      {
        id: 'subfooter-heading',
        type: 'heading',
        props: {
          level: 'h3',
          text: "RIMANI IN CONNESSIONE CON L'INNOVAZIONE",
          styleTextColor: { default: 'inverse' },
          styleTextAlign: 'center',
        },
        children: [],
      },
      {
        id: 'subfooter-cta-button',
        type: 'button',
        props: {
          label: 'ISCRIZIONE NEWSLETTER',
          href: '/newsletter',
          styleTextColor: { default: 'inverse' },
        },
        children: [],
      },
    ],
  },
  {
    id: 'footer-section',
    type: 'section',
    props: {
      columns: { default: '4' },
      gap: { default: 'lg' },
      styleBackground: { default: 'inverse' },
      contentWidth: 'full-width',
      stylePaddingLeft: { default: '24' },
      stylePaddingRight: { default: '24' },
    },
    children: [
      {
        id: 'footer-col-info',
        type: 'container',
        props: { flexDirection: { default: 'column' } },
        children: [
          {
            id: 'footer-info-heading',
            type: 'heading',
            props: { level: 'h4', text: 'ANTELMA', styleTextColor: { default: 'inverse' } },
            children: [],
          },
          {
            id: 'footer-info-text',
            type: 'richText',
            props: {
              html:
                '<p>© 2026 All Rights Reserved Antelma S.r.l. | Sede Legale: Via Gavinana, 3 – 21052 ' +
                'Busto Arsizio (VA) | Partita Iva e Codice Fiscale N. 01814180129 | Società iscritta al ' +
                'Registro delle Imprese di Varese al n. 01814180129 | Tel.: 0331 651.811 – Fax: 0331 651.888 ' +
                '| email: info@antelma.it</p>',
              styleFontSize: { default: 'sm' },
            },
            children: [],
          },
        ],
      },
      {
        id: 'footer-col-group',
        type: 'container',
        props: { flexDirection: { default: 'column' } },
        children: [
          {
            id: 'footer-group-heading',
            type: 'heading',
            props: { level: 'h4', text: 'GRUPPO ANTELMA', styleTextColor: { default: 'inverse' } },
            children: [],
          },
          {
            id: 'footer-group-text',
            type: 'richText',
            props: { html: '<p>Chi Siamo<br />Lavora Con Noi</p>' },
            children: [],
          },
        ],
      },
      {
        id: 'footer-col-solutions',
        type: 'container',
        props: { flexDirection: { default: 'column' } },
        children: [
          {
            id: 'footer-solutions-heading',
            type: 'heading',
            props: { level: 'h4', text: 'SOLUZIONI', styleTextColor: { default: 'inverse' } },
            children: [],
          },
          {
            id: 'footer-solutions-text',
            type: 'richText',
            props: { html: '<p>Rete &amp; Connettività<br />Voice &amp; Collaboration</p>' },
            children: [],
          },
        ],
      },
      {
        id: 'footer-col-resources',
        type: 'container',
        props: { flexDirection: { default: 'column' } },
        children: [
          {
            id: 'footer-resources-heading',
            type: 'heading',
            props: { level: 'h4', text: 'ALTRE RISORSE', styleTextColor: { default: 'inverse' } },
            children: [],
          },
          {
            id: 'footer-resources-text',
            type: 'richText',
            props: { html: '<p>News<br />Contatti</p>' },
            children: [],
          },
        ],
      },
      {
        id: 'footer-copyright-bar',
        type: 'container',
        props: { justifyContent: { default: 'center' } },
        children: [
          {
            id: 'footer-copyright-text',
            type: 'richText',
            props: { html: '<p>© 2026 Antelma Group. Tutti i diritti riservati.</p>' },
            children: [],
          },
        ],
      },
    ],
  },
];
