/**
 * Pagina Ruoli e permessi (`/roles`, ADR-99 § 10, SPEC-RBAC-F2b § Pagina Ruoli). Lettura con
 * `roles:read`, scrittura con `roles:manage` (di fatto il solo SuperAdmin, ADR-99 P2). I ruoli di
 * sistema restano in sola lettura (P3).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconEye,
  IconLock,
  IconPencil,
  IconPlus,
  IconShieldLock,
  IconTrash,
  IconUserShield,
} from '@tabler/icons-react';
import PageHeader from '../../components/PageHeader';
import ContentCard from '../../components/ContentCard';
import ResponsiveTable, { type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import ConfirmModal from '../../components/ConfirmModal';
import Can from '../../components/Can';
import RoleFormDrawer, { type RoleDrawerMode } from './RoleFormDrawer';
import { useAuthStore } from '../../hooks/useAuth';
import { useHasPermission } from '../../hooks/useHasPermission';
import { deleteRole, fetchPermissionCatalog, fetchRoles } from '../../services/roles.service';
import { getErrorCode } from '../../utils/api.utils';
import { roleErrorMessage } from '../../utils/roles-errors.utils';
import type { PermissionGroup, RoleRecord } from '../../types/roles.types';

/** Codici permesso mostrati come badge nella tabella prima del "+N". */
const VISIBLE_PERMISSION_BADGES = 4;

