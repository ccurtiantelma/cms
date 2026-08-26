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

const SETTINGS_PREFIX = 'app/settings';

/** Registro dei Locale attivi (F05) — riuso diretto dello schema generato. */
export type MultilingualConfig = components['schemas']['MultilingualConfigDto'];

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
