/**
 * Elenco Pagine (F01/T7) — stesso pattern CRUD di `PageUsers`
 * (`ResponsiveTable` + `ListToolbar` + `usePaginatedList`), con filtro
 * `status` e ricerca testuale. Nessun filtro/colonna "Lingua": il
 * multilingua non è ancora gestito in questa vista (F05 fuori scope qui).
 * La creazione qui gestisce solo i metadati minimi (titolo, slug, locale,
 * genitore): il resto (SEO, stato, revisioni) si gestisce nella pagina di
 * dettaglio dopo la creazione.
 * L'API applica già ownership per riga (ADR-18): un `User` vede solo le
 * proprie Pagine, nessun filtro di ruolo è reimplementato qui lato client.
 */
import { useEffect, useState } from 'react';
import { Badge, Button, Group, ScrollArea, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconEye, IconPencil, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useAuthStore } from '../../hooks/useAuth';
import { rebuildStaticSite } from '../../services/admin.service';
import { AppUserRoles } from '../../types/common.types';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { PUBLIC_SITE_URL } from '../../hooks/usePublicPageUrl';
import { getErrorMessage } from '../../utils/api.utils';
import { formatDate } from '../../utils/date.utils';
import {
  createPage,
  deletePage,
  fetchPage,
  fetchPages,
  issuePagePreviewToken,
} from '../../services/pages.service';
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
import TemplateSelectorGrid from './components/TemplateSelectorGrid';

/** Opzioni del filtro stato (vuoto = tutti). */
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Tutti gli stati' },
  ...PAGE_STATUSES.map((status) => ({ value: status, label: PAGE_STATUS_LABELS[status] })),
];

/** Colonne ordinabili lato API (`o=` — vedi `PagesController_findAll`). */
const PAGES_SORTABLE: (keyof PageRecord)[] = ['title', 'slug', 'status', 'createdAt', 'updatedAt'];

/** Valori del form di creazione rapida (solo metadati minimi). */
interface CreatePageFormValues {
  title: string;
  slug: string;
  locale: string;
  parentGuid: string;
  templateSlug: string;
}

/** `templateSlug` di default: Pagina Vuota — nessun blocco precompilato. */
const DEFAULT_TEMPLATE_SLUG = 'empty';

const EMPTY_CREATE_FORM: CreatePageFormValues = {
  title: '',
  slug: '',
  locale: 'it-IT',
  parentGuid: '',
  templateSlug: DEFAULT_TEMPLATE_SLUG,
};

/**
 * Tetto alle risalite verso gli antenati per risolvere il percorso pubblico dallo slug
 * (ADR-24 § 1), stesso limite di `usePublicPageUrl.ts` — qui riproposta come funzione
 * invocabile da un click di riga della lista, non da un effetto: l'azione "Mostra Pagina"
 * vive dentro `ResponsiveTable` (una riga fra molte), dove non si può montare un hook.
 */
const MAX_ANCESTOR_LOOKUPS = 20;

/**
 * Percorso pubblico assoluto di una Pagina **pubblicata**, risalendo la catena degli slug
 * degli antenati un livello alla volta (stessa logica di `usePublicPageUrl.ts`). `null` se la
 * catena non è risolvibile (antenato non leggibile, o oltre il tetto): un link plausibile ma
 * sbagliato sarebbe peggio della sua assenza.
 */
async function resolvePublicPagePath(row: PageRecord): Promise<string | null> {
  const segments = [row.slug];
  let ancestorGuid = row.parentGuid;
  let lookups = 0;
  while (ancestorGuid && lookups < MAX_ANCESTOR_LOOKUPS) {
    const ancestor = await fetchPage(ancestorGuid);
    segments.unshift(ancestor.slug);
    ancestorGuid = ancestor.parentGuid;
    lookups += 1;
  }
  return ancestorGuid ? null : `${PUBLIC_SITE_URL}/${segments.join('/')}`;
}

