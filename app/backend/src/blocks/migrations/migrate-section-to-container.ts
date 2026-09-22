import { MigratableBlockNode } from '../migration/block-migration.types';
import {
  collectResponsiveBreakpointKeys,
  mapGapTokenToLayoutGap,
  migrateFourSidedEnumTokenSpacing,
  migrateHideFlagsToHideOn,
  responsiveEnvelopeBranch,
  responsiveEnvelopeDefault,
} from './shared';

const LAYOUT_JUSTIFY_VALUES = [
  'flex-start',
  'flex-end',
  'center',
  'space-between',
  'space-around',
  'space-evenly',
];
/** Traduzione vocabolario flex (`section.alignItems` v1) → vocabolario grid (`layout.alignItems` v2, ADR-82 § "Decisione" punto 1). */
const ALIGN_FLEX_TO_GRID: Record<string, string> = {
  stretch: 'stretch',
  'flex-start': 'start',
  center: 'center',
  'flex-end': 'end',
};
/** Due `GridTrackValue` espliciti in `%` per le quattro proporzioni nominate (ADR-82 § "Decisione" punto 4). */
const RATIO_TOKEN_TO_TRACKS: Record<string, Array<{ value: number; unit: '%' }>> = {
  '33-66': [
    { value: 33, unit: '%' },
    { value: 66, unit: '%' },
  ],
  '66-33': [
    { value: 66, unit: '%' },
    { value: 33, unit: '%' },
  ],
  '30-70': [
    { value: 30, unit: '%' },
    { value: 70, unit: '%' },
  ],
  '70-30': [
    { value: 70, unit: '%' },
    { value: 30, unit: '%' },
  ],
};
const UNIFORM_SPACING_TOKEN_TO_PX: Record<string, number> = { none: 0, sm: 8, md: 16, lg: 32 };
const LAYER_TOKEN_TO_ZINDEX: Record<string, number> = {
  base: 0,
  raised: 10,
  overlay: 100,
  top: 1000,
};
const MAX_WIDTH_TOKEN_TO_PX: Record<string, number> = { sm: 640, md: 1024, lg: 1280, xl: 1536 };
const ADR_50_BACKGROUND_KEYS = [
  'styleBackgroundColor',
  'styleBackgroundType',
  'styleBackgroundPosition',
  'styleBackgroundSize',
  'styleGradientStart',
  'styleGradientEnd',
  'styleBackgroundImageRef',
  'styleOverlayColor',
  'styleOverlayOpacity',
] as const;

/** `columns`/`columnRatio` → `{ display, gridTemplateColumns? }` (ADR-82 § "Decisione" punto 4, riga `columns`/`columnRatio`). */
function mapColumnsToGrid(
  columnsToken: unknown,
  columnRatioToken: unknown,
): { display: 'flex' | 'grid'; gridTemplateColumns?: unknown } {
  const columns =
    typeof columnsToken === 'string' && ['1', '2', '3', '4'].includes(columnsToken)
      ? columnsToken
      : '1';
  if (columns === '1') {
    return { display: 'flex' };
  }
  const count = Number(columns);
  const ratio = typeof columnRatioToken === 'string' ? columnRatioToken : 'equal';
  if (columns === '2' && ratio in RATIO_TOKEN_TO_TRACKS) {
    return { display: 'grid', gridTemplateColumns: RATIO_TOKEN_TO_TRACKS[ratio] };
  }
  return { display: 'grid', gridTemplateColumns: { preset: 'repeat', count } };
}

function mapSectionAlignItemsToken(token: unknown): string {
  return typeof token === 'string' && token in ALIGN_FLEX_TO_GRID
    ? ALIGN_FLEX_TO_GRID[token]
    : 'stretch';
}
function mapSectionJustifyToken(token: unknown): string {
  return typeof token === 'string' && LAYOUT_JUSTIFY_VALUES.includes(token) ? token : 'flex-start';
}

