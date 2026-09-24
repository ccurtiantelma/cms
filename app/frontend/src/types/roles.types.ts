/**
 * Tipi del dominio ruoli e permessi lato frontend (ADR-99, SPEC-RBAC-F2b § DTO).
 */

/**
 * Codici permesso letti dalla UI (SPEC F2b S29). Non è una copia del registro backend
 * (`permissions.registry.ts`): si estende quando nasce un nuovo consumer.
 */
export type PermissionCode = 'roles:read' | 'roles:manage' | 'users:assign_roles';
