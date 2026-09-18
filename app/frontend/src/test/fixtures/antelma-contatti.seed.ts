/**
 * Fixture dell'albero di blocchi per la pagina "Antelma Contatti" (F13-03): quattro
 * `container` di primo livello (Hero, Form, Sub-Footer CTA, Footer), stessa forma di
 * `ContentTree.blocks` (`content-tree.ts`, backend — non importato qui per l'isolamento
 * frontend, vedi `types.ts`).
 *
 * Migrata da `section` v1 a `container` v2 (`ADR-82-container-unificato-grid-flex.md` §
 * "Decisione" punti 1/2/4, Sub-Task S2.1b): `section.block.ts` è ora `enabled: false`
 * (deprecato, "binario morto" — § "Decisione" punto 2), e `BlockRenderer.tsx` non monta
 * alcun componente per un tipo `!descriptor.enabled` (`if (!descriptor || !descriptor.enabled)
 * return null`). Un albero radicato in `section` renderizzerebbe quindi **vuoto** — non un gap
 * di questa fixture, ma la conseguenza diretta della deprecazione già decisa dall'ADR: nel
 * flusso reale un nodo `section` non raggiunge mai più questo dispatcher, perché il backend lo
 * riscrive in lettura in `container` prima di servirlo (§ "Decisione" punto 3,
 * `migrateSectionToContainer`) — questa fixture, scritta a mano e mai passata dalla pipeline di
 * migrazione del backend (CLAUDE.md § Isolamento del dominio, nessun import da
 * `app/backend/`), deve quindi partire già migrata.
 *
 * Ogni prop dei quattro `container` (radice o annidati) segue la tabella di corrispondenza
 * `section` → `container` di `ADR-82` § "Decisione" punto 4. `tag: 'section'` preserva il
 * markup semantico originale (e con esso il delimitatore `</section>` su cui
 * `AntelmaCloningParity.test.tsx#sectionHtmlByIndex` isola ogni sezione).
 *
 * `heading`/`richText`/`button`/`image`/`form`/`form-field`/`form-submit` restano invece alla
 * forma v1 già presente: `BlockRenderer.tsx`/`Heading.tsx`/`RichText.tsx`/`Button.tsx` non sono
 * stati migrati alla forma v2 (`color`/`typography`/`margin`/`hideOn`/`link`) da questo
 * sub-task — che cablano `data-canvas-style-id` (T successivo di questo stesso file) ma non
 * cambiano il contratto di props che questi quattro componenti leggono. Scrivere qui `color`/
 * `typography`/`link` produrrebbe una fixture "corretta sulla carta" ma silenziosamente non
 * renderizzata (nessun case in `BlockRenderer.tsx` la legge) — peggiore del v1 invariato che
 * almeno attraversa l'intera pipeline reale.
 *
 * Il motore sfondo/overlay di `container` v2 (`background: background`, `kind: 'background'`)
 * e il layout Flex/Grid (`layout: layout`, `kind: 'layout'`) non sono ancora resi da alcun
 * componente: `Container.tsx` § commento di testa li rimanda esplicitamente al "Runtime Style
 * Bridge" (`generateCanvasCss.ts`), il cui `SUPPORTED_KINDS` **esclude** `'background'` (debito
 * dichiarato in `ADR-82` § "Conseguenze": "background... non implementato ancora"). I valori
 * sotto sono comunque scritti nella forma v2 corretta (`docs/SPEC-propkind-v2.md` § 3.7/§ 4.1,
 * tabella di `ADR-82` § "Decisione" punto 4) per la fedeltà della fixture, ma nessuna
 * asserzione di `AntelmaCloningParity.test.tsx` verifica il loro output CSS — verificarlo è
 * fuori scopo qui (appartiene a `generateCanvasCss.test.ts` il giorno in cui implementerà
 * `'background'`), non una decisione che questo sub-task può anticipare.
 */
import type { RenderableBlockNode } from '../../components/blocks/types';

