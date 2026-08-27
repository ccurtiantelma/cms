/**
 * Pagina Amministrazione Utenti — pattern CRUD completo di riferimento del
 * CMS (`ResponsiveTable` + `ListToolbar` + `usePaginatedList` +
 * `FormDrawer`). Tabella utenti con toolbar sticky (paginazione + ricerca +
 * totale risultati) e azioni di riga a sole icone con tooltip.
 */
import { useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Group,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useSearchParams } from 'react-router-dom';
import { IconLogin, IconShieldOff, IconPencil, IconUser } from '@tabler/icons-react';
import { useAuthStore } from '../../hooks/useAuth';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { getErrorMessage } from '../../utils/api.utils';
import { setToken, setStoredUser } from '../../utils/auth.utils';
import {
  fetchUsers,
  toggleActiveUser,
  resetMfaUser,
  createUser,
  updateUser,
  fetchAuditLog,
  type UserListItem,
  type CreateUserRequest,
  type UpdateUserRequest,
} from '../../services/admin.service';
import { impersonateApi } from '../../services/auth.service';
import ListToolbar from '../../components/ListToolbar';
import PageHeader from '../../components/PageHeader';
import ContentCard from '../../components/ContentCard';
import ResponsiveTable, { type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import ColumnSelector from '../../components/ColumnSelector';
import ConfirmModal from '../../components/ConfirmModal';
import FormDrawer from '../../components/FormDrawer';
import { AppUserRoles, ROLE_LABELS } from '../../types/common.types';
import AuditLogPanel from './AuditLogPanel';

/** Ruoli assegnabili da questa UI (SuperAdmin escluso: creato solo via seed). */
const ROLE_OPTIONS = [
  { value: String(AppUserRoles.Admin), label: ROLE_LABELS[AppUserRoles.Admin] },
  { value: String(AppUserRoles.Manager), label: ROLE_LABELS[AppUserRoles.Manager] },
  { value: String(AppUserRoles.User), label: ROLE_LABELS[AppUserRoles.User] },
];

/** Colore badge per ruolo, con fallback per ruoli non mappati. */
function roleColor(role: number): string {
  switch (role) {
    case AppUserRoles.SuperAdmin:
      return 'dark';
    case AppUserRoles.Admin:
      return 'starterPrimary';
    case AppUserRoles.Manager:
      return 'cyan';
    case AppUserRoles.User:
      return 'green';
    default:
      return 'gray';
  }
}

/** Etichetta ruolo con fallback per ruoli non mappati. */
function roleLabel(role: number): string {
  return ROLE_LABELS[role as AppUserRoles] ?? String(role);
}

/** Iniziali (nome + cognome) per l'avatar della card. */
function initials(user: UserListItem): string {
  return `${user.name.charAt(0)}${user.surname?.charAt(0) ?? ''}`.toUpperCase();
}

/** Colonne ordinabili lato API. */
const USER_SORTABLE: (keyof UserListItem)[] = ['name', 'surname', 'email', 'role'];

interface UserFormValues {
  name: string;
  surname: string;
  email: string;
  role: string;
  scopeId: string;
}

function userToFormValues(user?: UserListItem): UserFormValues {
  return {
    name: user?.name ?? '',
    surname: user?.surname ?? '',
    email: user?.email ?? '',
    role: user ? String(user.role) : String(AppUserRoles.User),
    scopeId: user?.scopeId ?? '',
  };
}

/** Pagina di amministrazione utenti (Admin+). */
export default function PageUsers(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accessCount, setAccessCount] = useState<number | null>(null);
  const currentUser = useAuthStore((state) => state.user);
  const isSuperAdmin = currentUser?.role === AppUserRoles.SuperAdmin;
  const activeTab = searchParams.get('tab') === 'audit-log' ? 'audit-log' : 'users';

  useEffect(() => {
    let active = true;
    fetchAuditLog({ p: 1, i: 1, action: 'login' })
      .then((result) => {
        if (active) setAccessCount(result.totalItems);
      })
      .catch((err: unknown) => {
        if (active) {
          notifications.show({
            color: 'red',
            message: getErrorMessage(err, 'Errore nel caricamento del totale accessi'),
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const {
    records,
    setRecords,
    total,
    totalPages,
    page,
    setPage,
    limit,
    setLimit,
    search,
    setSearch,
    sort,
    toggleSort,
    loading,
    reload,
  } = usePaginatedList<UserListItem>(fetchUsers, {
    errorMessage: 'Errore nel caricamento degli utenti',
  });

  const [createOpened, setCreateOpened] = useState(false);
  const [editTarget, setEditTarget] = useState<UserListItem | null>(null);
  const [mfaTarget, setMfaTarget] = useState<UserListItem | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<UserListItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<UserFormValues>({
    mode: 'controlled',
    initialValues: userToFormValues(),
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Nome obbligatorio' : null),
      email: (value) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'Email non valida'),
      role: (value) => (value ? null : 'Ruolo obbligatorio'),
    },
  });

  const isEdit = !!editTarget;
  const formOpened = createOpened || isEdit;

  function openCreate(): void {
    form.setValues(userToFormValues());
    setCreateOpened(true);
  }

  function openEdit(record: UserListItem): void {
    form.setValues(userToFormValues(record));
    setEditTarget(record);
  }

  function closeForm(): void {
    setCreateOpened(false);
    setEditTarget(null);
  }

  async function handleFormSubmit(values: UserFormValues): Promise<void> {
    setSubmitting(true);
    try {
      if (editTarget) {
        const payload: UpdateUserRequest = {
          name: values.name.trim(),
          surname: values.surname.trim() || undefined,
          email: values.email.trim(),
          role: Number(values.role),
          scopeId: values.scopeId.trim() || null,
        };
        await updateUser(editTarget.guid, payload);
        notifications.show({ color: 'green', message: 'Utente aggiornato con successo' });
      } else {
        const payload: CreateUserRequest = {
          name: values.name.trim(),
          surname: values.surname.trim() || undefined,
          email: values.email.trim(),
          role: Number(values.role),
          scopeId: values.scopeId.trim() || undefined,
        };
        await createUser(payload);
        notifications.show({ color: 'green', message: 'Utente creato con successo' });
      }
      closeForm();
      void reload();
    } catch (err) {
      const fallback = editTarget
        ? "Errore nell'aggiornamento dell'utente"
        : "Errore nella creazione dell'utente";
      notifications.show({ color: 'red', message: getErrorMessage(err, fallback) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(record: UserListItem): Promise<void> {
    try {
      const result = await toggleActiveUser(record.guid);
      setRecords((prev) =>
        prev.map((item) =>
          item.guid === record.guid ? { ...item, isActive: result.isActive } : item,
        ),
      );
      notifications.show({
        color: 'green',
        message: `Utente ${result.isActive ? 'riattivato' : 'disabilitato'} con successo`,
      });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nel cambio di stato'),
      });
    }
  }

  async function handleResetMfaConfirm(): Promise<void> {
    if (!mfaTarget) return;
    setSubmitting(true);
    try {
      await resetMfaUser(mfaTarget.guid);
      notifications.show({ color: 'green', message: 'MFA resettata con successo' });
      setMfaTarget(null);
      void reload();
    } catch (err) {
      notifications.show({ color: 'red', message: getErrorMessage(err, 'Errore nel reset MFA') });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImpersonateConfirm(): Promise<void> {
    if (!impersonateTarget) return;
    setSubmitting(true);
    try {
      const response = await impersonateApi(impersonateTarget.guid);
      setToken(response.accessToken);
      setStoredUser(response.user);
      window.location.href = '/dashboard';
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, "Errore nell'avvio dell'impersonificazione"),
      });
      setSubmitting(false);
    }
  }

  // Colonne definite qui (non a livello modulo) perché il render di "Attivo"
  // referenzia `handleToggleActive` (closure sullo stato della pagina).
  const columns: ResponsiveTableColumn<UserListItem>[] = [
    { key: 'name', label: 'Nome', hideInCard: true },
    { key: 'surname', label: 'Cognome', hideInCard: true },
    { key: 'email', label: 'Email' },
    {
      key: 'role',
      label: 'Ruolo',
      hideInCard: true,
      render: (row) => <Badge color={roleColor(row.role)}>{roleLabel(row.role)}</Badge>,
    },
    {
      key: 'scopeId',
      label: 'Ambito',
      render: (row) => row.scopeId ?? '—',
    },
    {
      key: 'isActive',
      label: 'Attivo',
      render: (row) =>
        row.role === AppUserRoles.SuperAdmin ? (
          <Text size="xs" c="dimmed">
            —
          </Text>
        ) : (
          <Switch
            checked={row.isActive}
            onChange={() => void handleToggleActive(row)}
            aria-label={row.isActive ? 'Disabilita utente' : 'Abilita utente'}
          />
        ),
    },
  ];

  const { visibleColumns, isVisible, toggle } = useColumnVisibility('app.columns.users', columns);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Amministrazione' }, { label: 'Utenti' }]}
        title="Utenti"
        kpis={[
          { value: total, label: 'Utenti', icon: IconUser },
          { value: accessCount ?? '—', label: 'Accessi', icon: IconLogin, color: 'green' },
        ]}
      />

      <Tabs
        value={activeTab}
        onChange={(value) => {
          if (value === 'audit-log') {
            setSearchParams({ tab: value });
          } else {
            setSearchParams({});
          }
        }}
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="users">Gestione utenti</Tabs.Tab>
          <Tabs.Tab value="audit-log">Audit Log</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users">
          <ContentCard>
            <ListToolbar
              state={{ page, setPage, totalPages, limit, setLimit, total, search, setSearch }}
              newLabel="Nuovo Utente"
              onNew={openCreate}
              columnSelector={
                <ColumnSelector columns={columns} isVisible={isVisible} onToggle={toggle} />
              }
            />

            <ScrollArea offsetScrollbars>
              <ResponsiveTable<UserListItem>
                data={records}
                loading={loading}
                rowKey={(row) => row.guid}
                columns={visibleColumns}
                sortable={USER_SORTABLE}
                sort={sort}
                onSortChange={toggleSort}
                cardHeader={(row) => (
                  <Group wrap="nowrap" gap="sm">
                    <Avatar color={roleColor(row.role)} radius="xl">
                      {initials(row)}
                    </Avatar>
                    <div>
                      <Text fw={600}>
                        {row.name} {row.surname}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {roleLabel(row.role)}
                      </Text>
                    </div>
                  </Group>
                )}
                actions={[
                  {
                    label: 'Modifica',
                    icon: <IconPencil size={16} />,
                    onClick: openEdit,
                    hidden: (row) => row.role === AppUserRoles.SuperAdmin,
                  },
                  {
                    label: 'Reset MFA',
                    color: 'orange',
                    icon: <IconShieldOff size={16} />,
                    onClick: (row) => setMfaTarget(row),
                    hidden: (row) => row.role === AppUserRoles.SuperAdmin,
                  },
                  {
                    label: 'Accedi come',
                    color: 'starterPrimary',
                    icon: <IconLogin size={16} />,
                    onClick: (row) => setImpersonateTarget(row),
                    hidden: (row) => !isSuperAdmin || row.role === AppUserRoles.SuperAdmin,
                  },
                ]}
              />
            </ScrollArea>
          </ContentCard>
        </Tabs.Panel>

        <Tabs.Panel value="audit-log">
          <AuditLogPanel />
        </Tabs.Panel>
      </Tabs>

      {/* Form Nuovo/Modifica Utente (drawer laterale condiviso). */}
      <FormDrawer
        opened={formOpened}
        onClose={closeForm}
        title={isEdit ? 'Modifica Utente' : 'Nuovo Utente'}
        size="min(27.5rem, 100vw)"
        onSubmit={form.onSubmit((values) => void handleFormSubmit(values))}
        canSubmit={form.isValid()}
        submitting={submitting}
        tourId="user-form"
      >
        <Stack gap="sm">
          <TextInput label="Nome" withAsterisk {...form.getInputProps('name')} />
          <TextInput label="Cognome" {...form.getInputProps('surname')} />
          <TextInput label="Email" withAsterisk {...form.getInputProps('email')} />
          <Select label="Ruolo" withAsterisk data={ROLE_OPTIONS} {...form.getInputProps('role')} />
          <TextInput
            label="Ambito"
            placeholder="es. filiale, ufficio, tenant (opzionale)"
            {...form.getInputProps('scopeId')}
          />
        </Stack>
      </FormDrawer>

      {/* Modal conferma Reset MFA */}
      <ConfirmModal
        opened={!!mfaTarget}
        onClose={() => setMfaTarget(null)}
        onConfirm={handleResetMfaConfirm}
        loading={submitting}
        title="Conferma Reset MFA"
        confirmLabel="Resetta MFA"
        confirmColor="orange"
      >
        Resettare l&apos;MFA di{' '}
        <strong>
          {mfaTarget?.name} {mfaTarget?.surname}
        </strong>
        ? L&apos;utente potrà ri-configurarla al prossimo accesso.
      </ConfirmModal>

      {/* Modal conferma Accedi come (impersonificazione) */}
      <ConfirmModal
        opened={!!impersonateTarget}
        onClose={() => setImpersonateTarget(null)}
        onConfirm={handleImpersonateConfirm}
        loading={submitting}
        title="Conferma Impersonificazione"
        confirmLabel="Accedi come"
        confirmColor="starterPrimary"
      >
        Stai per accedere come{' '}
        <strong>
          {impersonateTarget?.name} {impersonateTarget?.surname}
        </strong>
        . Ogni azione eseguita durante questa sessione verrà registrata nell&apos;audit log con la
        tua identità reale.
      </ConfirmModal>
    </div>
  );
}
