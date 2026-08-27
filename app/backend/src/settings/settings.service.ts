import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { appSettingEntity } from '../db/schema';
import { AuditLogService } from '../common/audit-log.service';
import { AppConstants } from '../common/app-constants';
import { AuthInfo } from '../common/types';
import { Utils } from '../common/utils';
import {
  ThemeConfigDto,
  ThemeLengthUnit,
  ThemePrimarySelection,
  ThemeRadiusValue,
  ThemeUnit,
  THEME_UNSET,
} from './dto/theme-config.dto';
import { MultilingualConfigDto } from './dto/multilingual-config.dto';
import { GlobalTokensDto } from './dto/global-tokens.dto';

/** Chiave della riga di `app_settings` che contiene il tema globale (ADR-4). */
export const THEME_SETTING_KEY = 'theme';

/** Chiave della riga di `app_settings` che contiene il registro Locale attivi (RFC-F05 § 1). */
export const MULTILINGUAL_SETTING_KEY = 'multilingual.locales';

/** Chiave della riga di `app_settings` che contiene i Global Design Tokens (risorsa separata da ADR-4). */
export const GLOBAL_TOKENS_SETTING_KEY = 'global_tokens';

/**
 * Default di fabbrica del tema (contratto v7) — SPECULARE a
 * `DEFAULT_THEME_CONFIG` in `app/frontend/src/theme.ts` (hex della
 * `DEFAULT_THEME` di Mantine 7.17 installata). Restituito da
 * `GET /app/settings/theme` finché nessun SuperAdmin ha mai salvato un tema:
 * il contratto resta non-nullable e ogni client riceve sempre una
 * configurazione completa. Se i due file divergono l'app resta comunque
 * coerente (il frontend confronta i valori col proprio default), ma vanno
 * mantenuti allineati nelle review.
 */