/** Badge dei permessi di un ruolo: i primi 4, poi "+N" con gli altri in tooltip. */
function PermissionBadges({ permissions }: { permissions: string[] }): JSX.Element {
  if (permissions.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nessun permesso
      </Text>
    );
  }
  const shown = permissions.slice(0, VISIBLE_PERMISSION_BADGES);
  const rest = permissions.slice(VISIBLE_PERMISSION_BADGES);
  return (
    <Group gap={4}>
      {shown.map((code) => (
        <Badge key={code} variant="light" color="gray" tt="none">
          {code}
        </Badge>
      ))}
      {rest.length > 0 && (
        <Tooltip label={rest.join(', ')} multiline w={260} withArrow>
          <Badge variant="outline" color="gray">
            +{rest.length}
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}

const COLUMNS: ResponsiveTableColumn<RoleRecord>[] = [
  {
    key: 'name',
    label: 'Nome',
    hideInCard: true,
    render: (row) => (
      <div>
        <Text fw={500} size="sm">
          {row.name}
        </Text>
        {row.description && (
          <Text size="xs" c="dimmed">
            {row.description}
          </Text>
        )}
      </div>
    ),
  },
  {
    key: 'code',
    label: 'Codice',
    render: (row) => (
      <Text ff="monospace" size="sm">
        {row.code}
      </Text>
    ),
  },
  {
    key: 'isSystem',
    label: 'Tipo',
    render: (row) =>
      row.isSystem ? (
        <Badge color="dark" variant="light" leftSection={<IconLock size={12} />}>
          Sistema
        </Badge>
      ) : (
        <Badge color="starterPrimary" variant="light">
          Personalizzato
        </Badge>
      ),
  },
  {
    key: 'permissions',
    label: 'Permessi',
    render: (row) => <PermissionBadges permissions={row.permissions} />,
  },
];

interface DrawerState {
  mode: RoleDrawerMode;
  role: RoleRecord | null;
}

/** Pagina di gestione dei ruoli e della matrice dei permessi. */
export default function PageRoles(): JSX.Element {
  const canManage = useHasPermission('roles:manage');
  const callerPermissions = useAuthStore((state) => state.permissions) ?? [];
  const refreshPermissions = useAuthStore((state) => state.refreshPermissions);

  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [catalog, setCatalog] = useState<PermissionGroup[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  // Lo stato resta impostato anche a drawer chiuso, così titolo e campi non cambiano durante
  // l'animazione di chiusura.
  const [drawer, setDrawer] = useState<DrawerState>({ mode: 'view', role: null });
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRoles = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setRoles(await fetchRoles());
      setLoadError(false);
    } catch (err) {
      setLoadError(true);
      const feedback = roleErrorMessage(err, 'Errore nel caricamento dei ruoli');
      if (feedback) notifications.show({ color: 'red', message: feedback.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async (): Promise<void> => {
    setCatalog(null);
    setCatalogError(false);
    try {
      setCatalog(await fetchPermissionCatalog());
    } catch (err) {
      setCatalogError(true);
      const feedback = roleErrorMessage(err, 'Errore nel caricamento del catalogo dei permessi');
      if (feedback) notifications.show({ color: 'red', message: feedback.message });
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  /** Apre il drawer e carica il catalogo alla prima apertura (poi resta in cache). */
  function openDrawer(mode: RoleDrawerMode, role: RoleRecord | null): void {
    setDrawer({ mode, role });
    setDrawerOpened(true);
    if (catalog === null && !catalogError) void loadCatalog();
  }

  /** Dopo ogni scrittura riuscita: lista e permessi del chiamante ricaricati (S35). */
  function afterWrite(): void {
    void loadRoles();
    void refreshPermissions();
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRole(deleteTarget.guid);
      notifications.show({ color: 'green', message: `Ruolo "${deleteTarget.name}" eliminato` });
      afterWrite();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) void loadRoles();
      const feedback = roleErrorMessage(err, "Errore nell'eliminazione del ruolo");
      if (feedback) {
        const hint =
          getErrorCode(err) === 'ROLE_IN_USE'
            ? ' Si toglie dal campo "Ruoli aggiuntivi" di ciascun utente, nella pagina Utenti.'
            : '';
        notifications.show({ color: 'red', message: `${feedback.message}${hint}` });
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const customCount = roles.filter((role) => !role.isSystem).length;
  const isEditable = (row: RoleRecord): boolean => canManage && !row.isSystem;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Amministrazione' }, { label: 'Ruoli' }]}
        title="Ruoli e permessi"
        subtitle={
          canManage
            ? undefined
            : 'Sola lettura: solo il SuperAdmin crea, modifica ed elimina i ruoli.'
        }
        kpis={[
          { value: roles.length, label: 'Ruoli', icon: IconShieldLock },
          { value: customCount, label: 'Personalizzati', icon: IconUserShield, color: 'cyan' },
        ]}
      />

      <ContentCard>
        <Stack gap="md">
          <Can permission="roles:manage">
            <Group justify="flex-end">
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => openDrawer('create', null)}
              >
                Nuovo ruolo
              </Button>
            </Group>
          </Can>

          {loadError && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Ruoli non caricati">
              <Stack gap="xs" align="flex-start">
                <Text size="sm">Non è stato possibile caricare l&apos;elenco dei ruoli.</Text>
                <Button size="xs" variant="light" onClick={() => void loadRoles()}>
                  Riprova
                </Button>
              </Stack>
            </Alert>
          )}

          <ScrollArea offsetScrollbars>
            <ResponsiveTable<RoleRecord>
              data={roles}
              loading={loading}
              rowKey={(row) => row.guid}
              columns={COLUMNS}
              emptyText="Nessun ruolo"
              cardHeader={(row) => <Text fw={600}>{row.name}</Text>}
              actions={[
                {
                  label: 'Visualizza',
                  icon: <IconEye size={16} />,
                  onClick: (row) => openDrawer('view', row),
                  hidden: isEditable,
                },
                {
                  label: 'Modifica',
                  icon: <IconPencil size={16} />,
                  onClick: (row) => openDrawer('edit', row),
                  hidden: (row) => !isEditable(row),
                },
                {
                  label: 'Elimina',
                  color: 'red',
                  icon: <IconTrash size={16} />,
                  onClick: (row) => setDeleteTarget(row),
                  hidden: (row) => !isEditable(row),
                },
              ]}
            />
          </ScrollArea>

          {canManage && !loading && !loadError && customCount === 0 && (
            <Text size="sm" c="dimmed" ta="center">
              Nessun ruolo personalizzato. Crea il primo con &quot;Nuovo ruolo&quot; per concedere
              permessi aggiuntivi a utenti specifici.
            </Text>
          )}
        </Stack>
      </ContentCard>

      <RoleFormDrawer
        opened={drawerOpened}
        mode={drawer.mode}
        role={drawer.role}
        catalog={catalog}
        catalogError={catalogError}
        callerPermissions={callerPermissions}
        onClose={() => setDrawerOpened(false)}
        onSaved={() => {
          setDrawerOpened(false);
          afterWrite();
        }}
        onRoleMissing={() => {
          setDrawerOpened(false);
          void loadRoles();
        }}
        onReloadCatalog={() => void loadCatalog()}
      />

      <ConfirmModal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
        loading={deleting}
        title="Elimina ruolo"
        confirmLabel="Elimina"
        confirmColor="red"
      >
        Eliminare il ruolo <strong>{deleteTarget?.name}</strong>? L&apos;operazione non si può
        annullare. Un ruolo ancora assegnato ad almeno un utente non può essere eliminato.
      </ConfirmModal>
    </div>
  );
}
