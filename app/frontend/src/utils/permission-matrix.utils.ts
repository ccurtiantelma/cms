/**
 * Regole della matrice dei permessi (SPEC-RBAC-F2b S33–S34, S38). Solo UX: il backend applica
 * comunque i permessi riservati (`400 RESERVED_PERMISSION`) e l'anti-escalation
 * (`403 PERMISSION_ESCALATION`, ADR-99 § 8).
 */
import { RESERVED_PERMISSIONS, type PermissionGroup, type RoleRecord } from '../types/roles.types';

/** Stato della checkbox "Seleziona tutti" di una categoria. */
export interface CategoryState {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
}

/**
 * Un codice è selezionabile in un ruolo personalizzato se non è riservato e il chiamante lo
 * possiede.
 * @param code Codice permesso.
 * @param callerPermissions Permessi effettivi del chiamante.
 */
export function isSelectable(code: string, callerPermissions: readonly string[]): boolean {
  return !RESERVED_PERMISSIONS.includes(code) && callerPermissions.includes(code);
}

/** Codici selezionabili di un gruppo, nell'ordine del catalogo. */
function selectableCodes(group: PermissionGroup, callerPermissions: readonly string[]): string[] {
  return group.permissions
    .map((p) => p.code)
    .filter((code) => isSelectable(code, callerPermissions));
}

/**
 * Stato della checkbox di gruppo: `checked` se tutti i codici selezionabili sono selezionati,
 * `indeterminate` se solo alcuni, `disabled` se il gruppo non ha codici selezionabili.
 * @param group Gruppo del catalogo.
 * @param selected Codici selezionati nel ruolo.
 * @param callerPermissions Permessi effettivi del chiamante.
 */
export function categoryState(
  group: PermissionGroup,
  selected: readonly string[],
  callerPermissions: readonly string[],
): CategoryState {
  const selectable = selectableCodes(group, callerPermissions);
  if (selectable.length === 0) return { checked: false, indeterminate: false, disabled: true };
  const count = selectable.filter((code) => selected.includes(code)).length;
  return {
    checked: count === selectable.length,
    indeterminate: count > 0 && count < selectable.length,
    disabled: false,
  };
}

/**
 * "Seleziona tutti" di una categoria: se tutti i codici selezionabili sono già selezionati li
 * toglie, altrimenti li aggiunge. I codici non selezionabili mantengono lo stato che avevano, così
 * `roles:manage` non entra mai e un codice che il chiamante non può rimettere non si perde.
 * @param group Gruppo del catalogo.
 * @param selected Codici selezionati nel ruolo.
 * @param callerPermissions Permessi effettivi del chiamante.
 * @returns Nuovo elenco dei codici selezionati.
 */
export function toggleCategory(
  group: PermissionGroup,
  selected: readonly string[],
  callerPermissions: readonly string[],
): string[] {
  const selectable = selectableCodes(group, callerPermissions);
  const { checked } = categoryState(group, selected, callerPermissions);
  const others = selected.filter((code) => !selectable.includes(code));
  return checked ? others : [...others, ...selectable];
}

/**
 * Un ruolo è assegnabile a un utente se il chiamante possiede tutti i suoi permessi
 * (anti-escalation, S38).
 * @param role Ruolo da assegnare.
 * @param callerPermissions Permessi effettivi del chiamante.
 */
export function isRoleAssignable(role: RoleRecord, callerPermissions: readonly string[]): boolean {
  return role.permissions.every((code) => callerPermissions.includes(code));
}