export const DEFAULT_THEME_CONFIG: ThemeConfigDto = {
  version: 7,
  navbarWidth: 210,
  navbarWidthUnit: 'px',
  navbarDefaultCollapsed: false,
  navbarEdgeStyle: 'border',
  navbarEdgeShadowIntensity: 0.16,
  colors: {
    primary: '#228be6',
    secondary: '#868e96',
    accent: '#be4bdb',
    success: '#40c057',
    warning: '#fab005',
    alert: '#f76707',
    error: '#fa5252',
    danger: '#c92a2a',
    info: '#15aabf',
  },
  primaryShade: { light: 8, dark: 5 },
  radius: 'md',
  focusRing: 'auto',
  cursorType: 'default',
  respectReducedMotion: false,
  autoContrast: false,
  luminanceThreshold: 0.3,
  scale: 1,
  defaultGradient: { from: '#228be6', to: '#15aabf', deg: 45 },
  typography: {
    fontFamily: 'inter',
    fontFamilyMonospace: 'system-mono',
    fontSizes: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 },
    fontSizeUnit: 'px',
    lineHeights: { xs: 1.4, sm: 1.45, md: 1.55, lg: 1.6, xl: 1.65 },
    headings: {
      fontFamily: 'inter',
      fontWeight: '700',
      fontSizeUnit: 'px',
      sizes: {
        h1: { fontSize: 34, lineHeight: 1.3 },
        h2: { fontSize: 26, lineHeight: 1.35 },
        h3: { fontSize: 22, lineHeight: 1.4 },
        h4: { fontSize: 18, lineHeight: 1.45 },
        h5: { fontSize: 16, lineHeight: 1.5 },
        h6: { fontSize: 14, lineHeight: 1.5 },
      },
    },
  },
  spacing: { xs: 10, sm: 12, md: 16, lg: 20, xl: 32 },
  spacingUnit: 'px',
  radiusScale: { xs: 2, sm: 4, md: 8, lg: 16, xl: 32 },
  radiusScaleUnit: 'px',
  shadows: {
    xs: { y: 1, blur: 3, spread: 0, opacity: 0.05 },
    sm: { y: 2, blur: 6, spread: -1, opacity: 0.06 },
    md: { y: 4, blur: 12, spread: -2, opacity: 0.07 },
    lg: { y: 8, blur: 20, spread: -4, opacity: 0.08 },
    xl: { y: 12, blur: 28, spread: -6, opacity: 0.09 },
  },
  shadowUnit: 'px',
  components: {
    button: { variant: THEME_UNSET, size: THEME_UNSET, radius: THEME_UNSET },
    actionIcon: { variant: THEME_UNSET, radius: THEME_UNSET },
    badge: { variant: THEME_UNSET, size: THEME_UNSET, radius: THEME_UNSET },
    input: { variant: THEME_UNSET, size: THEME_UNSET, radius: THEME_UNSET },
    card: { shadow: THEME_UNSET, radius: THEME_UNSET, padding: THEME_UNSET, withBorder: false },
    modal: {
      radius: THEME_UNSET,
      shadow: THEME_UNSET,
      padding: THEME_UNSET,
      overlayBlur: 0,
      centered: false,
    },
    table: {
      striped: false,
      highlightOnHover: false,
      withTableBorder: false,
      withColumnBorders: false,
      verticalSpacing: THEME_UNSET,
    },
    tooltip: { withArrow: false, radius: THEME_UNSET },
    loader: { type: THEME_UNSET },
  },
  light: {
    pageBg: '#f8f9fa',
    cardBg: '#ffffff',
    cardBorder: '#ffffff',
    textPrimary: '#000000',
    textSecondary: '#868e96',
    headingH1: '#000000',
    headingH2: '#000000',
    headingH3: '#000000',
    headingH4: '#000000',
    headingH5: '#000000',
    headingH6: '#000000',
    navbarBg: '#ffffff',
    navbarText: '#242424',
    navbarHoverBg: '#f1f3f5',
    navbarActiveBg: '#1971c2',
    navbarActiveText: '#ffffff',
    navbarBorder: '#dee2e6',
  },
  dark: {
    pageBg: '#1f1f1f',
    cardBg: '#242424',
    cardBorder: '#242424',
    textPrimary: '#c9c9c9',
    textSecondary: '#828282',
    headingH1: '#c9c9c9',
    headingH2: '#c9c9c9',
    headingH3: '#c9c9c9',
    headingH4: '#c9c9c9',
    headingH5: '#c9c9c9',
    headingH6: '#c9c9c9',
    navbarBg: '#ffffff',
    navbarText: '#242424',
    navbarHoverBg: '#f1f3f5',
    navbarActiveBg: '#339af0',
    navbarActiveText: '#ffffff',
    navbarBorder: '#dee2e6',
  },
};

/**
 * Default di fabbrica del registro Locale: bootstrap da `AppConstants.defaultLocale`
 * (env var) finché nessun Admin ha mai salvato il registro (RFC-F05 § 1). Un solo
 * Locale attivo, coincidente col default — non un'assunzione multilingua implicita.
 */
export const DEFAULT_MULTILINGUAL_CONFIG: MultilingualConfigDto = {
  active: [AppConstants.defaultLocale],
  default: AppConstants.defaultLocale,
};

/**
 * Default di fabbrica dei Global Design Tokens: restituito da
 * `GET /app/settings/global-tokens` finché nessun Admin ha mai salvato la
 * riga. Risorsa a sé, non derivata dal tema Mantine di ADR-4.
 */
export const DEFAULT_GLOBAL_TOKENS: GlobalTokensDto = {
  version: 1,
  palette: {
    primary: '#93003c',
    secondary: '#00a0d2',
    text: '#333333',
    accent: '#f7a600',
  },
  typography: {
    mainFont: 'inter',
    baseSize: { value: 16, unit: 'px' },
  },
  spacing: {
    baseUnit: { value: 8, unit: 'px' },
  },
};

/** Le 11 chiavi colore del contratto storico (v1/v2), prima dei colori per titolo introdotti in v3. */
interface LegacySchemeTokens {
  pageBg: string;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  navbarBg: string;
  navbarText: string;
  navbarHoverBg: string;
  navbarActiveBg: string;
  navbarActiveText: string;
  navbarBorder: string;
}

