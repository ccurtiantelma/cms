import * as sanitizeHtml from 'sanitize-html';

/**
 * Allowlist minima di F01 (ADR-20): formattazione inline e struttura di
 * paragrafo di base, `href` limitato agli schemi `http`/`https`/`mailto`,
 * nessuno `<script>`, nessun `<iframe>`, nessun handler `on*`, nessuna URL
 * `javascript:`. F01 non conosce i tipi di blocco (arrivano con F02):
 * questo è un minimo comune denominatore più stretto di qualunque allowlist
 * per tipo di blocco che F02 introdurrà — restringere e poi allargare è
 * reversibile, il contrario no.
 */
export const F01_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li'],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Nessun tag allowlista `style`: sanitize-html invoca `postcss` (dipendenza
  // transitiva, ora runtime di app/backend — vedi ADR-20, correzione
  // 2026-08-17) SOLO per l'attributo `style` quando questo supera il filtro
  // di `allowedAttributes`. Tenerlo fuori da ogni tag mantiene quel percorso
  // morto per costruzione, non per configurazione difensiva a valle.
  allowedStyles: {},
};
