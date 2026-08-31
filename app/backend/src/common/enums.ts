/**
 * Ruoli applicativi RBAC a soglie. Numero minore = privilegio maggiore.
 * I guard in `src/auth/guard.ts` confrontano con `<=` rispetto a una soglia minima.
 */
export enum AppUserRoles {
  SuperAdmin = 5,
  Admin = 10,
  Manager = 20,
  User = 30,
}

/**
 * Slot di layout pubblico di una Sezione Globale (F06, ADR-40). `None` è lo
 * stato di default: una Sezione può esistere senza essere innestata in nessun
 * punto del layout pubblico. Al massimo una riga attiva per `Header`/`Footer`
 * (vincolo di unicità parziale in `schema.ts`).
 */
export enum GlobalSectionLayoutSlot {
  None = 'none',
  Header = 'header',
  Footer = 'footer',
}

/**
 * Tipo di un Template di tema (`site_templates`, RFC-40 Opzione B, decisione
 * umana 2026-08-31). `header`/`footer` NON compaiono qui: restano su
 * `global_sections` (ADR-40) — un secondo binario per lo stesso concetto è
 * stato scartato in sede di decisione.
 *
 * `SinglePost` e `Archive` sono valori accettati in scrittura ma **senza
 * semantica di risoluzione**: il CMS non ha oggi un concetto di tipo di
 * contenuto/tassonomia (regola 1 del modello di contenuto, `CLAUDE.md`), la
 * precondizione che RFC-40 § "3" segnala come mancante per questi due
 * valori. `TemplateResolverService.resolveForRoute` non li considera mai
 * candidati finché quella decisione architetturale non arriva.
 */
export enum SiteTemplateType {
  SinglePost = 'single_post',
  SinglePage = 'single_page',
  Archive = 'archive',
  SearchResults = 'search_results',
  LoopItem = 'loop_item',
  Error404 = 'error_404',
}

/** Tipi con semantica di risoluzione reale in {@link SiteTemplateType} (vedi commento sul tipo). */
export const RESOLVABLE_SITE_TEMPLATE_TYPES: ReadonlySet<SiteTemplateType> = new Set([
  SiteTemplateType.SinglePage,
  SiteTemplateType.SearchResults,
  SiteTemplateType.LoopItem,
  SiteTemplateType.Error404,
]);

/** Verso di una regola di visualizzazione di un Template di tema. */
export enum DisplayConditionType {
  Include = 'include',
  Exclude = 'exclude',
}

/**
 * Bersaglio di una regola di visualizzazione. `post_type`/`category` non
 * compaiono: richiederebbero lo stesso concetto di tipo di
 * contenuto/tassonomia assente da {@link SiteTemplateType}, un contratto che
 * nessun consumer potrebbe onorare (RFC-40 § Opzione C, scartata per lo
 * stesso motivo).
 */
export enum DisplayConditionTarget {
  EntireSite = 'entire_site',
  SpecificPage = 'specific_page',
  PathPattern = 'path_pattern',
}
