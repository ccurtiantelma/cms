import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPageDocument } from '../src/entry-server';
import { computeFormHoneypotFieldName, computeFormSignature } from '../src/form-antispam';
import { PublicSiteConfig } from '../src/config';
import type { components } from '@api-types';
import { DEFAULT_THEME_CONFIG } from '../../frontend/src/theme';

type PublicPageDto = components['schemas']['PublicPageDto'];

const THEME_PATH = '/api/v1/public/settings/theme';
const GLOBAL_SECTIONS_PATH = '/api/v1/public/global-sections/active';
const FORM_SCRIPT_HREF = '/assets/form-submit.js';

/** Stesso mock minimo di `global-sections-layout.spec.ts`: nessuna Sezione Globale assegnata. */
function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(THEME_PATH)) {
        return new Response(JSON.stringify(DEFAULT_THEME_CONFIG), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(GLOBAL_SECTIONS_PATH)) {
        return new Response(JSON.stringify({ header: null, footer: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`URL non previsto dal mock: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Pagina con un blocco `heading`, nessun `form`: caso di controllo (F10-04). */
function pageWithoutForm(): PublicPageDto {
  return {
    title: 'Pagina senza modulo',
    slug: 'senza-modulo',
    locale: 'it-IT',
    content: {
      version: 1,
      blocks: [{ id: 'b1', type: 'heading', v: 1, props: { level: 'h2', text: 'Ciao' }, children: [] }],
    },
  };
}

/**
 * Pagina con un `form` dentro un `section` (composizione reale, ADR-46 §
 * Impatto: "non ammesso a radice") — un campo `text` e il pulsante di invio.
 */
function pageWithForm(formKey: string): PublicPageDto {
  return {
    title: 'Pagina con modulo',
    slug: 'con-modulo',
    locale: 'it-IT',
    content: {
      version: 1,
      blocks: [
        {
          id: 'section-1',
          type: 'section',
          v: 1,
          props: {},
          children: [
            {
              id: 'form-1',
              type: 'form',
              v: 1,
              props: { formKey },
              children: [
                {
                  id: 'field-1',
                  type: 'form-field',
                  v: 1,
                  props: { fieldType: 'text', name: 'nome', label: 'Nome', required: true },
                  children: [],
                },
                {
                  id: 'submit-1',
                  type: 'form-submit',
                  v: 1,
                  props: { label: 'Invia' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe('SSR: form pubblici, honeypot/HMAC e isola JS di submit (F10-04, ADR-46/RFC-46)', () => {
  it('una Pagina senza blocchi `form` non porta né campi anti-spam né lo script di submit', async () => {
    stubApi();

    const html = await renderPageDocument(pageWithoutForm(), '/assets/style.css', FORM_SCRIPT_HREF);

    expect(html).not.toContain('<form');
    expect(html).not.toContain('data-honeypot');
    expect(html).not.toContain(FORM_SCRIPT_HREF);
  });

  it('una Pagina con un `form` pubblicato riceve honeypot, firma HMAC, URL di submit e lo script', async () => {
    stubApi();
    const formKey = 'contatti-home';

    const html = await renderPageDocument(pageWithForm(formKey), '/assets/style.css', FORM_SCRIPT_HREF);

    const expectedHoneypotName = computeFormHoneypotFieldName(formKey);
    const expectedSignature = computeFormSignature(formKey);
    const expectedSubmitUrl = `${PublicSiteConfig.publicApiBrowserBaseUrl}/api/v1/public/forms/${formKey}/submit`;

    expect(html).toContain('<form');
    expect(html).toContain(`data-form-id="${formKey}"`);
    expect(html).toContain(`data-form-key="${formKey}"`);
    expect(html).toContain(`data-submit-url="${expectedSubmitUrl}"`);

    // Honeypot: input di testo reale (mai type="hidden"), nome derivato via HMAC.
    expect(html).toContain(`name="${expectedHoneypotName}"`);
    expect(html).toContain('data-honeypot="true"');
    expect(html).not.toContain('name="honeypot"');
    expect(html).not.toContain('name="website"');
    expect(html).not.toContain('name="_hp_check"');

    // Firma HMAC come input nascosto reale.
    expect(html).toContain(`name="signature" value="${expectedSignature}"`);

    // Isola JS iniettata solo perché questa Pagina ha un form.
    expect(html).toContain(`<script src="${FORM_SCRIPT_HREF}"`);
  });

  it('l\'occultamento del campo honeypot non usa display:none/opacity:0 letterali (RFC-46 D6.1)', async () => {
    stubApi();

    const html = await renderPageDocument(pageWithForm('newsletter-footer'), '/assets/style.css', FORM_SCRIPT_HREF);

    // Il campo è nascosto solo dal CSS Module (classe), mai da uno style inline euristico.
    const honeypotInputMatch = html.match(/<input[^>]*data-honeypot="true"[^>]*>/);
    expect(honeypotInputMatch).not.toBeNull();
    const honeypotTag = honeypotInputMatch![0];
    expect(honeypotTag).not.toContain('style=');
    expect(honeypotTag).toContain('type="text"');
  });
});