/** Forma minima della config v1 storica salvata prima del contratto v2. */
interface LegacyThemeConfigV1 {
  version: 1;
  primaryColor: ThemePrimarySelection;
  radius: ThemeRadiusValue;
  light: LegacySchemeTokens;
  dark: LegacySchemeTokens;
}

/**
 * Forma della config v6 storica: identica alla v7 ma senza le unità dei campi
 * dimensionali (introdotte in v7, sempre implicitamente px prima).
 */
type LegacyThemeConfigV6 = Omit<
  ThemeConfigDto,
  'version' | 'typography' | 'spacingUnit' | 'radiusScaleUnit' | 'shadowUnit' | 'navbarWidthUnit'
> & {
  version: 6;
  typography: Omit<ThemeConfigDto['typography'], 'fontSizeUnit'> & {
    headings: Omit<ThemeConfigDto['typography']['headings'], 'fontSizeUnit'>;
  };
};

/**
 * Forma della config v5 storica: identica alla v6 ma con la selezione
 * `primaryColor`/`customPrimary` al posto del blocco `colors` a 9 voci.
 */
type LegacyThemeConfigV5 = Omit<LegacyThemeConfigV6, 'version' | 'colors'> & {
  version: 5;
  primaryColor: ThemePrimarySelection;
  customPrimary: string[];
};

/** Forma della config v4 storica: identica alla v5 tranne lo stile del bordo destro della sidebar. */
type LegacyThemeConfigV4 = Omit<
  LegacyThemeConfigV5,
  'version' | 'navbarEdgeStyle' | 'navbarEdgeShadowIntensity'
> & {
  version: 4;
};

/** Forma della config v3 storica: identica alla v4 tranne larghezza/stato di default della navbar. */
type LegacyThemeConfigV3 = Omit<
  LegacyThemeConfigV5,
  | 'version'
  | 'navbarWidth'
  | 'navbarDefaultCollapsed'
  | 'navbarEdgeStyle'
  | 'navbarEdgeShadowIntensity'
> & {
  version: 3;
};

/** Forma della config v2 storica: identica alla v3 tranne i colori titolo, assenti in light/dark. */
type LegacyThemeConfigV2 = Omit<
  LegacyThemeConfigV5,
  | 'version'
  | 'navbarWidth'
  | 'navbarDefaultCollapsed'
  | 'navbarEdgeStyle'
  | 'navbarEdgeShadowIntensity'
  | 'light'
  | 'dark'
> & {
  version: 2;
  light: LegacySchemeTokens;
  dark: LegacySchemeTokens;
};

/** Hex shade 6 delle 14 palette native Mantine — nessuna dipendenza da @mantine/core lato backend. */
const MANTINE_NATIVE_COLOR_SHADE6: Record<string, string> = {
  blue: '#228be6',
  gray: '#868e96',
  red: '#fa5252',
  pink: '#e64980',
  grape: '#be4bdb',
  violet: '#7950f2',
  indigo: '#4c6ef5',
  cyan: '#15aabf',
  teal: '#12b886',
  green: '#40c057',
  lime: '#82c91e',
  yellow: '#fab005',
  orange: '#fd7e14',
  dark: '#2e2e2e',
};

/** Deriva l'hex base "primary" (v6) da una selezione v5 storica (nome nativo o custom[6]). */
function derivePrimaryBaseFromV5(
  primaryColor: ThemePrimarySelection,
  customPrimary: string[],
): string {
  return primaryColor === 'custom' ? customPrimary[6] : MANTINE_NATIVE_COLOR_SHADE6[primaryColor];
}

/** Converte una config v5 storica (già completa: default+override applicati) in una config v6 (storica anch'essa dal punto di vista v7, upgradata a v7 da `upgradeV6ToV7`). */
function upgradeV5ToV6(legacy: LegacyThemeConfigV5): LegacyThemeConfigV6 {
  const { primaryColor, customPrimary, ...rest } = legacy;
  const defaults = structuredClone(DEFAULT_THEME_CONFIG);
  return {
    ...rest,
    version: 6,
    colors: { ...defaults.colors, primary: derivePrimaryBaseFromV5(primaryColor, customPrimary) },
  };
}