/**
 * Migra `columns`/`columnRatio`/`alignItems`/`justifyContent`/`gap` di
 * `section` v1 (ciascuna `responsive: true` per conto proprio, tranne
 * `columnRatio`) in un solo `layout: layout` responsivo sull'**intero
 * oggetto** (ADR-82 § "Decisione" punto 4). Stessa strategia "ramo `default`
 * completo, rami successivi sparsi" di `migrateContainerV1ToV2` per
 * `container` v1 — qui applicata a un insieme diverso di campi sorgente
 * (`alignItems`/`justifyContent` mappano su `layout.alignItems`/`layout.justify`,
 * non su `layout.align`, per la lettera della tabella di ADR-82).
 */
function migrateSectionLayout(props: Record<string, unknown>): Record<string, unknown> {
  const { columns, columnRatio, alignItems, justifyContent, gap } = props;
  const breakpoints = collectResponsiveBreakpointKeys(columns, alignItems, justifyContent, gap);

  function buildBranch(
    columnsAt: unknown,
    alignAt: unknown,
    justifyAt: unknown,
    gapAt: unknown,
    alwaysIncludeGrid: boolean,
  ): Record<string, unknown> {
    const branch: Record<string, unknown> = {};
    if (alwaysIncludeGrid || columnsAt !== undefined) {
      const grid = mapColumnsToGrid(columnsAt, columnRatio);
      branch.display = grid.display;
      if (grid.gridTemplateColumns !== undefined)
        branch.gridTemplateColumns = grid.gridTemplateColumns;
    }
    if (alignAt !== undefined) branch.alignItems = mapSectionAlignItemsToken(alignAt);
    if (justifyAt !== undefined) branch.justify = mapSectionJustifyToken(justifyAt);
    if (gapAt !== undefined) branch.gap = mapGapTokenToLayoutGap(gapAt);
    return branch;
  }

  const envelope: Record<string, unknown> = {
    default: buildBranch(
      responsiveEnvelopeDefault(columns),
      responsiveEnvelopeDefault(alignItems),
      responsiveEnvelopeDefault(justifyContent),
      responsiveEnvelopeDefault(gap),
      true,
    ),
  };
  for (const breakpoint of breakpoints) {
    envelope[breakpoint] = buildBranch(
      responsiveEnvelopeBranch(columns, breakpoint),
      responsiveEnvelopeBranch(alignItems, breakpoint),
      responsiveEnvelopeBranch(justifyContent, breakpoint),
      responsiveEnvelopeBranch(gap, breakpoint),
      false,
    );
  }
  return envelope;
}

/** `stylePadding`/`stylePaddingTop..Left` → `padding: spacing` (ADR-82 § "Decisione" punto 4, riga `stylePadding`). */
function migrateSectionPadding(props: Record<string, unknown>): Record<string, unknown> {
  const hasIndependentSides = [
    'stylePaddingTop',
    'stylePaddingRight',
    'stylePaddingBottom',
    'stylePaddingLeft',
  ].some((key) => props[key] !== undefined);
  if (hasIndependentSides) {
    return migrateFourSidedEnumTokenSpacing(props, {
      top: 'stylePaddingTop',
      right: 'stylePaddingRight',
      bottom: 'stylePaddingBottom',
      left: 'stylePaddingLeft',
    });
  }
  const token = props.stylePadding;
  const px =
    typeof token === 'string' && token in UNIFORM_SPACING_TOKEN_TO_PX
      ? UNIFORM_SPACING_TOKEN_TO_PX[token]
      : 0;
  // `padding` è `responsive: true` su `container` v2 (ADR-29 § 2): avvolto nel
  // ramo `default`, stesso principio di `migrateFourSidedEnumTokenSpacing`.
  return { default: { top: px, right: px, bottom: px, left: px, unit: 'px', linked: true } };
}

/**
 * `styleBackground` (token) + le 9 prop ADR-50 → `background: background`
 * (ADR-82 § "Decisione" punto 4, riga `styleBackground`). Le 9 prop ADR-50
 * hanno priorità quando almeno una è valorizzata; altrimenti il token
 * `styleBackground` (`none/subtle/accent/inverse`) mappa a un colore
 * letterale dalla stessa tabella di ADR-81.
 */
