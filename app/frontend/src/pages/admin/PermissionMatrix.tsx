/**
 * Matrice dei permessi di un ruolo (SPEC-RBAC-F2b S33–S34): un blocco per categoria del catalogo
 * `GET app/admin/permissions`, con "Seleziona tutti" e una checkbox per permesso.
 */
import { Badge, Checkbox, Group, Paper, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import {
  PERMISSION_CATEGORY_LABELS,
  RESERVED_PERMISSIONS,
  type PermissionCategory,
  type PermissionGroup,
} from '../../types/roles.types';
import { categoryState, isSelectable, toggleCategory } from '../../utils/permission-matrix.utils';

interface PermissionMatrixProps {
  /** Catalogo, nell'ordine del backend. */
  groups: PermissionGroup[];
  /** Codici selezionati. */
  value: string[];
  onChange: (value: string[]) => void;
  /** Permessi effettivi del chiamante, per l'anti-escalation. */
  callerPermissions: readonly string[];
  /** Modalità "Visualizza": tutte le checkbox disabilitate, senza tooltip. */
  readOnly?: boolean;
}

/** Etichetta italiana della categoria, o il codice grezzo se sconosciuta. */
function categoryLabel(category: string): string {
  return PERMISSION_CATEGORY_LABELS[category as PermissionCategory] ?? category;
}

/** Motivo per cui un codice non è selezionabile. */
function lockReason(code: string): string {
  return RESERVED_PERMISSIONS.includes(code)
    ? 'Riservato ai ruoli di sistema: non assegnabile a un ruolo personalizzato'
    : 'Non puoi concedere un permesso che non possiedi';
}

/** Matrice a checkbox dei permessi di un ruolo. */
export default function PermissionMatrix({
  groups,
  value,
  onChange,
  callerPermissions,
  readOnly = false,
}: PermissionMatrixProps): JSX.Element {
  const toggleCode = (code: string, checked: boolean): void => {
    onChange(checked ? [...value, code] : value.filter((c) => c !== code));
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Permessi
        </Text>
        <Badge variant="light" data-testid="permission-count">
          {value.length === 1 ? '1 permesso selezionato' : `${value.length} permessi selezionati`}
        </Badge>
      </Group>
      {groups.map((group) => {
        const label = categoryLabel(group.category);
        const state = categoryState(group, value, callerPermissions);
        return (
          <Paper key={group.category} withBorder p="sm" radius="md">
            <Checkbox
              label={<Text fw={600}>{label}</Text>}
              aria-label={`Seleziona tutti: ${label}`}
              checked={state.checked}
              indeterminate={state.indeterminate}
              disabled={readOnly || state.disabled}
              onChange={() => onChange(toggleCategory(group, value, callerPermissions))}
              mb="xs"
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" pl="lg">
              {group.permissions.map((permission) => {
                const selectable = isSelectable(permission.code, callerPermissions);
                const checkbox = (
                  <Checkbox
                    label={permission.description ?? permission.code}
                    description={permission.code}
                    checked={value.includes(permission.code)}
                    disabled={readOnly || !selectable}
                    onChange={(e) => toggleCode(permission.code, e.currentTarget.checked)}
                  />
                );
                if (readOnly || selectable) return <div key={permission.code}>{checkbox}</div>;
                // Il wrapper riceve gli eventi del puntatore che l'input disabilitato non emette.
                return (
                  <Tooltip key={permission.code} label={lockReason(permission.code)} withArrow>
                    <div data-testid={`locked-${permission.code}`}>{checkbox}</div>
                  </Tooltip>
                );
              })}
            </SimpleGrid>
          </Paper>
        );
      })}
    </Stack>
  );
}