export const antelmaContattiTree: RenderableBlockNode[] = [
  {
    id: 'hero-section',
    type: 'container',
    props: {
      tag: 'section',
      // `contentWidth: 'full-width'` (v1) → `'full'` (ADR-82 § "Decisione" punto 4, riga
      // `contentWidth`/`maxWidth`).
      contentWidth: 'full',
      // `stylePaddingTop`/`stylePaddingBottom: '96'` (v1, token unico su entrambi i lati
      // verticali) → `padding: spacing` con `top`/`bottom` valorizzati, `left`/`right` a 0
      // (nessun token orizzontale nella fixture originale).
      padding: { default: { top: 96, right: 0, bottom: 96, left: 0, unit: 'px', linked: false } },
      // `styleBackgroundType: 'image'` + le 4 prop immagine/overlay ADR-50 → `background`
      // (`docs/SPEC-propkind-v2.md` § 3.7), non ancora reso da alcun componente (vedi il
      // commento di testa del file).
      background: {
        type: 'image',
        image: { mediaRef: 'a1b2c3d4e5f60001', position: 'center center', size: 'cover' },
        overlay: { color: '#0c2340', opacity: 0.6 },
      },
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
    type: 'container',
    props: {
      tag: 'section',
      padding: { default: { top: 64, right: 0, bottom: 64, left: 0, unit: 'px', linked: false } },
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
          // `justifyContent: {default:'center'}` (v1, scalare) → `layout.justify` (ADR-82 §
          // "Decisione" punto 4, riga `alignItems`/`justifyContent`/`gap`).
          layout: { default: { display: 'flex', justify: 'center' } },
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
    type: 'container',
    props: {
      tag: 'section',
      contentWidth: 'full',
      background: {
        type: 'image',
        image: { mediaRef: 'a1b2c3d4e5f60002', position: 'center center', size: 'cover' },
        overlay: { color: '#051329', opacity: 0.8 },
      },
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
    type: 'container',
    props: {
      tag: 'section',
      // `columns: {default:'4'}` (v1) + `columnRatio` assente (default `'equal'`) → griglia
      // a 4 colonne uguali (ADR-82 § "Decisione" punto 4, riga `columns`/`columnRatio`:
      // "columns > '1' → layout.display:'grid', gridTemplateColumns da columnRatio: equal →
      // {preset:'repeat', count:<columns>}").
      layout: {
        default: {
          display: 'grid',
          gridTemplateColumns: { preset: 'repeat', count: 4 },
          // `gap: {default:'lg'}` (v1, token ADR-33) → `layout.gap` in px. Nessuna tabella
          // dedicata al token di `gap` in ADR-82 § "Decisione": si riusa la stessa scala
          // `none/sm/md/lg` → `0/8/16/32` già data per `stylePadding` (§ "Decisione" punto 4,
          // riga `stylePadding`), lo stesso token ADR-33 con lo stesso insieme di valori.
          gap: { x: 32, y: 32 },
        },
      },
      contentWidth: 'full',
      // `styleBackground: {default:'inverse'}` (token, nessuna delle 9 prop ADR-50
      // valorizzate) → colore letterale (ADR-82 § "Decisione" punto 4, riga
      // `styleBackground`: "inverse → '#111827'", stessa tabella di ADR-81).
      background: { type: 'color', color: '#111827' },
      padding: {
        default: { top: 0, right: 24, bottom: 0, left: 24, unit: 'px', linked: false },
      },
    },
    children: [
      {
        id: 'footer-col-info',
        type: 'container',
        props: { layout: { default: { display: 'flex', direction: 'column' } } },
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
                '<p>© 2026 All Rights Reserved' +
                '| email: info@antelma.it' +
                '<br />Partita Iva e Codice Fiscale 00000000000</p>',
              styleFontSize: { default: 'sm' },
            },
            children: [],
          },
        ],
      },
      {
        id: 'footer-col-group',
        type: 'container',
        props: { layout: { default: { display: 'flex', direction: 'column' } } },
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
        props: { layout: { default: { display: 'flex', direction: 'column' } } },
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
        props: { layout: { default: { display: 'flex', direction: 'column' } } },
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
        props: { layout: { default: { display: 'flex', justify: 'center' } } },
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