/** Pagina elenco Pagine (chrome amministrativa, F01/T7). */
export default function PagePages(): JSX.Element {
  const navigate = useNavigate();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === AppUserRoles.SuperAdmin);
  const [rebuilding, setRebuilding] = useState(false);

  /** Conteggi delle pagine per stato — calcolati via query parallele. */
  const [statusCounts, setStatusCounts] = useState<Partial<Record<PageStatus, number>>>({});

  /** Funzione di sistema (SuperAdmin): rigenera tutte le Pagine pubblicate del sito statico. */
  async function handleRebuildSite(): Promise<void> {
    setRebuilding(true);
    try {
      await rebuildStaticSite();
      notifications.show({
        color: 'green',
        message:
          'Rigenerazione del sito avviata: le pagine pubblicate si aggiornano entro pochi minuti.',
      });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Rigenerazione del sito non avviata'),
      });
    } finally {
      setRebuilding(false);
    }
  }

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [createOpened, setCreateOpened] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PageRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Guid della riga per cui "Mostra Pagina" è in corso: evita doppio click concorrente. */
  const [showPageLoadingGuid, setShowPageLoadingGuid] = useState<string | null>(null);

  const extraParams: Partial<PagesQueryParams> = {
    status: statusFilter ? (statusFilter as PageStatus) : undefined,
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
      locale: (value) => (value.trim().length === 0 ? 'Lingua obbligatoria' : null),
    },
  });

  /** Carica i conteggi delle pagine per ogni stato. */
  useEffect(() => {
    async function loadStatusCounts(): Promise<void> {
      try {
        const counts = await Promise.all(
          PAGE_STATUSES.map((status) =>
            fetchPages({ status, i: 1, p: 1 }).then((result) => ({
              status,
              count: result.totalItems,
            }))
          )
        );
        const countsMap: Partial<Record<PageStatus, number>> = {};
        counts.forEach(({ status, count }) => {
          countsMap[status] = count;
        });
        setStatusCounts(countsMap);
      } catch (err) {
        console.error('Errore nel caricamento dei conteggi per stato', err);
      }
    }
    void loadStatusCounts();
  }, []);

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
        templateSlug: values.templateSlug,
      };
      const created = await createPage(payload);
      notifications.show({ color: 'green', message: 'Pagina creata con successo' });
      closeCreate();
      // Apre subito l'Editor Visivo a blocchi sulla rotta isolata `/studio/:guid` (ADR-54):
      // appena creata, l'unica cosa sensata da fare è iniziare a comporre il contenuto.
      navigate(`/studio/${created.guid}`);
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nella creazione della Pagina'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * "Mostra Pagina" (bug T4): pubblicata → apre subito l'URL pubblico risolto dalla catena
   * degli antenati; bozza (o ogni altro stato non pubblicato) → genera un token di
   * anteprima effimero (ADR-25) e apre `{PUBLIC_SITE_URL}/__preview/:token`. Mai lo slug
   * pubblico diretto su una Pagina non pubblicata: risponderebbe `404` (ADR-24 § 3).
   */
  async function handleShowPage(row: PageRecord): Promise<void> {
    if (showPageLoadingGuid) return;
    const pageWindow = window.open('about:blank', '_blank');
    if (!pageWindow) {
      notifications.show({
        color: 'red',
        message: 'Impossibile aprire la Pagina: consenti i popup per questo sito.',
      });
      return;
    }
    pageWindow.opener = null;
    setShowPageLoadingGuid(row.guid);
    try {
      if (row.status === 'published') {
        const path = await resolvePublicPagePath(row);
        if (!path) {
          pageWindow.close();
          notifications.show({
            color: 'red',
            message: "Impossibile risolvere l'URL pubblico di questa Pagina",
          });
          return;
        }
        pageWindow.location.href = path;
      } else {
        const { token } = await issuePagePreviewToken(row.guid);
        pageWindow.location.href = `${PUBLIC_SITE_URL}/__preview/${token}`;
      }
    } catch (err) {
      pageWindow.close();
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, "Errore nell'apertura della Pagina"),
      });
    } finally {
      setShowPageLoadingGuid(null);
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
    {
      key: 'title',
      label: 'Titolo',
      render: (row) => (
        <Group gap={6} wrap="nowrap">
          <Text fw={600}>{row.title}</Text>
          {row.slug === 'home' && (
            <Badge color="green" size="sm" variant="light">
              HOME
            </Badge>
          )}
        </Group>
      ),
    },
    { key: 'slug', label: 'Slug', hideInCard: true },
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
        kpis={PAGE_STATUSES.map((status) => ({
          value: statusCounts[status] ?? 0,
          label: PAGE_STATUS_LABELS[status],
          color: PAGE_STATUS_COLORS[status] as any,
        }))}
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
                data={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value ?? '');
                  setPage(1);
                }}
                w={180}
                allowDeselect={false}
              />
              {isSuperAdmin && (
                <Button
                  variant="light"
                  leftSection={<IconRefresh size={16} />}
                  loading={rebuilding}
                  onClick={handleRebuildSite}
                >
                  Rigenera sito pubblico
                </Button>
              )}
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
                label: 'Mostra Pagina',
                icon: <IconEye size={16} />,
                onClick: (row) => void handleShowPage(row),
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
            label="Lingua"
            withAsterisk
            placeholder="it-IT"
            {...form.getInputProps('locale')}
          />
          <TextInput
            label="Pagina genitore (guid)"
            placeholder="lascia vuoto per una Pagina radice"
            {...form.getInputProps('parentGuid')}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              Template di partenza
            </Text>
            <TemplateSelectorGrid
              value={form.values.templateSlug}
              onChange={(slug) => form.setFieldValue('templateSlug', slug)}
            />
          </div>
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
