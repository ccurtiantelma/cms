/**
 * Elenco Pagine (F01/T7) — stesso pattern CRUD di `PageUsers`
 * (`ResponsiveTable` + `ListToolbar` + `usePaginatedList`), con filtri
 * `status`/`locale` e ricerca testuale. La creazione qui gestisce solo i
 * metadati minimi (titolo, slug, locale, genitore): il resto (SEO, stato,
 * revisioni) si gestisce nella pagina di dettaglio dopo la creazione.
 * L'API applica già ownership per riga (ADR-18): un `User` vede solo le
 * proprie Pagine, nessun filtro di ruolo è reimplementato qui lato client.
 */
import { useState } from 'react';
import { Badge, Group, ScrollArea, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconFileText, IconPencil, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { getErrorMessage } from '../../utils/api.utils';
import { createPage, deletePage, fetchPages } from '../../services/pages.service';
import type {
  CreatePagePayload,
  PageRecord,
  PagesQueryParams,
  PageStatus,
} from '../../types/pages.types';
import { PAGE_STATUS_COLORS, PAGE_STATUS_LABELS, PAGE_STATUSES } from '../../types/pages.types';
import ListToolbar from '../../components/ListToolbar';
import PageHeader from '../../components/PageHeader';
import ContentCard from '../../components/ContentCard';
import ResponsiveTable, { type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import ColumnSelector from '../../components/ColumnSelector';
import ConfirmModal from '../../components/ConfirmModal';
import FormDrawer from '../../components/FormDrawer';

/** Opzioni del filtro stato (vuoto = tutti). */
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Tutti gli stati' },
  ...PAGE_STATUSES.map((status) => ({ value: status, label: PAGE_STATUS_LABELS[status] })),
];

/** Colonne ordinabili lato API (`o=` — vedi `PagesController_findAll`). */
const PAGES_SORTABLE: (keyof PageRecord)[] = [
  'title',
  'slug',
  'status',
  'locale',
  'createdAt',
  'updatedAt',
];

/** Valori del form di creazione rapida (solo metadati minimi). */
interface CreatePageFormValues {
  title: string;
  slug: string;
  locale: string;
  parentGuid: string;
}

const EMPTY_CREATE_FORM: CreatePageFormValues = {
  title: '',
  slug: '',
  locale: 'it-IT',
  parentGuid: '',
};

/** Formatta una data ISO nel formato locale italiano (data + ora). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('it-IT');
}

/** Pagina elenco Pagine (chrome amministrativa, F01/T7). */
export default function PagePages(): JSX.Element {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [localeFilter, setLocaleFilter] = useState<string>('');
  const [createOpened, setCreateOpened] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PageRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const extraParams: Partial<PagesQueryParams> = {
    status: statusFilter ? (statusFilter as PageStatus) : undefined,
    locale: localeFilter || undefined,
  };

  const {
    records,
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
  } = usePaginatedList<PageRecord, Partial<PagesQueryParams>>(fetchPages, {
    errorMessage: 'Errore nel caricamento delle Pagine',
    extraParams,
  });

  const form = useForm<CreatePageFormValues>({
    mode: 'controlled',
    initialValues: EMPTY_CREATE_FORM,
    validate: {
      title: (value) => (value.trim().length === 0 ? 'Titolo obbligatorio' : null),
      locale: (value) => (value.trim().length === 0 ? 'Locale obbligatorio' : null),
    },
  });

  function openCreate(): void {
    form.setValues(EMPTY_CREATE_FORM);
    setCreateOpened(true);
  }

  function closeCreate(): void {
    setCreateOpened(false);
  }

  async function handleCreateSubmit(values: CreatePageFormValues): Promise<void> {
    setSubmitting(true);
    try {
      const payload: CreatePagePayload = {
        title: values.title.trim(),
        slug: values.slug.trim() || undefined,
        locale: values.locale.trim(),
        parentGuid: values.parentGuid.trim() || undefined,
      };
      const created = await createPage(payload);
      notifications.show({ color: 'green', message: 'Pagina creata con successo' });
      closeCreate();
      navigate(`/pages/${created.guid}`);
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nella creazione della Pagina'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deletePage(deleteTarget.guid);
      notifications.show({ color: 'green', message: 'Pagina eliminata con successo' });
      setDeleteTarget(null);
      void reload();
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, "Errore nell'eliminazione della Pagina"),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const columns: ResponsiveTableColumn<PageRecord>[] = [
    { key: 'title', label: 'Titolo' },
    { key: 'slug', label: 'Slug', hideInCard: true },
    { key: 'locale', label: 'Locale', hideInCard: true },
    {
      key: 'status',
      label: 'Stato',
      render: (row) => (
        <Badge color={PAGE_STATUS_COLORS[row.status as PageStatus] ?? 'gray'}>
          {PAGE_STATUS_LABELS[row.status as PageStatus] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'updatedAt',
      label: 'Aggiornata',
      hideInCard: true,
      render: (row) => formatDate(row.updatedAt),
    },
  ];

  const { visibleColumns, isVisible, toggle } = useColumnVisibility('app.columns.pages', columns);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Pagine' }]}
        title="Pagine"
        kpis={[{ value: total, label: 'Pagine', icon: IconFileText }]}
      />

      <ContentCard>
        <ListToolbar
          state={{ page, setPage, totalPages, limit, setLimit, total, search, setSearch }}
          searchPlaceholder="Cerca per titolo o slug..."
          newLabel="Nuova Pagina"
          onNew={openCreate}
          filters={
            <Group gap="sm" wrap="wrap">
              <Select
                label="Stato"
                data={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value ?? '');
                  setPage(1);
                }}
                w={180}
                allowDeselect={false}
              />
              <TextInput
                label="Locale"
                placeholder="es. it-IT"
                value={localeFilter}
                onChange={(e) => {
                  setLocaleFilter(e.currentTarget.value);
                  setPage(1);
                }}
                w={140}
              />
            </Group>
          }
          columnSelector={
            <ColumnSelector columns={columns} isVisible={isVisible} onToggle={toggle} />
          }
        />

        <ScrollArea offsetScrollbars>
          <ResponsiveTable<PageRecord>
            data={records}
            loading={loading}
            rowKey={(row) => row.guid}
            columns={visibleColumns}
            sortable={PAGES_SORTABLE}
            sort={sort}
            onSortChange={toggleSort}
            emptyText="Nessuna Pagina trovata"
            cardHeader={(row) => (
              <div>
                <Text fw={600}>{row.title}</Text>
                <Text size="xs" c="dimmed">
                  {row.slug}
                </Text>
              </div>
            )}
            actions={[
              {
                label: 'Apri',
                icon: <IconPencil size={16} />,
                onClick: (row) => navigate(`/pages/${row.guid}`),
              },
              {
                label: 'Elimina',
                color: 'red',
                icon: <IconTrash size={16} />,
                onClick: (row) => setDeleteTarget(row),
              },
            ]}
          />
        </ScrollArea>
      </ContentCard>

      {/* Drawer creazione rapida — solo metadati minimi. */}
      <FormDrawer
        opened={createOpened}
        onClose={closeCreate}
        title="Nuova Pagina"
        size="min(27.5rem, 100vw)"
        onSubmit={form.onSubmit((values) => void handleCreateSubmit(values))}
        canSubmit={form.isValid()}
        submitting={submitting}
      >
        <Stack gap="sm">
          <TextInput label="Titolo" withAsterisk {...form.getInputProps('title')} />
          <TextInput
            label="Slug"
            placeholder="generato dal titolo se vuoto"
            {...form.getInputProps('slug')}
          />
          <TextInput
            label="Locale"
            withAsterisk
            placeholder="it-IT"
            {...form.getInputProps('locale')}
          />
          <TextInput
            label="Pagina genitore (guid)"
            placeholder="lascia vuoto per una Pagina radice"
            {...form.getInputProps('parentGuid')}
          />
        </Stack>
      </FormDrawer>

      {/* Modal conferma eliminazione (soft-delete, Admin+). */}
      <ConfirmModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={submitting}
        title="Conferma Eliminazione"
        confirmLabel="Elimina"
        confirmColor="red"
      >
        Eliminare la Pagina <strong>{deleteTarget?.title}</strong>? L&apos;operazione è
        un&apos;eliminazione soft (la riga resta recuperabile lato dati) ma la Pagina non sarà più
        visibile né modificabile da questa interfaccia.
      </ConfirmModal>
    </div>
  );
}
