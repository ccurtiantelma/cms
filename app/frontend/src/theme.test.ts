/**
 * Test del modello ThemeConfig v7 (ADR-4): type guard `isThemeConfig`,
 * migrazione `migrateThemeConfig` (v1 → v7, v2 → v7, v3 → v7, v4 → v7, v5 → v7,
 * v6 → v7) e generatore di sfumature `generatePrimaryShades`. Il guard valida
 * cache localStorage e risposta server prima che i valori raggiungano
 * variabili CSS e theme object.
 */
import { DEFAULT_THEME } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_CONFIG,
  generatePrimaryShades,
  isThemeConfig,
  migrateThemeConfig,
  ThemeConfig,
} from './theme';

/** Clona i default di fabbrica come base mutabile per i casi di test. */
function cloneDefaults(): ThemeConfig {
  return JSON.parse(JSON.stringify(DEFAULT_THEME_CONFIG)) as ThemeConfig;
}

/** Estrae gli 11 token del contratto storico (v1/v2) da un blocco scheme v3, scartando i colori titolo. */
function toLegacyTokens(tokens: ThemeConfig['light']): Record<string, string> {
  const {
    pageBg,
    cardBg,
    cardBorder,
    textPrimary,
    textSecondary,
    navbarBg,
    navbarText,
    navbarHoverBg,
    navbarActiveBg,
    navbarActiveText,
    navbarBorder,
  } = tokens;
  return {
    pageBg,
    cardBg,
    cardBorder,
    textPrimary,
    textSecondary,
    navbarBg,
    navbarText,
    navbarHoverBg,
    navbarActiveBg,
    navbarActiveText,
    navbarBorder,
  };
}

/**
 * Ricostruisce la forma v6 storica (senza le unità dei campi dimensionali,
 * introdotte in v7 e sempre implicitamente px prima) a partire dai default v7
 * — stessa base usata dalla migrazione v6 → v7 in `theme.ts`.
 */
function legacyV6Defaults(): Record<string, unknown> {
  const defaults = cloneDefaults() as unknown as Record<string, unknown>;
  delete defaults.spacingUnit;
  delete defaults.radiusScaleUnit;
  delete defaults.shadowUnit;
  delete defaults.navbarWidthUnit;
  const typography = defaults.typography as Record<string, unknown>;
  delete typography.fontSizeUnit;
  delete (typography.headings as Record<string, unknown>).fontSizeUnit;
  return { ...defaults, version: 6 };
}

/**
 * Ricostruisce la forma v5 storica (selezione `primaryColor`/`customPrimary`
 * invece del blocco `colors` a 9 voci, e senza le unità dei campi
 * dimensionali) a partire dai default v7 — stessa base usata dalle
 * migrazioni v1–v4 → v7 in `theme.ts`.
 */
function legacyV5Defaults(): Record<string, unknown> {
  const defaults = legacyV6Defaults();
  delete defaults.colors;
  return {
    ...defaults,
    version: 5,
    primaryColor: 'blue',
    customPrimary: [...DEFAULT_THEME.colors.blue],
  };
}

/** Costruisce una config v1 storica valida (forma pre-estensione, 11 token per scheme). */
function legacyV1Config(): Record<string, unknown> {
  const defaults = cloneDefaults();
  return {
    version: 1,
    primaryColor: 'teal',
    radius: 'xl',
    light: { ...toLegacyTokens(defaults.light), pageBg: '#112233' },
    dark: { ...toLegacyTokens(defaults.dark), navbarActiveBg: '#445566' },
  };
}

/** Costruisce una config v2 storica valida (identica alla v3 tranne i colori titolo). */
function legacyV2Config(): Record<string, unknown> {
  const defaults = legacyV5Defaults();
  return {
    ...defaults,
    version: 2,
    primaryColor: 'grape',
    light: {
      ...toLegacyTokens(defaults.light as ThemeConfig['light']),
      textPrimary: '#111111',
    },
    dark: {
      ...toLegacyTokens(defaults.dark as ThemeConfig['dark']),
      textPrimary: '#eeeeee',
    },
  };
}

