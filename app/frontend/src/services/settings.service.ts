/**
 * Service del modulo settings — Global Theme Customizer (ADR-4).
 * Chiama gli endpoint reali `api/v1/app/settings/theme`: GET aperto a tutti i
 * ruoli autenticati, PUT riservato al SuperAdmin (403 per gli altri).
 *
 * I payload combaciano con `ThemeConfigDto` di `types/api.types.ts` (generato
 * da OpenAPI); qui si usa il tipo locale `ThemeConfig`, strutturalmente
 * identico ma con union letterali più strette su primario/radius/version.
 */
import api from './api';
import type { ThemeConfig } from '../theme';
import type { components } from '../types/api.types';
import type { GlobalTokens } from '../libs/globalTokensCompiler';

const SETTINGS_PREFIX = 'app/settings';

/** Registro dei Locale attivi (F05) — riuso diretto dello schema generato. */
export type MultilingualConfig = components['schemas']['MultilingualConfigDto'];

/**
 * Global Design Tokens (F07 step 2) come esposti dal contratto OpenAPI — riuso diretto dello
 * schema generato, unica differenza col tipo locale `GlobalTokens` (`libs/globalTokensCompiler.ts`)
 * è il campo `version` (vedi `toGlobalTokens`/`toGlobalTokensDto` sotto).
 */
export type GlobalTokensDto = components['schemas']['GlobalTokensDto'];

/** Legge il tema globale dell'installazione (default di fabbrica se mai salvato). */
export async function getThemeConfigApi(): Promise<ThemeConfig> {
  const { data } = await api.get<ThemeConfig>(`${SETTINGS_PREFIX}/theme`);
  return data;
}

/**
 * Salva il tema globale per tutti gli utenti (SuperAdmin only).
 * @param config Configurazione tema completa da persistere.
 * @returns La configurazione salvata restituita dal server.
 */
export async function saveThemeConfigApi(config: ThemeConfig): Promise<ThemeConfig> {
  const { data } = await api.put<ThemeConfig>(`${SETTINGS_PREFIX}/theme`, config);
  return data;
}

/**
 * Legge il registro dei Locale attivi (fallback di fabbrica se mai salvato). Aperto a ogni
 * ruolo autenticato — necessario allo switcher di Locale nell'editor (F05/T6).
 */
export async function getMultilingualConfigApi(): Promise<MultilingualConfig> {
  const { data } = await api.get<MultilingualConfig>(`${SETTINGS_PREFIX}/multilingual`);
  return data;
}

/**
 * Legge i Global Design Tokens del sito (F07 step 2) — default di fabbrica se mai salvati.
 * Aperto a ogni ruolo autenticato: serve al canvas/token picker dell'editor, non solo alla
 * modifica (che resta Admin+ via `saveGlobalTokensApi`).
 */
export async function getGlobalTokensApi(): Promise<GlobalTokensDto> {
  const { data } = await api.get<GlobalTokensDto>(`${SETTINGS_PREFIX}/global-tokens`);
  return data;
}

/**
 * Salva i Global Design Tokens per tutti gli utenti dell'installazione (Admin+, `GuardAdmin`
 * lato server — 403 sotto quella soglia).
 * @param dto Global Design Tokens completi da persistere (`version: 1`, unica versione valida).
 */
export async function saveGlobalTokensApi(dto: GlobalTokensDto): Promise<GlobalTokensDto> {
  const { data } = await api.put<GlobalTokensDto>(`${SETTINGS_PREFIX}/global-tokens`, dto);
  return data;
}

/**
 * Scarta `version` dal DTO di rete per ottenere il tipo `GlobalTokens` consumato dallo store
 * (`useBlockEditorStore.ts`) — le altre proprietà (`palette`/`typography`/`spacing`) combaciano
 * 1:1 con lo schema generato.
 * @param dto Global Design Tokens ricevuti dal server.
 */
export function toGlobalTokens(dto: GlobalTokensDto): GlobalTokens {
  return {
    palette: dto.palette,
    typography: dto.typography,
    spacing: dto.spacing,
  };
}

/**
 * Aggiunge `version: 1` (unica versione valida, `GLOBAL_TOKENS_VERSIONS` lato server) al tipo
 * locale `GlobalTokens` per ottenere il DTO da inviare a `saveGlobalTokensApi`.
 * @param tokens Global Design Tokens correnti dello store.
 */
export function toGlobalTokensDto(tokens: GlobalTokens): GlobalTokensDto {
  return {
    version: 1,
    palette: tokens.palette,
    typography: tokens.typography,
    spacing: tokens.spacing,
  };
}
