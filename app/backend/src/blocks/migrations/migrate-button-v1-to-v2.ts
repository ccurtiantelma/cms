import { BlockPropsMigrationStep } from '../migration/block-migration.types';
import {
  migrateFourSidedUnitValueSpacing,
  migrateHideFlagsToHideOn,
  migrateHrefToLink,
  migrateTextColorProp,
  migrateTypographyProp,
  omit,
  wrapAsStatefulNormal,
} from './shared';

/** Chiavi v1 sostituite da questa migrazione (ADR-81 § "Decisione" punto 2/3, incluso `href` → `link`). */
const REPLACED_KEYS = [
  'href',
  'styleTextColor',
  'styleFontSize',
  'styleFontWeight',
  'styleFontFamily',
  'styleHideDesktop',
  'styleHideTablet',
  'styleHideMobile',
  'styleMarginTop',
  'styleMarginRight',
  'styleMarginBottom',
  'styleMarginLeft',
] as const;

/**
 * Quattro prop "fallback" (`styleBackgroundColor`/`styleColor`/
 * `backgroundColor`/`color`) scartate per lo stesso motivo di `richText`
 * (vedi `migrate-rich-text-v1-to-v2.ts`): non menzionate da ADR-81, `color`
 * collide col nuovo `color: colorRef`. `button` non ha mai avuto
 * `styleTextColorCustom`/`styleFontSizeCustom` in v1 (assenti dal registro),
 * quindi la priorità "custom" di `migrateTextColorProp`/`migrateTypographyProp`
 * qui riceve sempre `undefined` — comportamento corretto per costruzione.
 */
const DEAD_FALLBACK_COLOR_KEYS = [
  'styleBackgroundColor',
  'styleColor',
  'backgroundColor',
  'color',
] as const;

/**
 * `button` `v: 1 → v: 2` (ADR-81 § "Decisione" punto 2/3): `href: url` →
 * `link: link`, più la stessa tabella `color`/`typography`/`margin`/`hideOn`
 * di `heading`/`richText`. `label`/`styleSpaceBefore`/`styleSpaceAfter`/
 * `styleLayer`/`customCssClass`/`customElementId` restano invariate. Pura e
 * totale (ADR-21 § 3.6).
 *
 * @param props Props del nodo `button` a `v < 2`, non validate.
 * @returns Props `button` v2.
 */
export const migrateButtonV1ToV2: BlockPropsMigrationStep = (props) => {
  return {
    ...omit(props, [...REPLACED_KEYS, ...DEAD_FALLBACK_COLOR_KEYS]),
    color: wrapAsStatefulNormal(migrateTextColorProp(props.styleTextColor, undefined)),
    typography: wrapAsStatefulNormal(
      migrateTypographyProp({
        fontSize: props.styleFontSize,
        fontSizeCustom: undefined,
        fontWeight: props.styleFontWeight,
        fontFamily: props.styleFontFamily,
      }),
    ),
    margin: migrateFourSidedUnitValueSpacing(
      props,
      {
        top: 'styleMarginTop',
        right: 'styleMarginRight',
        bottom: 'styleMarginBottom',
        left: 'styleMarginLeft',
      },
      'migrateButtonV1ToV2',
    ),
    hideOn: migrateHideFlagsToHideOn(props),
    link: migrateHrefToLink(props),
  };
};