describe('isThemeConfig (contratto v7)', () => {
  it('accetta i default di fabbrica', () => {
    expect(isThemeConfig(DEFAULT_THEME_CONFIG)).toBe(true);
  });

  it('accetta una config personalizzata valida su tutti i blocchi, colori semantici e titolo inclusi', () => {
    const config = cloneDefaults();
    config.colors.primary = '#8f00b3';
    config.colors.danger = '#111111';
    config.primaryShade = { light: 6, dark: 7 };
    config.radius = 'xl';
    config.focusRing = 'always';
    config.cursorType = 'pointer';
    config.autoContrast = true;
    config.luminanceThreshold = 0.4;
    config.scale = 1.1;
    config.typography.fontFamily = 'serif';
    config.typography.headings.fontWeight = '500';
    config.typography.headings.sizes.h1 = { fontSize: 40, lineHeight: 1.2 };
    config.spacing.md = 24;
    config.shadows.md = { y: 6, blur: 18, spread: -3, opacity: 0.2 };
    config.components.button.variant = 'light';
    config.components.table.striped = true;
    config.light.pageBg = '#123ABC';
    config.light.headingH1 = '#ff0000';
    config.dark.headingH2 = '#00ff00';
    expect(isThemeConfig(config)).toBe(true);
  });

  it('accetta unità diverse da px sui campi dimensionali, con valori nel range della relativa unità', () => {
    const config = cloneDefaults();
    config.typography.fontSizeUnit = 'rem';
    config.typography.fontSizes = { xs: 0.75, sm: 0.85, md: 1, lg: 1.2, xl: 1.4 };
    config.typography.headings.fontSizeUnit = '%';
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      config.typography.headings.sizes[level] = { fontSize: 150, lineHeight: 1.3 };
    }
    config.spacingUnit = 'em';
    config.spacing = { xs: 0.5, sm: 0.75, md: 1, lg: 1.5, xl: 2 };
    config.radiusScaleUnit = '%';
    config.radiusScale = { xs: 5, sm: 10, md: 20, lg: 30, xl: 40 };
    config.shadowUnit = 'rem';
    for (const size of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
      config.shadows[size] = { y: 0.25, blur: 0.75, spread: -0.1, opacity: 0.1 };
    }
    config.navbarWidthUnit = '%';
    config.navbarWidth = 20;
    expect(isThemeConfig(config)).toBe(true);
  });

  it("rifiuta un valore dimensionale valido in px ma fuori range per l'unità impostata", () => {
    const config = cloneDefaults();
    // 80 è il massimo consentito per spacing in px, ma sballato per rem (max 5).
    config.spacingUnit = 'rem';
    config.spacing.xl = 80;
    expect(isThemeConfig(config)).toBe(false);
  });

  it("rifiuta un'unità fuori whitelist su un campo dimensionale", () => {
    const config = cloneDefaults();
    (config as unknown as Record<string, unknown>).spacingUnit = 'vh';
    expect(isThemeConfig(config)).toBe(false);
  });

  it("rifiuta un'unità di fontSizeUnit/headings.fontSizeUnit mancante su una config v7 (nessuna tolleranza sul campo assente per il contratto corrente)", () => {
    const missingFontSizeUnit = cloneDefaults();
    delete (missingFontSizeUnit.typography as Partial<ThemeConfig['typography']>).fontSizeUnit;
    expect(isThemeConfig(missingFontSizeUnit)).toBe(false);

    const missingHeadingsUnit = cloneDefaults();
    delete (
      missingHeadingsUnit.typography.headings as Partial<ThemeConfig['typography']['headings']>
    ).fontSizeUnit;
    expect(isThemeConfig(missingHeadingsUnit)).toBe(false);
  });

  it('rifiuta `%` come unità delle ombre (box-shadow non ammette percentuali)', () => {
    const config = cloneDefaults();
    (config as unknown as Record<string, unknown>).shadowUnit = '%';
    expect(isThemeConfig(config)).toBe(false);
  });

  it('rifiuta null, primitivi e oggetti vuoti', () => {
    expect(isThemeConfig(null)).toBe(false);
    expect(isThemeConfig('theme')).toBe(false);
    expect(isThemeConfig(42)).toBe(false);
    expect(isThemeConfig({})).toBe(false);
  });

  it('rifiuta versioni del contratto non note (v1/v2/v3/v4/v5/v6 passano solo dalla migrazione)', () => {
    expect(isThemeConfig({ ...cloneDefaults(), version: 1 })).toBe(false);
    expect(isThemeConfig({ ...cloneDefaults(), version: 2 })).toBe(false);
    expect(isThemeConfig({ ...cloneDefaults(), version: 3 })).toBe(false);
    expect(isThemeConfig({ ...cloneDefaults(), version: 4 })).toBe(false);
    expect(isThemeConfig({ ...cloneDefaults(), version: 5 })).toBe(false);
    expect(isThemeConfig({ ...cloneDefaults(), version: 6 })).toBe(false);
    expect(isThemeConfig({ ...cloneDefaults(), version: '7' })).toBe(false);
  });

  it('rifiuta navbarWidth fuori range o navbarDefaultCollapsed non boolean', () => {
    const tooNarrow = cloneDefaults();
    tooNarrow.navbarWidth = 100;
    expect(isThemeConfig(tooNarrow)).toBe(false);

    const notBoolean = cloneDefaults();
    (notBoolean as unknown as Record<string, unknown>).navbarDefaultCollapsed = 'yes';
    expect(isThemeConfig(notBoolean)).toBe(false);
  });

  it('rifiuta navbarEdgeStyle fuori whitelist o navbarEdgeShadowIntensity fuori range 0–1', () => {
    const badStyle = cloneDefaults();
    (badStyle as unknown as Record<string, unknown>).navbarEdgeStyle = 'glow';
    expect(isThemeConfig(badStyle)).toBe(false);

    const badIntensity = cloneDefaults();
    badIntensity.navbarEdgeShadowIntensity = 1.5;
    expect(isThemeConfig(badIntensity)).toBe(false);
  });

  it('rifiuta un colore semantico con formato hex non valido', () => {
    const config = cloneDefaults();
    (config.colors as unknown as Record<string, unknown>).primary = 'magenta';
    expect(isThemeConfig(config)).toBe(false);
  });

  it('rifiuta un blocco colors con una voce mancante', () => {
    const config = cloneDefaults();
    delete (config.colors as Partial<ThemeConfig['colors']>).danger;
    expect(isThemeConfig(config)).toBe(false);
  });

  it('rifiuta shade primarie fuori range 0–9', () => {
    const config = cloneDefaults();
    config.primaryShade = { light: 10, dark: 5 };
    expect(isThemeConfig(config)).toBe(false);
  });

  it('rifiuta un radius fuori dai valori nativi Mantine', () => {
    expect(isThemeConfig({ ...cloneDefaults(), radius: 'xxl' })).toBe(false);
  });

  it('rifiuta font fuori dalla whitelist (nessuno stack libero raggiunge il tema)', () => {
    const config = cloneDefaults();
    (config.typography as unknown as Record<string, unknown>).fontFamily = 'Comic Sans MS, cursive';
    expect(isThemeConfig(config)).toBe(false);
  });

  it('rifiuta numeri fuori range (scala, dimensioni, ombre)', () => {
    const scale = cloneDefaults();
    scale.scale = 3;
    expect(isThemeConfig(scale)).toBe(false);

    const fontSize = cloneDefaults();
    fontSize.typography.fontSizes.md = 500;
    expect(isThemeConfig(fontSize)).toBe(false);

    const shadow = cloneDefaults();
    shadow.shadows.md.opacity = 2;
    expect(isThemeConfig(shadow)).toBe(false);
  });

  it('rifiuta variant componenti fuori whitelist', () => {
    const config = cloneDefaults();
    (config.components.button as Record<string, unknown>).variant = 'evil-variant';
    expect(isThemeConfig(config)).toBe(false);
  });

  it('rifiuta token non in formato hex #rrggbb (potenziale CSS injection)', () => {
    const config = cloneDefaults();
    config.light.pageBg = 'url(javascript:alert(1))';
    expect(isThemeConfig(config)).toBe(false);

    const shortHex = cloneDefaults();
    shortHex.dark.navbarBg = '#fff';
    expect(isThemeConfig(shortHex)).toBe(false);

    const badHeading = cloneDefaults();
    badHeading.light.headingH3 = 'red';
    expect(isThemeConfig(badHeading)).toBe(false);
  });

  it('rifiuta blocchi scheme incompleti o mancanti (inclusi i colori titolo)', () => {
    const config = cloneDefaults();
    // Simula una cache corrotta senza un token obbligatorio.
    delete (config.light as Partial<ThemeConfig['light']>).navbarBorder;
    expect(isThemeConfig(config)).toBe(false);
    expect(isThemeConfig({ ...cloneDefaults(), dark: undefined })).toBe(false);

    const missingHeading = cloneDefaults();
    delete (missingHeading.dark as Partial<ThemeConfig['dark']>).headingH6;
    expect(isThemeConfig(missingHeading)).toBe(false);
  });
});

