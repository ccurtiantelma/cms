import { BlockPropsMigrationStep } from '../migration/block-migration.types';
import { migrateFourSidedUnitValueSpacing, migrateHideFlagsToHideOn, omit } from './shared';

/**
 * Chiavi v1 sostituite da questa migrazione (ADR-81 § "Decisione" punto 2/3).
 * `image` non dichiarava `styleTextColor`/`styleFontSize`/`Weight`/`Family`
 * (tabella di ADR-81 § "Decisione" punto 2, colonna "Tipi che la dichiarano"
 * non include `image` per quella riga): nessun `color`/`typography` migrato
 * qui, coerente col registro v1.
 */
const REPLACED_KEYS = [
  'styleHideDesktop',
  'styleHideTablet',
  'styleHideMobile',
  'styleMarginTop',
  'styleMarginRight',
  'styleMarginBottom',
  'styleMarginLeft',
] as const;

/**
 * `image` `v: 1 → v: 2` (ADR-81 § "Decisione" punto 2/3): `styleMarginTop/
 * Right/Bottom/Left` → `margin: spacing`, `styleHideDesktop/Tablet/Mobile` →
 * `hideOn`. `mediaRef`/`alt`/`styleSpaceBefore`/`styleSpaceAfter`/
 * `styleLayer`/`styleBorder`/`styleShadow`/`styleSizePreset`/`styleWidth`/
 * `styleHeight`/`styleObjectFit`/`styleAlign`/`customCssClass`/
 * `customElementId` restano invariate (fuori dalla tabella di ADR-81, righe
 * "Prop non toccate"). Pura e totale (ADR-21 § 3.6).
 *
 * @param props Props del nodo `image` a `v < 2`, non validate.
 * @returns Props `image` v2.
 */
export const migrateImageV1ToV2: BlockPropsMigrationStep = (props) => {
  return {
    ...omit(props, REPLACED_KEYS),
    margin: migrateFourSidedUnitValueSpacing(
      props,
      {
        top: 'styleMarginTop',
        right: 'styleMarginRight',
        bottom: 'styleMarginBottom',
        left: 'styleMarginLeft',
      },
      'migrateImageV1ToV2',
    ),
    hideOn: migrateHideFlagsToHideOn(props),
  };
};