function migrateSectionBackground(props: Record<string, unknown>): Record<string, unknown> {
  const hasAdr50Props = ADR_50_BACKGROUND_KEYS.some((key) => props[key] !== undefined);

  if (!hasAdr50Props) {
    switch (props.styleBackground) {
      case 'subtle':
        return { type: 'color', color: '#f3f4f6' };
      case 'accent':
        return { type: 'color', color: { ref: 'accent' } };
      case 'inverse':
        return { type: 'color', color: '#111827' };
      case 'none':
      default:
        return { type: 'none' };
    }
  }

  const bgType =
    props.styleBackgroundType === 'image' || props.styleBackgroundType === 'gradient'
      ? props.styleBackgroundType
      : 'color';
  const result: Record<string, unknown> = { type: bgType };

  if (bgType === 'color' && typeof props.styleBackgroundColor === 'string') {
    result.color = props.styleBackgroundColor;
  }
  if (bgType === 'gradient') {
    const start =
      typeof props.styleGradientStart === 'string' ? props.styleGradientStart : '#000000';
    const end = typeof props.styleGradientEnd === 'string' ? props.styleGradientEnd : '#ffffff';
    result.gradient = {
      type: 'linear',
      angle: 180,
      stops: [
        { color: start, at: 0 },
        { color: end, at: 100 },
      ],
    };
  }
  if (bgType === 'image' && typeof props.styleBackgroundImageRef === 'string') {
    const size =
      typeof props.styleBackgroundSize === 'string' &&
      ['cover', 'contain', 'auto'].includes(props.styleBackgroundSize)
        ? props.styleBackgroundSize
        : 'cover';
    const position =
      typeof props.styleBackgroundPosition === 'string'
        ? props.styleBackgroundPosition
        : 'center center';
    result.image = {
      mediaRef: props.styleBackgroundImageRef,
      position,
      attachment: 'scroll',
      repeat: 'no-repeat',
      size,
    };
  }
  if (
    typeof props.styleOverlayColor === 'string' ||
    typeof props.styleOverlayOpacity === 'number'
  ) {
    result.overlay = {
      color: typeof props.styleOverlayColor === 'string' ? props.styleOverlayColor : '#000000',
      opacity: typeof props.styleOverlayOpacity === 'number' ? props.styleOverlayOpacity : 0,
    };
  }
  return result;
}

/** `styleLayer` → `position.zIndex` (ADR-82 § "Decisione" punto 4, riga `styleLayer`); `position.type` resta `'default'`. */
function migrateSectionPosition(
  props: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const token = props.styleLayer;
  if (typeof token !== 'string' || !(token in LAYER_TOKEN_TO_ZINDEX)) return undefined;
  return { type: 'default', zIndex: LAYER_TOKEN_TO_ZINDEX[token] };
}

/** `contentWidth`/`maxWidth` → `contentWidth`/`boxedWidth` (ADR-82 § "Decisione" punto 4). */
function migrateSectionContentWidth(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {
    contentWidth: props.contentWidth === 'full-width' ? 'full' : 'boxed',
  };
  const maxWidthToken = props.maxWidth;
  if (typeof maxWidthToken === 'string' && maxWidthToken in MAX_WIDTH_TOKEN_TO_PX) {
    result.boxedWidth = { value: MAX_WIDTH_TOKEN_TO_PX[maxWidthToken], unit: 'px' };
  }
  return result;
}

/**
 * Avvolge un valore `border`/`shadow` v1 (invariato nella forma) nell'inviluppo
 * `stateful` che `container` v2 dichiara per quelle due prop (ADR-82 §
 * "Decisione" punto 4, riga `styleBorder`/`styleShadow`: "valore invariato...
 * il modificatore `stateful` è ora disponibile e non retroattivamente
 * popolato" — nessun ramo `hover` da un valore v1 che non lo prevedeva).
 */
function wrapAsStatefulNormal(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return { normal: value };
}