describe('migrateThemeConfig', () => {
  it('restituisce invariata una config v7 valida', () => {
    const config = cloneDefaults();
    config.colors.accent = '#446688';
    expect(migrateThemeConfig(config)).toEqual(config);
  });

  it('migra una v6 storica aggiungendo le unità dei campi dimensionali (sempre px)', () => {
    const legacy = legacyV6Defaults();
    (legacy as Record<string, unknown>).radius = 'lg';

    const migrated = migrateThemeConfig(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(7);
    expect(migrated?.radius).toBe('lg');
    expect(migrated?.typography.fontSizeUnit).toBe('px');
    expect(migrated?.typography.headings.fontSizeUnit).toBe('px');
    expect(migrated?.spacingUnit).toBe('px');
    expect(migrated?.radiusScaleUnit).toBe('px');
    expect(migrated?.shadowUnit).toBe('px');
    expect(migrated?.navbarWidthUnit).toBe('px');
    expect(isThemeConfig(migrated)).toBe(true);
  });

  it('migra una v5 storica derivando colors.primary da primaryColor/customPrimary e adottando px per le unità', () => {
    const legacy = { ...legacyV5Defaults(), primaryColor: 'teal' };

    const migrated = migrateThemeConfig(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(7);
    expect(migrated?.colors.primary).toBe(DEFAULT_THEME.colors.teal[6]);
    expect(migrated?.colors.secondary).toBe(DEFAULT_THEME_CONFIG.colors.secondary);
    expect(migrated?.spacingUnit).toBe('px');
    expect(migrated?.typography.fontSizeUnit).toBe('px');
    expect(isThemeConfig(migrated)).toBe(true);
  });

  it('migra una v5 storica con primaryColor=custom usando customPrimary[6] come base', () => {
    const customShades = generatePrimaryShades('#8f00b3');
    const legacy = {
      ...legacyV5Defaults(),
      primaryColor: 'custom',
      customPrimary: customShades,
    };

    const migrated = migrateThemeConfig(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.colors.primary).toBe(customShades[6]);
    expect(isThemeConfig(migrated)).toBe(true);
  });

  it('migra una v4 storica aggiungendo navbarEdgeStyle/navbarEdgeShadowIntensity e le unità di default', () => {
    const legacy: Record<string, unknown> = { ...legacyV5Defaults(), version: 4 };
    delete legacy.navbarEdgeStyle;
    delete legacy.navbarEdgeShadowIntensity;
    legacy.primaryColor = 'pink';

    const migrated = migrateThemeConfig(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(7);
    expect(migrated?.colors.primary).toBe(DEFAULT_THEME.colors.pink[6]);
    expect(migrated?.navbarEdgeStyle).toBe(DEFAULT_THEME_CONFIG.navbarEdgeStyle);
    expect(migrated?.navbarEdgeShadowIntensity).toBe(
      DEFAULT_THEME_CONFIG.navbarEdgeShadowIntensity,
    );
    expect(migrated?.navbarWidthUnit).toBe('px');
    expect(isThemeConfig(migrated)).toBe(true);
  });

  it('migra una v3 storica aggiungendo navbarWidth/navbarDefaultCollapsed/navbarEdgeStyle/navbarEdgeShadowIntensity e le unità di default', () => {
    const legacy: Record<string, unknown> = { ...legacyV5Defaults(), version: 3 };
    delete legacy.navbarWidth;
    delete legacy.navbarDefaultCollapsed;
    delete legacy.navbarEdgeStyle;
    delete legacy.navbarEdgeShadowIntensity;
    legacy.primaryColor = 'orange';

    const migrated = migrateThemeConfig(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(7);
    expect(migrated?.colors.primary).toBe(DEFAULT_THEME.colors.orange[6]);
    expect(migrated?.navbarWidth).toBe(DEFAULT_THEME_CONFIG.navbarWidth);
    expect(migrated?.navbarDefaultCollapsed).toBe(DEFAULT_THEME_CONFIG.navbarDefaultCollapsed);
    expect(migrated?.navbarEdgeStyle).toBe(DEFAULT_THEME_CONFIG.navbarEdgeStyle);
    expect(migrated?.navbarEdgeShadowIntensity).toBe(
      DEFAULT_THEME_CONFIG.navbarEdgeShadowIntensity,
    );
    expect(migrated?.radiusScaleUnit).toBe('px');
    expect(isThemeConfig(migrated)).toBe(true);
  });

  it('migra una v1 storica preservando radius e token, deriva colors.primary dal nome nativo; il resto = default v7', () => {
    const legacy = legacyV1Config();
    const migrated = migrateThemeConfig(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(7);
    expect(migrated?.colors.primary).toBe(DEFAULT_THEME.colors.teal[6]);
    expect(migrated?.radius).toBe('xl');
    expect(migrated?.light.pageBg).toBe('#112233');
    expect(migrated?.dark.navbarActiveBg).toBe('#445566');
    // I campi nuovi adottano i default v7, colori titolo, navbar, semantici e unità inclusi.
    expect(migrated?.typography).toEqual(DEFAULT_THEME_CONFIG.typography);
    expect(migrated?.components).toEqual(DEFAULT_THEME_CONFIG.components);
    expect(migrated?.colors.secondary).toBe(DEFAULT_THEME_CONFIG.colors.secondary);
    expect(migrated?.light.headingH1).toBe(DEFAULT_THEME_CONFIG.light.headingH1);
    expect(migrated?.dark.headingH6).toBe(DEFAULT_THEME_CONFIG.dark.headingH6);
    expect(migrated?.navbarWidth).toBe(DEFAULT_THEME_CONFIG.navbarWidth);
    expect(migrated?.navbarDefaultCollapsed).toBe(DEFAULT_THEME_CONFIG.navbarDefaultCollapsed);
    expect(migrated?.navbarEdgeStyle).toBe(DEFAULT_THEME_CONFIG.navbarEdgeStyle);
    expect(migrated?.navbarEdgeShadowIntensity).toBe(
      DEFAULT_THEME_CONFIG.navbarEdgeShadowIntensity,
    );
    expect(migrated?.spacingUnit).toBe('px');
    expect(migrated?.radiusScaleUnit).toBe('px');
    expect(migrated?.shadowUnit).toBe('px');
    expect(migrated?.navbarWidthUnit).toBe('px');
    expect(isThemeConfig(migrated)).toBe(true);
  });

  it('migra una v2 storica preservando ogni campo e aggiungendo i colori titolo, navbar e unità di default', () => {
    const legacy = legacyV2Config();
    const migrated = migrateThemeConfig(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(7);
    expect(migrated?.colors.primary).toBe(DEFAULT_THEME.colors.grape[6]);
    expect(migrated?.light.textPrimary).toBe('#111111');
    expect(migrated?.dark.textPrimary).toBe('#eeeeee');
    // I colori titolo non esistevano in v2: adottano il default v7.
    expect(migrated?.light.headingH1).toBe(DEFAULT_THEME_CONFIG.light.headingH1);
    expect(migrated?.dark.headingH4).toBe(DEFAULT_THEME_CONFIG.dark.headingH4);
    expect(migrated?.navbarWidth).toBe(DEFAULT_THEME_CONFIG.navbarWidth);
    expect(migrated?.navbarDefaultCollapsed).toBe(DEFAULT_THEME_CONFIG.navbarDefaultCollapsed);
    expect(migrated?.navbarEdgeStyle).toBe(DEFAULT_THEME_CONFIG.navbarEdgeStyle);
    expect(migrated?.navbarEdgeShadowIntensity).toBe(
      DEFAULT_THEME_CONFIG.navbarEdgeShadowIntensity,
    );
    expect(migrated?.typography.fontSizeUnit).toBe('px');
    expect(isThemeConfig(migrated)).toBe(true);
  });

  it('scarta valori corrotti, versioni non note e v1/v2 malformate', () => {
    expect(migrateThemeConfig(null)).toBeNull();
    expect(migrateThemeConfig({ version: 8 })).toBeNull();

    const brokenV1 = legacyV1Config();
    (brokenV1.light as Record<string, unknown>).pageBg = 'red';
    expect(migrateThemeConfig(brokenV1)).toBeNull();

    const brokenV2 = legacyV2Config();
    (brokenV2.light as Record<string, unknown>).textPrimary = 'not-a-hex';
    expect(migrateThemeConfig(brokenV2)).toBeNull();
  });
});

describe('generatePrimaryShades', () => {
  it('genera 10 sfumature hex valide dal più chiaro al più scuro', () => {
    const shades = generatePrimaryShades('#1971c2');
    expect(shades).toHaveLength(10);
    for (const shade of shades) {
      expect(shade).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    // Ordine di luminosità decrescente: primo canale rosso più alto dell'ultimo.
    expect(parseInt(shades[0].slice(1, 3), 16)).toBeGreaterThan(
      parseInt(shades[9].slice(1, 3), 16),
    );
  });

  it('ripiega sulla palette di default con un colore base non valido', () => {
    const shades = generatePrimaryShades('non-un-colore');
    expect(shades).toEqual([...DEFAULT_THEME.colors.blue]);
  });
});