/**
 * Converte una config v6 storica (già completa: default+override applicati)
 * in `ThemeConfigDto` v7, aggiungendo le unità dei campi dimensionali
 * (sempre `'px'`: l'app resta pixel-identical, stesso principio di ogni
 * bump precedente).
 */
function upgradeV6ToV7(legacy: LegacyThemeConfigV6): ThemeConfigDto {
  const fontSizeUnit: ThemeUnit = 'px';
  const shadowUnit: ThemeLengthUnit = 'px';
  return {
    ...legacy,
    version: 7,
    typography: {
      ...legacy.typography,
      fontSizeUnit,
      headings: { ...legacy.typography.headings, fontSizeUnit },
    },
    spacingUnit: fontSizeUnit,
    radiusScaleUnit: fontSizeUnit,
    shadowUnit,
    navbarWidthUnit: fontSizeUnit,
  };
}

/** Default di fabbrica nella forma v5 storica, usato solo come base delle migrazioni v1–v4 → v6. */
const LEGACY_DEFAULT_V5: LegacyThemeConfigV5 = (() => {
  const rest = structuredClone(DEFAULT_THEME_CONFIG) as unknown as Record<string, unknown>;
  delete rest.colors;
  return {
    ...rest,
    version: 5,
    primaryColor: 'blue',
    customPrimary: [
      '#e7f5ff',
      '#d0ebff',
      '#a5d8ff',
      '#74c0fc',
      '#4dabf7',
      '#339af0',
      '#228be6',
      '#1c7ed6',
      '#1971c2',
      '#1864ab',
    ],
    // Cast sicuro: `rest` è DEFAULT_THEME_CONFIG clonato senza `colors`, esattamente la forma di LegacyThemeConfigV5.
  } as unknown as LegacyThemeConfigV5;
})();

