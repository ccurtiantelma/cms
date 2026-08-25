import * as sanitizeHtml from 'sanitize-html';

/**
 * Profili nominati di sanitizzazione per `kind: 'richText'` (ADR-21 § 4,
 * SPEC-F02-blocchi.md § 2). Insieme **chiuso** — un terzo profilo è "nuovo
 * schema di blocco" ai fini di `CLAUDE.md` § Ask first. Nessun `style`
 * libero: `style` compare in `allowedAttributes` solo per `p`, e solo perché
 * sanitize-html lo richiede per applicare affatto `allowedStyles` — il
 * valore resta comunque vincolato al solo `text-align`, con un pattern
 * chiuso ai quattro token validi (ADR-26 § 1, WYSIWYG). Non tocca `postcss`
 * (ADR-20, correzione T3), che resta morto per costruzione fuori da questo
 * singolo attributo.
 */

const ALLOWED_ATTRIBUTES_A = ['href', 'title', 'target', 'rel'];
const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

/** `target` ammessi (SPEC-F02-blocchi.md § 2.3.2): ogni altro valore si scarta. */
const ALLOWED_TARGETS = new Set(['_blank', '_self']);

/**
 * Normalizza `<a>`: scarta `target` fuori da `_blank`/`_self` e, quando
 * `target="_blank"` sopravvive, forza `rel` a contenere `noopener noreferrer`
 * (SPEC-F02-blocchi.md § 2.3.1) — `target="_blank"` senza `noopener` concede
 * una capacità alla pagina di destinazione, non è cosmetica.
 */
function transformAnchor(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const next: sanitizeHtml.Attributes = { ...attribs };
  if (next.target !== undefined && !ALLOWED_TARGETS.has(next.target)) {
    delete next.target;
  }
  if (next.target === '_blank') {
    const rel = new Set((next.rel ?? '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    next.rel = [...rel].join(' ');
  }
  return { tagName, attribs: next };
}

/** Unico attributo di stile ammesso in tutto il registro (ADR-26 § 3): quattro token chiusi, mai un valore libero. */
const ALLOWED_TEXT_ALIGN = /^(left|right|center|justify)$/;

const COMMON_OPTIONS = {
  // `style` in allowedAttributes.p è necessario perché sanitize-html processi affatto
  // l'attributo su quel tag: senza, `allowedStyles` sotto non ha effetto e l'attributo si
  // scarta per intero, indipendentemente dal suo contenuto (verificato con un repro diretto
  // su sanitize-html). Resta comunque vincolato al solo `text-align` dal pattern chiuso di
  // `allowedStyles` — non è un `style` libero.
  allowedAttributes: { a: ALLOWED_ATTRIBUTES_A, p: ['style'] },
  allowedSchemes: ALLOWED_SCHEMES,
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard' as const,
  allowedStyles: { p: { 'text-align': [ALLOWED_TEXT_ALIGN] } },
  transformTags: { a: transformAnchor },
};

/**
 * `basic` (SPEC-F02-blocchi.md § 2.1): struttura di paragrafo e formattazione
 * inline. Coincide esattamente con l'allowlist di F01 già in
 * `sanitizer.config.ts` — stesso elenco di tag, stessa allowlist di
 * attributi.
 */
export const BASIC_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  ...COMMON_OPTIONS,
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li'],
};

/**
 * `inline` (SPEC-F02-blocchi.md § 2.2): sottoinsieme stretto di `basic`,
 * senza elementi di blocco/lista (`p`, `ul`, `ol`, `li`). Nessuna prop dei
 * cinque tipi del primo rilascio lo usa (A-F02-2): esiste perché ADR-21 § 4
 * nomina l'insieme chiuso dei profili come già completo, e T7 lo esercita
 * con unit test dedicati.
 */
export const INLINE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  ...COMMON_OPTIONS,
  allowedTags: ['a', 'b', 'br', 'em', 'i', 's', 'strong', 'u'],
};
