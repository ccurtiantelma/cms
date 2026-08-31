/**
 * Service per le chiamate API del modulo `app/site-templates` (RFC-40 Opzione
 * B). Ogni funzione è una chiamata Axios pura sull'istanza condivisa `api`
 * (token JWT + refresh + notifiche 401/403/404/5xx già gestiti dai suoi
 * interceptor, vedi `services/api.ts`): gestione errori applicativi (409,
 * validazione 400) resta alle pagine/store chiamanti, come in
 * `pages.service.ts`/`global-sections.service.ts`.
 *
 * `contentTree` è opaco sul wire (envelope `{ version, blocks }`, ADR-21):
 * questo service lo decodifica/codifica da e verso la forma di editing
 * `ContentBlockNode[]` usata da `SiteTemplate`, così i chiamanti (store,
 * pagine) non toccano mai l'envelope grezzo.
 */
import api from './api';
import type { Pagination } from '../types/common.types';
import { ENVELOPE_VERSION } from '../types/blocks.types';
import type {
  ContentBlockNode,
  CreateSiteTemplateDto,
  QuerySiteTemplatesDto,
  SiteTemplate,
  UpdateSiteTemplateDto,
} from '../types/site-templates.types';
import type { components } from '../types/api.types';

const SITE_TEMPLATES_PREFIX = 'app/site-templates';
const PUBLIC_SITE_TEMPLATES_RESOLVE_PATH = 'public/site-templates/resolve';

type SiteTemplateResponseDto = components['schemas']['SiteTemplateResponseDto'];
type ResolvedSiteTemplateDto = components['schemas']['ResolvedSiteTemplateDto'];

/** Decodifica l'envelope opaco del wire (`{ version, blocks }`) nella forma di editing. */
function decodeContentTree(raw: Record<string, unknown>): ContentBlockNode[] {
  const blocks = (raw as { blocks?: unknown }).blocks;
  return Array.isArray(blocks) ? (blocks as ContentBlockNode[]) : [];
}

/** Codifica la forma di editing nell'envelope atteso dal server (stessa versione delle Pagine). */
function encodeContentTree(blocks: ContentBlockNode[]): Record<string, unknown> {
  return { version: ENVELOPE_VERSION, blocks };
}

/** Converte la risposta del server (envelope grezzo) nella forma admin del modulo. */
function toSiteTemplate(dto: SiteTemplateResponseDto): SiteTemplate {
  return { ...dto, contentTree: decodeContentTree(dto.contentTree) };
}

/** `GET /app/site-templates` — elenco paginato, filtrabile per tipo/lingua/stato di pubblicazione. */
export async function list(params?: QuerySiteTemplatesDto): Promise<Pagination<SiteTemplate>> {
  const { data } = await api.get<Pagination<SiteTemplateResponseDto>>(SITE_TEMPLATES_PREFIX, {
    params,
  });
  return { ...data, items: data.items.map(toSiteTemplate) };
}

/** `GET /app/site-templates/:guid` — dettaglio, albero di blocchi incluso. */
export async function getByGuid(guid: string): Promise<SiteTemplate> {
  const { data } = await api.get<SiteTemplateResponseDto>(`${SITE_TEMPLATES_PREFIX}/${guid}`);
  return toSiteTemplate(data);
}

/** `POST /app/site-templates` — crea un Template di tema. */
export async function create(dto: CreateSiteTemplateDto): Promise<SiteTemplate> {
  const { data } = await api.post<SiteTemplateResponseDto>(SITE_TEMPLATES_PREFIX, {
    ...dto,
    contentTree: dto.contentTree ? encodeContentTree(dto.contentTree) : undefined,
  });
  return toSiteTemplate(data);
}

/**
 * `PATCH /app/site-templates/:guid` — aggiorna un Template di tema.
 * `dto.version` è obbligatoria (lock ottimistico): `409
 * SITE_TEMPLATE_VERSION_CONFLICT` se non combacia più con la riga corrente.
 */
export async function update(guid: string, dto: UpdateSiteTemplateDto): Promise<SiteTemplate> {
  const { data } = await api.patch<SiteTemplateResponseDto>(`${SITE_TEMPLATES_PREFIX}/${guid}`, {
    ...dto,
    contentTree: dto.contentTree ? encodeContentTree(dto.contentTree) : undefined,
  });
  return toSiteTemplate(data);
}

/** `DELETE /app/site-templates/:guid` — soft-delete (204). */
export async function deleteTemplate(guid: string): Promise<void> {
  await api.delete(`${SITE_TEMPLATES_PREFIX}/${guid}`);
}

/**
 * `POST /public/site-templates/resolve` — risolve il Template di tema
 * applicabile a una rotta pubblica. Anonima, sola lettura: nessun token
 * richiesto, ma passa comunque per l'istanza condivisa `api` (stessa
 * `baseURL`, stesso interceptor di errore rete/5xx).
 */
export async function resolve(
  path: string,
  type: string,
  lang: string,
): Promise<ResolvedSiteTemplateDto> {
  const { data } = await api.post<ResolvedSiteTemplateDto>(PUBLIC_SITE_TEMPLATES_RESOLVE_PATH, {
    path,
    type,
    lang,
  });
  return data;
}
