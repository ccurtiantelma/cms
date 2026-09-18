import { Logger } from '@nestjs/common';
import { BlockPropsMigrationStep } from '../migration/block-migration.types';
import {
  collectResponsiveBreakpointKeys,
  isUnitValueLike,
  mapGapTokenToLayoutGap,
  migrateFourSidedEnumTokenSpacing,
  omit,
  responsiveEnvelopeBranch,
  responsiveEnvelopeDefault,
} from './shared';

/** Chiavi v1 sostituite da questa migrazione (ADR-82 § "Decisione" punto 1, `container` v1 → v2). */
const REPLACED_KEYS = [
  'display',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'wrap',
  'gap',
  'styleFlexBasis',
  'styleBackgroundColor',
  'styleColor',
  'backgroundColor',
  'color',
  'stylePaddingTop',
  'stylePaddingRight',
  'stylePaddingBottom',
  'stylePaddingLeft',
  'styleMarginTop',
  'styleMarginRight',
  'styleMarginBottom',
  'styleMarginLeft',
  'styleWidth',
  'styleHeight',
  'customCssClass',
  'customElementId',
] as const;

const LAYOUT_DIRECTION_VALUES = ['row', 'row-reverse', 'column', 'column-reverse'];
const LAYOUT_JUSTIFY_VALUES = [
  'flex-start',
  'flex-end',
  'center',
  'space-between',
  'space-around',
  'space-evenly',
];
const LAYOUT_ALIGN_VALUES = ['stretch', 'flex-start', 'center', 'flex-end'];

function mapDisplayToken(token: unknown): string {
  // `container` v1 ammetteva solo `'flex'` (ADR-39 § "Decisione" punto 1):
  // nessun valore diverso era mai stato scrivibile, ma il mapping resta
  // difensivo verso un valore malformato.
  return token === 'grid' ? 'grid' : 'flex';
}
function mapDirectionToken(token: unknown): string {
  return typeof token === 'string' && LAYOUT_DIRECTION_VALUES.includes(token) ? token : 'row';
}
function mapJustifyToken(token: unknown): string {
  return typeof token === 'string' && LAYOUT_JUSTIFY_VALUES.includes(token) ? token : 'flex-start';
}
function mapAlignToken(token: unknown): string {
  return typeof token === 'string' && LAYOUT_ALIGN_VALUES.includes(token) ? token : 'stretch';
}
function mapWrapToken(token: unknown): string {
  return token === 'wrap' ? 'wrap' : 'nowrap';
}

/**
 * Migra le sei prop flex indipendenti di `container` v1 (`display`/
 * `flexDirection`/`justifyContent`/`alignItems`/`wrap`/`gap`, ciascuna
 * `responsive: true` per conto proprio) in un solo `layout: layout`
 * responsivo sull'**intero oggetto** (ADR-82 § "Decisione" punto 1: "non i
 * singoli campi"). Il ramo `default` è sempre completo; ogni altro
 * breakpoint presente in almeno uno dei sei campi v1 produce un ramo
 * **sparso** — solo i campi con un override esplicito a quel breakpoint —
 * coerente con la cascata CSS reale (una media query dichiara solo ciò che
 * cambia, il resto eredita dal ramo `default` per costruzione del
 * compilatore `toCss()`).
 */
function migrateContainerLayout(props: Record<string, unknown>): Record<string, unknown> {
  const { display, flexDirection, justifyContent, alignItems, wrap, gap } = props;
  const breakpoints = collectResponsiveBreakpointKeys(
    display,
    flexDirection,
    justifyContent,
    alignItems,
    wrap,
    gap,
  );

  const defaultLayout: Record<string, unknown> = {
    display: mapDisplayToken(responsiveEnvelopeDefault(display)),
    direction: mapDirectionToken(responsiveEnvelopeDefault(flexDirection)),
    justify: mapJustifyToken(responsiveEnvelopeDefault(justifyContent)),
    align: mapAlignToken(responsiveEnvelopeDefault(alignItems)),
    wrap: mapWrapToken(responsiveEnvelopeDefault(wrap)),
    gap: mapGapTokenToLayoutGap(responsiveEnvelopeDefault(gap)),
  };

  const envelope: Record<string, unknown> = { default: defaultLayout };
  for (const breakpoint of breakpoints) {
    const branch: Record<string, unknown> = {};
    const displayAt = responsiveEnvelopeBranch(display, breakpoint);
    if (displayAt !== undefined) branch.display = mapDisplayToken(displayAt);
    const directionAt = responsiveEnvelopeBranch(flexDirection, breakpoint);
    if (directionAt !== undefined) branch.direction = mapDirectionToken(directionAt);
    const justifyAt = responsiveEnvelopeBranch(justifyContent, breakpoint);
    if (justifyAt !== undefined) branch.justify = mapJustifyToken(justifyAt);
    const alignAt = responsiveEnvelopeBranch(alignItems, breakpoint);
    if (alignAt !== undefined) branch.align = mapAlignToken(alignAt);
    const wrapAt = responsiveEnvelopeBranch(wrap, breakpoint);
    if (wrapAt !== undefined) branch.wrap = mapWrapToken(wrapAt);
    const gapAt = responsiveEnvelopeBranch(gap, breakpoint);
    if (gapAt !== undefined) branch.gap = mapGapTokenToLayoutGap(gapAt);
    envelope[breakpoint] = branch;
  }
  return envelope;
}