/**
 * Migrazione di **identità** cross-type `section` → `container` (ADR-82 §
 * "Decisione" punto 3/4): riceve un nodo `{ type: 'section', v: 1 }`
 * completo, ritorna `{ ...node, type: 'container', props: <rimappate> }` —
 * poi il motore condiviso lo lascia proseguire nella normale
 * risoluzione/catena per-tipo di `container` "se necessario" (ADR-82 §
 * "Decisione" punto 3).
 *
 * **Scelta di design su `v` in output** (ambiguità reale risolta, segnalata
 * nel resoconto finale): la tabella di ADR-82 § "Decisione" punto 4 mappa i
 * campi di `section` **direttamente** ai nomi di prop di `container` **v2**
 * (`layout.display`, `padding: spacing`, `background: background`,
 * `position.zIndex`, `contentWidth`/`boxedWidth`, …) — nessuno di questi
 * concetti esiste nello schema sparso di `container` v1 (solo flex,
 * nessun `background`/`position`/grid). Restituire `v: 1` farebbe
 * rieseguire `migrateContainerV1ToV2` su props già in forma v2, che
 * leggerebbe `undefined` per ogni campo v1 atteso (`display`,
 * `stylePadding*`, …) e sovrascriverebbe silenziosamente con i default,
 * perdendo l'intera mappatura appena calcolata — l'esatta perdita di dati
 * silenziosa che ADR-21 § 3.6 vieta. Questa funzione restituisce quindi
 * **`v: 2`** (la versione corrente di `container`) insieme a props già a
 * forma v2: il motore condiviso applica comunque la risoluzione/catena
 * normale (`applyMigrationChain(props, 2, 2, [...])`), che con
 * `fromVersion === currentVersion` esegue zero gradini per costruzione
 * (`migration-chain.core.ts`) — coerente con "prosegue nella normale catena
 * **se necessario**": qui non lo è, perché il risultato è già alla versione
 * corrente.
 *
 * `children` è preservato byte-per-byte (la ricorsione sui figli resta
 * compito del motore per-albero, non di questa funzione). Pura e totale
 * (ADR-21 § 3.6).
 *
 * `styleSpaceBefore`/`styleSpaceAfter` non hanno una colonna nella tabella di
 * ADR-82 § "Decisione" punto 4 (assenti anche dall'elenco prop di `container`
 * v2): scartate in silenzio, scelta di design segnalata nel resoconto finale
 * — stesso trattamento delle 3 prop colore "fallback" non `styleBackgroundColor`
 * (`styleColor`/`backgroundColor`/`color`), mai menzionate da alcuna ADR.
 *
 * @param node Nodo `{ type: 'section', v: 1, ... }`, props non validate.
 * @returns Nodo `{ type: 'container', v: 2, ... }` con le props rimappate,
 *   già alla forma corrente (nessun ulteriore gradino di migrazione necessario).
 */
export function migrateSectionToContainer(node: MigratableBlockNode): MigratableBlockNode {
  const props = node.props ?? {};

  const migratedProps: Record<string, unknown> = {
    // Un nodo `section` v1 migrato deve conservare la propria identità semantica:
    // `container` v2 dichiara `tag: enum` con default `'div'` (ADR-82 § "Decisione"
    // punto 1, campo già approvato, non un'estensione di schema) — la migrazione di
    // identità imposta esplicitamente `tag: 'section'` invece di lasciare cadere sul
    // default, cosa che renderebbe indistinguibile un container-che-era-sezione da un
    // container qualsiasi creato ex novo.
    tag: 'section',
    layout: migrateSectionLayout(props),
    padding: migrateSectionPadding(props),
    margin: migrateFourSidedEnumTokenSpacing(props, {
      top: 'styleMarginTop',
      right: 'styleMarginRight',
      bottom: 'styleMarginBottom',
      left: 'styleMarginLeft',
    }),
    // `container` v2 dichiara `background: { stateful: true }`: il validatore
    // richiede l'inviluppo `{ normal, hover? }` anche se questa migrazione non
    // popola mai un ramo `hover` (stesso principio di `border`/`shadow` sotto).
    background: { normal: migrateSectionBackground(props) },
    hideOn: migrateHideFlagsToHideOn(props),
    ...migrateSectionContentWidth(props),
  };

  const position = migrateSectionPosition(props);
  if (position) migratedProps.position = position;

  const border = wrapAsStatefulNormal(props.styleBorder);
  if (border) migratedProps.border = border;

  const shadow = wrapAsStatefulNormal(props.styleShadow);
  if (shadow) migratedProps.shadow = shadow;

  if (typeof props.customCssClass === 'string') migratedProps.cssClass = props.customCssClass;
  if (typeof props.customElementId === 'string') migratedProps.htmlId = props.customElementId;

  return {
    ...node,
    type: 'container',
    v: 2,
    props: migratedProps,
  };
}