/**
 * Service dei settaggi globali di installazione (`app_settings`, key/value
 * jsonb). Per ora gestisce il solo tema del Global Theme Customizer (ADR-4);
 * futuri settaggi riusano tabella e pattern senza nuovi ADR.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  /** Inietta l'accesso al DB e l'audit log per i salvataggi del tema. */
  constructor(
    private readonly db: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Normalizza il jsonb salvato al contratto v7: le righe v7 passano
   * invariate; le v6 storiche adottano `'px'` come unità di ogni campo
   * dimensionale (`upgradeV6ToV7`); le v5 vengono prima convertite a v6
   * derivando `colors.primary` da `primaryColor`/`customPrimary` (gli altri 8
   * colori semantici adottano i default) e poi upgradate a v7 allo stesso
   * modo; le v4 storiche vengono prima ricostruite nella forma v5 aggiungendo
   * i default di navbarEdgeStyle/navbarEdgeShadowIntensity; le v3 storiche
   * aggiungendo anche i default di navbarWidth/navbarDefaultCollapsed; le v2
   * storiche preservando ogni campo già presente e adottando i default v5
   * (colori titolo inclusi) solo per light/dark; le v1 storiche preservando
   * primario/radius/token e adottando i default v5 per tutto il resto — poi
   * tutte fatte passare per la stessa catena v5→v6→v7. Versioni non note
   * (config corrotte o di un client futuro) tornano ai default di fabbrica.
   * @param value Contenuto jsonb della riga `theme` (scritto solo da updateTheme dopo validazione DTO).
   */
  private normalizeStoredTheme(value: unknown): ThemeConfigDto {
    const record = value as { version?: number } | null;
    if (record?.version === 7) {
      return value as ThemeConfigDto;
    }
    if (record?.version === 6) {
      this.logger.log('Tema v6 trovato in app_settings: migrato al contratto v7 in lettura.');
      return upgradeV6ToV7(value as LegacyThemeConfigV6);
    }
    if (record?.version === 5) {
      this.logger.log('Tema v5 trovato in app_settings: migrato al contratto v7 in lettura.');
      return upgradeV6ToV7(upgradeV5ToV6(value as LegacyThemeConfigV5));
    }
    if (record?.version === 4) {
      this.logger.log('Tema v4 trovato in app_settings: migrato al contratto v7 in lettura.');
      const legacy = value as LegacyThemeConfigV4;
      const defaults = structuredClone(LEGACY_DEFAULT_V5);
      return upgradeV6ToV7(
        upgradeV5ToV6({
          ...defaults,
          ...structuredClone(legacy),
          version: 5,
        }),
      );
    }
    if (record?.version === 3) {
      this.logger.log('Tema v3 trovato in app_settings: migrato al contratto v7 in lettura.');
      const legacy = value as LegacyThemeConfigV3;
      const defaults = structuredClone(LEGACY_DEFAULT_V5);
      return upgradeV6ToV7(
        upgradeV5ToV6({
          ...defaults,
          ...structuredClone(legacy),
          version: 5,
        }),
      );
    }
    if (record?.version === 2) {
      this.logger.log('Tema v2 trovato in app_settings: migrato al contratto v7 in lettura.');
      const legacy = value as LegacyThemeConfigV2;
      const defaults = structuredClone(LEGACY_DEFAULT_V5);
      return upgradeV6ToV7(
        upgradeV5ToV6({
          ...defaults,
          ...structuredClone(legacy),
          version: 5,
          light: { ...defaults.light, ...legacy.light },
          dark: { ...defaults.dark, ...legacy.dark },
        }),
      );
    }
    if (record?.version === 1) {
      this.logger.log('Tema v1 trovato in app_settings: migrato al contratto v7 in lettura.');
      const legacy = value as LegacyThemeConfigV1;
      const defaults = structuredClone(LEGACY_DEFAULT_V5);
      return upgradeV6ToV7(
        upgradeV5ToV6({
          ...defaults,
          primaryColor: legacy.primaryColor,
          radius: legacy.radius,
          light: { ...defaults.light, ...legacy.light },
          dark: { ...defaults.dark, ...legacy.dark },
        }),
      );
    }
    this.logger.warn('Tema con versione non nota in app_settings: uso i default di fabbrica.');
    return DEFAULT_THEME_CONFIG;
  }

  /**
   * Restituisce il tema globale corrente: la riga `key='theme'` se presente e
   * attiva (migrata al contratto v6 se necessario), altrimenti i default di
   * fabbrica (installazione mai personalizzata).
   */
  async getTheme(): Promise<ThemeConfigDto> {
    const row = await this.db.db.query.appSettingEntity.findFirst({
      where: and(eq(appSettingEntity.key, THEME_SETTING_KEY), eq(appSettingEntity.isActive, true)),
    });
    if (!row) {
      return DEFAULT_THEME_CONFIG;
    }
    return this.normalizeStoredTheme(row.value);
  }

  /**
   * Salva (upsert sulla chiave univoca) il tema globale dell'installazione e
   * registra l'operazione su audit log. SuperAdmin only (guard sul controller).
   * @param dto Configurazione tema già validata dal ValidationPipe.
   * @param authInfo Identità del chiamante (autore formale + eventuale impersonificazione).
   * @param ip Indirizzo IP del chiamante per l'audit log.
   */
  async updateTheme(dto: ThemeConfigDto, authInfo: AuthInfo, ip?: string): Promise<ThemeConfigDto> {
    await this.db.db
      .insert(appSettingEntity)
      .values({
        guid: Utils.randomString(16),
        key: THEME_SETTING_KEY,
        value: dto,
        createdBy: authInfo.userId,
        updatedBy: authInfo.userId,
      })
      .onConflictDoUpdate({
        target: appSettingEntity.key,
        set: {
          value: dto,
          isActive: true,
          updatedAt: new Date(),
          updatedBy: authInfo.userId,
        },
      });

    this.logger.log(`Tema globale aggiornato (userId=${authInfo.userId}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'settings.theme.update',
      'app_settings',
      THEME_SETTING_KEY,
      JSON.stringify(dto),
      authInfo.impersonatedBy,
      ip,
    );
    return dto;
  }

  /**
   * Registro Locale attivi corrente: la riga `key='multilingual.locales'` se
   * presente e attiva, altrimenti il bootstrap da `AppConstants.defaultLocale`
   * (installazione mai personalizzata, RFC-F05 § 1).
   */
  async getMultilingualConfig(): Promise<MultilingualConfigDto> {
    const row = await this.db.db.query.appSettingEntity.findFirst({
      where: and(eq(appSettingEntity.key, MULTILINGUAL_SETTING_KEY), eq(appSettingEntity.isActive, true)),
    });
    if (!row) {
      return DEFAULT_MULTILINGUAL_CONFIG;
    }
    return row.value as MultilingualConfigDto;
  }

  /**
   * Salva (upsert sulla chiave univoca) il registro Locale attivi e registra
   * l'operazione su audit log. Admin+ only (guard sul controller, RFC-F05 §
   * 1/M6). `default` deve comparire in `active`: violazione cross-field non
   * esprimibile da class-validator sul DTO, verificata qui.
   */
  async updateMultilingualConfig(
    dto: MultilingualConfigDto,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<MultilingualConfigDto> {
    if (!dto.active.includes(dto.default)) {
      throw new BadRequestException('Il Locale di default deve comparire fra i Locale attivi.');
    }

    await this.db.db
      .insert(appSettingEntity)
      .values({
        guid: Utils.randomString(16),
        key: MULTILINGUAL_SETTING_KEY,
        value: dto,
        createdBy: authInfo.userId,
        updatedBy: authInfo.userId,
      })
      .onConflictDoUpdate({
        target: appSettingEntity.key,
        set: {
          value: dto,
          isActive: true,
          updatedAt: new Date(),
          updatedBy: authInfo.userId,
        },
      });

    this.logger.log(`Registro Locale aggiornato (userId=${authInfo.userId}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'settings.multilingual.update',
      'app_settings',
      MULTILINGUAL_SETTING_KEY,
      JSON.stringify(dto),
      authInfo.impersonatedBy,
      ip,
    );
    return dto;
  }

  /**
   * Global Design Tokens correnti: la riga `key='global_tokens'` se presente
   * e attiva, altrimenti i default di fabbrica (installazione mai
   * personalizzata). Risorsa separata dal tema Mantine di ADR-4.
   */
  async getGlobalTokens(): Promise<GlobalTokensDto> {
    const row = await this.db.db.query.appSettingEntity.findFirst({
      where: and(
        eq(appSettingEntity.key, GLOBAL_TOKENS_SETTING_KEY),
        eq(appSettingEntity.isActive, true),
      ),
    });
    if (!row) {
      return DEFAULT_GLOBAL_TOKENS;
    }
    return row.value as GlobalTokensDto;
  }

  /**
   * Salva (upsert sulla chiave univoca) i Global Design Tokens e registra
   * l'operazione su audit log. Admin+ only (guard sul controller).
   * @param dto Configurazione token già validata dal ValidationPipe.
   * @param authInfo Identità del chiamante (autore formale + eventuale impersonificazione).
   * @param ip Indirizzo IP del chiamante per l'audit log.
   */
  async updateGlobalTokens(
    dto: GlobalTokensDto,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<GlobalTokensDto> {
    await this.db.db
      .insert(appSettingEntity)
      .values({
        guid: Utils.randomString(16),
        key: GLOBAL_TOKENS_SETTING_KEY,
        value: dto,
        createdBy: authInfo.userId,
        updatedBy: authInfo.userId,
      })
      .onConflictDoUpdate({
        target: appSettingEntity.key,
        set: {
          value: dto,
          isActive: true,
          updatedAt: new Date(),
          updatedBy: authInfo.userId,
        },
      });

    this.logger.log(`Global Design Tokens aggiornati (userId=${authInfo.userId}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'settings.globalTokens.update',
      'app_settings',
      GLOBAL_TOKENS_SETTING_KEY,
      JSON.stringify(dto),
      authInfo.impersonatedBy,
      ip,
    );
    return dto;
  }
}