/**
 * `container` `v: 1 → v: 2` (ADR-82 § "Decisione" punto 1, § "Conseguenze"):
 * `display`/`flexDirection`/`justifyContent`/`alignItems`/`wrap`/`gap` →
 * `layout.{display,direction,justify,align,wrap,gap}`; `stylePadding*`/
 * `styleMargin*` (token enum) → `padding`/`margin: spacing`;
 * `customCssClass`/`customElementId` → `cssClass`/`htmlId` (rinomina).
 * `styleWidth`/`styleHeight` non hanno equivalente diretto dichiarato da
 * ADR-82 (§ "Decisione" punto 1 non li elenca): scelta di design di questo
 * Sub-Task — mappati rispettivamente a `boxedWidth`/`minHeight` come
 * approssimazione più vicina disponibile (un contenitore con una larghezza
 * fissa v1 diventa un contenitore "boxed" a quella larghezza; un'altezza
 * fissa v1 diventa un'altezza minima v2), con un `warning` loggato (vedi
 * `shared.ts` sul meccanismo). `styleFlexBasis` e le quattro prop colore
 * "fallback" (`styleBackgroundColor`/`styleColor`/`backgroundColor`/`color`,
 * mai menzionate da alcuna ADR né lette da `toCss()`) sono scartate in
 * silenzio: nessun campo v2 le sostituisce, scelta di design segnalata nel
 * resoconto finale.
 *
 * @param props Props del nodo `container` a `v < 2`, non validate.
 * @returns Props `container` v2.
 */
export const migrateContainerV1ToV2: BlockPropsMigrationStep = (props) => {
  const result: Record<string, unknown> = {
    ...omit(props, REPLACED_KEYS),
    layout: migrateContainerLayout(props),
    padding: migrateFourSidedEnumTokenSpacing(props, {
      top: 'stylePaddingTop',
      right: 'stylePaddingRight',
      bottom: 'stylePaddingBottom',
      left: 'stylePaddingLeft',
    }),
    margin: migrateFourSidedEnumTokenSpacing(props, {
      top: 'styleMarginTop',
      right: 'styleMarginRight',
      bottom: 'styleMarginBottom',
      left: 'styleMarginLeft',
    }),
  };

  if (typeof props.customCssClass === 'string') {
    result.cssClass = props.customCssClass;
  }
  if (typeof props.customElementId === 'string') {
    result.htmlId = props.customElementId;
  }

  if (isUnitValueLike(props.styleWidth)) {
    Logger.warn(
      'container.styleWidth v1 senza equivalente diretto in v2 (ADR-82 non lo elenca): mappato a boxedWidth come approssimazione, contentWidth forzato a "boxed".',
      'migrateContainerV1ToV2',
    );
    result.boxedWidth = { value: props.styleWidth.value, unit: props.styleWidth.unit };
    result.contentWidth = 'boxed';
  }
  if (isUnitValueLike(props.styleHeight)) {
    Logger.warn(
      'container.styleHeight v1 senza equivalente diretto in v2 (ADR-82 non lo elenca): mappato a minHeight come approssimazione.',
      'migrateContainerV1ToV2',
    );
    const unit = props.styleHeight.unit === 'vh' ? 'vh' : 'px';
    result.minHeight = { value: props.styleHeight.value, unit };
  }

  return result;
};
