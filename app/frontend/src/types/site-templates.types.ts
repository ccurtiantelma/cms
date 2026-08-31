/**
 * Tipi del modulo Template di tema (RFC-40 Opzione B, F09 — Temi/Risorse).
 * Stesso principio di `pages.types.ts`/`global-sections.types.ts`: riuso
 * diretto degli schemi generati da OpenAPI (`types/api.types.ts`), tipi
 * locali solo per ciò che lo swagger non esprime (query params dell'elenco,
 * forma di editing dell'albero blocchi).
 */
import type { components } from './api.types';
import type { PaginationParams } from './common.types';
import type { RenderableBlockNode } from '../components/blocks/types';

/** Tipo di Template — riuso diretto dell'enum generato dallo schema. */
export type SiteTemplateType = components['schemas']['SiteTemplateResponseDto']['type'];

/** Verso di una regola di visualizzazione — riuso diretto dello schema generato. */
export type DisplayConditionType = components['schemas']['DisplayConditionRuleDto']['type'];

/**
 * Bersaglio di una regola di visualizzazione. `post_type`/`category` non
 * compaiono: il backend li esclude deliberatamente (`DisplayConditionTarget`,
 * `app/backend/src/common/enums.ts`, RFC-40 § Opzione C) perché
 * richiederebbero un concetto di tipo di contenuto/tassonomia assente da
 * `SiteTemplateType`. Nessun quinto/quarto valore va aggiunto qui senza una
 * corrispondente ADR/RFC lato backend.
 */
export type DisplayConditionTarget = components['schemas']['DisplayConditionRuleDto']['target'];

/** Regola di visualizzazione — riuso diretto dello schema generato. */
export type DisplayConditionRule = components['schemas']['DisplayConditionRuleDto'];

/**
 * Nodo dell'albero di blocchi in forma di editing: stesso alias di
 * `RenderableBlockNode` (`components/blocks/types.ts`), non si ridichiara una
 * terza volta la stessa forma a runtime (id/type/props/children).
 */
export type ContentBlockNode = RenderableBlockNode;

/**
 * Rappresentazione admin di un Template di tema per lo store/editor.
 * `contentTree` qui è la forma di editing (`ContentBlockNode[]`, i soli
 * `blocks` dell'envelope): il service decodifica/codifica l'envelope opaco
 * del wire (`SiteTemplateResponseDto.contentTree`, `{ version, blocks }`,
 * ADR-21) da e verso questa forma — mai un `any` a runtime.
 */
export interface SiteTemplate extends Omit<
  components['schemas']['SiteTemplateResponseDto'],
  'contentTree'
> {
  contentTree: ContentBlockNode[];
}

/** Filtri/parametri di query di `GET /app/site-templates`. */
export interface QuerySiteTemplatesDto extends PaginationParams {
  type?: SiteTemplateType;
  language?: string;
  isPublished?: boolean;
}

/** Payload di creazione — stesso schema generato, `contentTree` in forma di editing. */
export interface CreateSiteTemplateDto extends Omit<
  components['schemas']['CreateSiteTemplateDto'],
  'contentTree'
> {
  contentTree?: ContentBlockNode[];
}

/**
 * Payload di aggiornamento — `version` obbligatoria (lock ottimistico): un
 * valore obsoleto produce `409 SITE_TEMPLATE_VERSION_CONFLICT`, mai un
 * overwrite silenzioso.
 */
export interface UpdateSiteTemplateDto extends Omit<
  components['schemas']['UpdateSiteTemplateDto'],
  'contentTree'
> {
  contentTree?: ContentBlockNode[];
}

/** Corpo strutturato di errore del modulo, come normalizzato da `AllExceptionsFilter`. */
export interface SiteTemplatesErrorData {
  message?: string | string[];
  code?: string;
  details?: { path?: string };
}

/** I sei tipi di Template, nell'ordine in cui si presentano nella UI (sidebar "Site Parts"). */
export const SITE_TEMPLATE_TYPES: SiteTemplateType[] = [
  'single_page',
  'search_results',
  'loop_item',
  'error_404',
  'single_post',
  'archive',
];

/** Etichette IT dei tipi di Template (sidebar, badge, select). */
export const SITE_TEMPLATE_TYPE_LABELS: Record<SiteTemplateType, string> = {
  single_page: 'Pagina singola',
  search_results: 'Risultati ricerca',
  loop_item: 'Elemento Loop',
  error_404: 'Errore 404',
  single_post: 'Articolo singolo',
  archive: 'Archivio',
};

/**
 * Tipi senza semantica di risoluzione pubblica ancora — stesso insieme di
 * `RESOLVABLE_SITE_TEMPLATE_TYPES` (complemento) in `common/enums.ts` del
 * backend: `single_post`/`archive` mancano della precondizione (tipo di
 * contenuto/tassonomia) che `TemplateResolverService.resolveForRoute`
 * richiederebbe per considerarli candidati. La scrittura resta accettata
 * dall'API; qui si segnala solo "In arrivo" e si disabilita la selezione
 * nella sidebar e nella creazione, per non generare Template che nessuna
 * rotta pubblica potrà mai risolvere.
 */
export const SITE_TEMPLATE_TYPES_COMING_SOON: ReadonlySet<SiteTemplateType> = new Set([
  'single_post',
  'archive',
]);

/** Etichette IT del verso di una regola di visualizzazione. */
export const DISPLAY_CONDITION_TYPE_LABELS: Record<DisplayConditionType, string> = {
  include: 'Includi',
  exclude: 'Escludi',
};

/** Etichette IT del bersaglio di una regola di visualizzazione. */
export const DISPLAY_CONDITION_TARGET_LABELS: Record<DisplayConditionTarget, string> = {
  entire_site: 'Tutto il sito',
  specific_page: 'Percorso specifico',
  path_pattern: 'Pattern di percorso',
};
