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
 * `heading` `v: 1 → v: 2` (ADR-81 § "Decisione" punto 2/3): `styleTextColor`
 * (+`Custom`) → `color: colorRef`, `styleFontSize`(+`Custom`)/`styleFontWeight`/
 * `styleFontFamily` → `typography: typography`, `styleMarginTop/Right/Bottom/
 * Left` → `margin: spacing`, `styleHideDesktop/Tablet/Mobile` → `hideOn`.
 * `level`/`text`/`styleSpaceBefore`/`styleSpaceAfter`/`styleLayer`/
 * `styleBorder`/`styleShadow`/`customCssClass`/`customElementId`/
 * `styleTextAlign` restano invariate (fuori dalla tabella di corrispondenza
 * di ADR-81 § "Decisione" punto 2). Pura e totale (ADR-21 § 3.6): ogni campo
 * letto da `props` è trattato come possibilmente assente o malformato.
 *
 * `color`/`typography` sono avvolte in `{ normal: ... }` (`wrapAsStatefulNormal`,
 * `shared.ts`): `heading.block.ts` v2 dichiara entrambe `stateful: true`
 * (ADR-81 § "Conseguenze"), il validatore richiede quindi l'inviluppo anche
 * se questa migrazione non popola mai un ramo `hover`.
 *
 * @param props Props del nodo `heading` a `v < 2`, non validate.
 * @returns Props `heading` v2, con le chiavi v1 sostituite sparite (mai affiancate).
 */
export const migrateHeadingV1ToV2: BlockPropsMigrationStep = (props) => {
  return {
    ...omit(props, REPLACED_KEYS),
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
      'migrateHeadingV1ToV2',
    ),
    hideOn: migrateHideFlagsToHideOn(props),
  };
};
