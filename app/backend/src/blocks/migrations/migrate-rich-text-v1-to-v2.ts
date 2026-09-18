import { BlockPropsMigrationStep } from '../migration/block-migration.types';
import {
  migrateFourSidedUnitValueSpacing,
  migrateHideFlagsToHideOn,
  migrateTextColorProp,
  migrateTypographyProp,
  omit,
  wrapAsStatefulNormal,
} from './shared';

/** Chiavi v1 sostituite da questa migrazione (ADR-81 § "Decisione" punto 2/3). */
const REPLACED_KEYS = [
  'styleTextColor',
  'styleTextColorCustom',
  'styleFontSize',
  'styleFontSizeCustom',
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
 * Chiavi v1 fuori dalla tabella di corrispondenza di ADR-81 ma scartate: le
 * quattro prop "fallback" (`styleBackgroundColor`/`styleColor`/
 * `backgroundColor`/`color`, `kind: 'color'`) duplicano `styleTextColor` senza
 * essere mai menzionate da alcuna ADR firmata né consumate da `toCss()` —
 * scelta di design di questo Sub-Task: rimosse in v2, principalmente perché
 * `color` collide per nome con il nuovo `color: colorRef` che ADR-81 impone
 * letteralmente (§ "Decisione" punto 2, riga `styleTextColor`). Segnalato
 * come ambiguità reale risolta nel resoconto finale del Sub-Task.
 */
const DEAD_FALLBACK_COLOR_KEYS = [
  'styleBackgroundColor',
  'styleColor',
  'backgroundColor',
  'color',
] as const;

/**
 * `richText` `v: 1 → v: 2` (ADR-81 § "Decisione" punto 2/3): stessa tabella
 * di `heading` (`color`, `typography`, `margin`, `hideOn`) applicata a
 * `richText`. `html`/`styleSpaceBefore`/`styleSpaceAfter`/`styleLayer`/
 * `styleBorder`/`styleShadow`/`customCssClass`/`customElementId` restano
 * invariate. Pura e totale (ADR-21 § 3.6).
 *
 * @param props Props del nodo `richText` a `v < 2`, non validate.
 * @returns Props `richText` v2.
 */
export const migrateRichTextV1ToV2: BlockPropsMigrationStep = (props) => {
  return {
    ...omit(props, [...REPLACED_KEYS, ...DEAD_FALLBACK_COLOR_KEYS]),
    color: wrapAsStatefulNormal(
      migrateTextColorProp(props.styleTextColor, props.styleTextColorCustom),
    ),
    typography: wrapAsStatefulNormal(
      migrateTypographyProp({
        fontSize: props.styleFontSize,
        fontSizeCustom: props.styleFontSizeCustom,
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
      'migrateRichTextV1ToV2',
    ),
    hideOn: migrateHideFlagsToHideOn(props),
  };
};
