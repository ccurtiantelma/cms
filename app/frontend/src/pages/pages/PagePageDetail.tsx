/**
 * Dettaglio Pagina (F01/T8): metadati + SEO/GEO (editabili), contenuto in
 * sola lettura, cambio di stato secondo la macchina a stati esatta di
 * `pages.state-machine.ts`, cronologia Revisioni + ripristino in nuova
 * bozza. NON è l'editor visivo dei blocchi (F04, `PagePageEditor.tsx`, raggiungibile
 * dal tab "Contenuto"): il campo `draftContent` è qui mostrato, mai modificato.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Center,
  Code,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconCirclePlus,
  IconEye,
  IconHistory,
  IconLayoutGrid,
  IconRefresh,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { Link, useParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { getErrorMessage } from '../../utils/api.utils';
import type { PaginationParams } from '../../types/common.types';
import {
  changePageStatus,
  fetchPage,
  fetchPageRevisions,
  getPageRevision,
  restorePageRevision,
  updatePage,
} from '../../services/pages.service';
import {
  PAGE_STATUS_COLORS,
  PAGE_STATUS_LABELS,
  PAGE_STATUS_TRANSITIONS,
  type ChangeStatusPayload,
  type PageFaqEntry,
  type PageRecord,
  type PageRevisionDetail,
  type PageRevisionSummary,
  type PageStatus,
  type PagesErrorData,
  type UpdatePagePayload,
} from '../../types/pages.types';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import PageHeader from '../../components/PageHeader';
import PageNotFound from '../../components/PageNotFound';
import ContentCard from '../../components/ContentCard';
import ListToolbar from '../../components/ListToolbar';
import ResponsiveTable, { type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import ConfirmModal from '../../components/ConfirmModal';

/** Etichetta azione per ogni stato di destinazione (macchina a stati). */
const STATUS_ACTION_LABELS: Record<PageStatus, string> = {
  draft: 'Riporta in bozza',
  review: 'Invia in revisione',
  scheduled: 'Programma pubblicazione',
  published: 'Pubblica',
  archived: 'Archivia',
};

/** Blocco dell'albero contenuto — sola lettura, forma non validata qui (F04 non è in scope). */
interface ContentBlockNode {
  id?: unknown;
  type?: unknown;
  children?: ContentBlockNode[];
}

/** Valori del form Metadati + SEO/GEO (locale e contenuto non sono editabili qui). */
interface MetadataFormValues {
  title: string;
  slug: string;
  parentGuid: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  robotsIndex: string;
  robotsFollow: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  aiSummary: string;
  keyFacts: string;
  entities: string;
  aiPolicyAllowed: boolean;
  faq: PageFaqEntry[];
}

/** Conta ricorsivamente i blocchi dell'albero contenuto (sola lettura). */
function countBlocks(blocks: ContentBlockNode[] | undefined): number {
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce(
    (acc, block) =>
      acc + 1 + countBlocks(Array.isArray(block.children) ? block.children : undefined),
    0,
  );
}

/** Divide un testo multi-riga in un array di stringhe non vuote, o `undefined` se vuoto. */
function linesToArray(text: string): string[] | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : undefined;
}

/** Formatta una data ISO nel formato locale italiano (data + ora). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('it-IT');
}

/** Legge un campo stringa da `draftSeo` (oggetto non tipizzato — contratto SEO libero). */
function seoString(seo: Record<string, unknown>, key: string): string {
  const value = seo[key];
  return typeof value === 'string' ? value : '';
}

/** Legge un campo array-di-stringhe da `draftSeo`, unendo le righe per la textarea. */
function seoLines(seo: Record<string, unknown>, key: string): string {
  const value = seo[key];
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string').join('\n')
    : '';
}

/** Legge l'elenco FAQ da `draftSeo`. */
function seoFaq(seo: Record<string, unknown>): PageFaqEntry[] {
  const value = seo.faq;
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      question: typeof entry.question === 'string' ? entry.question : '',
      answer: typeof entry.answer === 'string' ? entry.answer : '',
    }));
}

/** Ricostruisce i valori del form Metadati + SEO a partire da una `PageRecord`. */
function pageToFormValues(page: PageRecord): MetadataFormValues {
  const seo = page.draftSeo ?? {};
  return {
    title: page.title,
    slug: page.slug,
    parentGuid: page.parentGuid ?? '',
    metaTitle: seoString(seo, 'metaTitle'),
    metaDescription: seoString(seo, 'metaDescription'),
    canonicalUrl: seoString(seo, 'canonicalUrl'),
    robotsIndex: seoString(seo, 'robotsIndex') || 'index',
    robotsFollow: seoString(seo, 'robotsFollow') || 'follow',
    ogTitle: seoString(seo, 'ogTitle'),
    ogDescription: seoString(seo, 'ogDescription'),
    ogImage: seoString(seo, 'ogImage'),
    aiSummary: seoString(seo, 'aiSummary'),
    keyFacts: seoLines(seo, 'keyFacts'),
    entities: seoLines(seo, 'entities'),
    aiPolicyAllowed: seo.aiPolicyAllowed !== false,
    faq: seoFaq(seo),
  };
}

/** Elenco ricorsivo (sola lettura) dell'albero blocchi — nessun rendering di contenuto (F04 fuori scope). */
function BlockTreeReadOnly({ blocks }: { blocks: ContentBlockNode[] }): JSX.Element {
  return (
    <Box component="ul" pl="md">
      {blocks.map((block, index) => {
        const key = typeof block.id === 'string' ? block.id : `${index}`;
        const children = Array.isArray(block.children) ? block.children : [];
        return (
          <Box component="li" key={key}>
            <Text size="sm">
              <Code>{typeof block.type === 'string' ? block.type : 'sconosciuto'}</Code>{' '}
              <Text span c="dimmed" size="xs">
                ({key}, {children.length} figli)
              </Text>
            </Text>
            {children.length > 0 && <BlockTreeReadOnly blocks={children} />}
          </Box>
        );
      })}
    </Box>
  );
}

/** Pagina di dettaglio di una Pagina (chrome amministrativa, F01/T8). */
export default function PagePageDetail(): JSX.Element {
  const { guid } = useParams<{ guid: string }>();

  const [page, setPage] = useState<PageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [transitionTarget, setTransitionTarget] = useState<PageStatus | null>(null);
  const [scheduleOpened, setScheduleOpened] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);

  const [restoreTarget, setRestoreTarget] = useState<PageRevisionSummary | null>(null);
  const [viewRevision, setViewRevision] = useState<PageRevisionDetail | null>(null);
  const [viewRevisionLoading, setViewRevisionLoading] = useState(false);

  const form = useForm<MetadataFormValues>({
    mode: 'controlled',
    initialValues: pageToFormValues({
      guid: '',
      title: '',
      slug: '',
      locale: '',
      parentGuid: null,
      translationGroupId: '',
      status: 'draft',
      publishedAt: null,
      scheduledAt: null,
      draftContent: {},
      draftSeo: {},
      version: 1,
      createdAt: '',
      updatedAt: '',
    }),
    validate: {
      title: (value) => (value.trim().length === 0 ? 'Titolo obbligatorio' : null),
      slug: (value) => (value.trim().length === 0 ? 'Slug obbligatorio' : null),
    },
  });

  /** Ricarica la Pagina dal backend — usata al mount e per recuperare da un 409. */
  const loadPage = useCallback(async (): Promise<void> => {
    if (!guid) return;
    setLoading(true);
    try {
      const data = await fetchPage(guid);
      setPage(data);
      setNotFound(false);
    } catch (err) {
      const error = err as AxiosError;
      if (error.response?.status === 404) {
        setNotFound(true);
      } else {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel caricamento della Pagina'),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [guid]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (page) form.setValues(pageToFormValues(page));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const revisionsFetcher = useCallback(
    (params: PaginationParams) => fetchPageRevisions(guid ?? '', params),
    [guid],
  );
  const {
    records: revisions,
    total: revisionsTotal,
    totalPages: revisionsTotalPages,
    page: revisionsPage,
    setPage: setRevisionsPage,
    limit: revisionsLimit,
    setLimit: setRevisionsLimit,
    loading: revisionsLoading,
  } = usePaginatedList<PageRevisionSummary>(revisionsFetcher, {
    errorMessage: 'Errore nel caricamento delle Revisioni',
    enabled: !!guid,
  });

  /**
   * Notifica dedicata di conflitto di editing (`409 PAGE_VERSION_CONFLICT`),
   * distinta dal conflitto di slug duplicato: mai sovrascrittura silenziosa,
   * offre sempre di ricaricare la bozza corrente.
   */
  function notifyVersionConflict(): void {
    notifications.show({
      color: 'orange',
      autoClose: false,
      title: 'Conflitto di editing',
      message: (
        <Stack gap={4}>
          <Text size="sm">
            La pagina è stata modificata da un altro utente. Le modifiche non sono state salvate.
          </Text>
          <Button size="xs" variant="light" onClick={() => void loadPage()}>
            Ricarica la Pagina
          </Button>
        </Stack>
      ),
    });
  }

  /** Salva titolo/slug/genitore + SEO/GEO (`PATCH /app/pages/:guid`, lock ottimistico). */
  async function handleMetadataSubmit(values: MetadataFormValues): Promise<void> {
    if (!page) return;
    setSubmitting(true);
    try {
      const payload: UpdatePagePayload = {
        version: page.version,
        title: values.title.trim(),
        slug: values.slug.trim(),
        parentGuid: values.parentGuid.trim() ? values.parentGuid.trim() : null,
        draftSeo: {
          metaTitle: values.metaTitle.trim() || undefined,
          metaDescription: values.metaDescription.trim() || undefined,
          canonicalUrl: values.canonicalUrl.trim() || undefined,
          robotsIndex: values.robotsIndex as 'index' | 'noindex',
          robotsFollow: values.robotsFollow as 'follow' | 'nofollow',
          ogTitle: values.ogTitle.trim() || undefined,
          ogDescription: values.ogDescription.trim() || undefined,
          ogImage: values.ogImage.trim() || undefined,
          aiSummary: values.aiSummary.trim() || undefined,
          keyFacts: linesToArray(values.keyFacts),
          entities: linesToArray(values.entities),
          aiPolicyAllowed: values.aiPolicyAllowed,
          faq: values.faq.filter((f) => (f.question ?? '').trim() || (f.answer ?? '').trim()),
        },
      };
      const updated = await updatePage(page.guid, payload);
      setPage(updated);
      notifications.show({ color: 'green', message: 'Pagina aggiornata con successo' });
    } catch (err) {
      const error = err as AxiosError<PagesErrorData>;
      const code = error.response?.data?.code;
      if (code === 'PAGE_VERSION_CONFLICT') {
        notifyVersionConflict();
      } else if (code === 'PAGE_SLUG_DUPLICATE') {
        form.setFieldError('slug', 'Slug già in uso per questo locale/genitore');
      } else {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, "Errore nell'aggiornamento della Pagina"),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** Esegue la transizione di stato (`POST /app/pages/:guid/status`). */
  async function doChangeStatus(target: PageStatus, scheduledAtIso?: string): Promise<void> {
    if (!page) return;
    setSubmitting(true);
    try {
      const payload: ChangeStatusPayload = { status: target, scheduledAt: scheduledAtIso };
      const updated = await changePageStatus(page.guid, payload);
      setPage(updated);
      notifications.show({
        color: 'green',
        message: `Stato aggiornato a "${PAGE_STATUS_LABELS[target]}"`,
      });
      setTransitionTarget(null);
      setScheduleOpened(false);
      setScheduledAt(null);
    } catch (err) {
      const error = err as AxiosError<PagesErrorData>;
      const code = error.response?.data?.code;
      if (code === 'PAGE_VERSION_CONFLICT') {
        notifyVersionConflict();
        setTransitionTarget(null);
        setScheduleOpened(false);
      } else if (error.response?.status === 400 && error.response.data?.details?.transition) {
        notifications.show({
          color: 'red',
          message: `Transizione non ammessa: ${error.response.data.details.transition}`,
        });
      } else {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel cambio di stato'),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** Ripristina la Revisione selezionata in una nuova bozza (Manager+). */
  async function handleRestoreConfirm(): Promise<void> {
    if (!page || !restoreTarget) return;
    setSubmitting(true);
    try {
      const updated = await restorePageRevision(page.guid, restoreTarget.guid);
      setPage(updated);
      notifications.show({
        color: 'green',
        message: 'Bozza ripristinata dalla Revisione selezionata',
      });
      setRestoreTarget(null);
    } catch (err) {
      const error = err as AxiosError<PagesErrorData>;
      if (error.response?.data?.code === 'PAGE_VERSION_CONFLICT') {
        notifyVersionConflict();
        setRestoreTarget(null);
      } else {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel ripristino della Revisione'),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** Carica e mostra lo snapshot completo di una Revisione. */
  async function handleViewRevision(revision: PageRevisionSummary): Promise<void> {
    if (!page) return;
    setViewRevisionLoading(true);
    try {
      const detail = await getPageRevision(page.guid, revision.guid);
      setViewRevision(detail);
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nel caricamento della Revisione'),
      });
    } finally {
      setViewRevisionLoading(false);
    }
  }

  if (notFound) return <PageNotFound />;

  if (loading || !page) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  const status = page.status as PageStatus;
  const allowedTransitions = PAGE_STATUS_TRANSITIONS[status] ?? [];
  const contentTree = (page.draftContent?.blocks as ContentBlockNode[] | undefined) ?? [];
  const blockCount = countBlocks(contentTree);

  const revisionColumns: ResponsiveTableColumn<PageRevisionSummary>[] = [
    { key: 'revisionNumber', label: '#', hideInCard: true },
    { key: 'title', label: 'Titolo' },
    { key: 'slug', label: 'Slug', hideInCard: true },
    { key: 'authorName', label: 'Autore' },
    { key: 'createdAt', label: 'Data', render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Pagine', href: '/pages' }, { label: page.title }]}
        title={page.title}
        subtitle={`/${page.slug} · ${page.locale}`}
      />

      <ContentCard>
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <Badge color={PAGE_STATUS_COLORS[status] ?? 'gray'} size="lg">
              {PAGE_STATUS_LABELS[status] ?? status}
            </Badge>
            <Text size="sm" c="dimmed">
              Versione {page.version} · Aggiornata {formatDate(page.updatedAt)}
            </Text>
          </Group>
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            onClick={() => void loadPage()}
          >
            Ricarica
          </Button>
        </Group>

        <Tabs defaultValue="metadata" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="metadata">Metadati &amp; SEO</Tabs.Tab>
            <Tabs.Tab value="content">Contenuto</Tabs.Tab>
            <Tabs.Tab value="status">Stato</Tabs.Tab>
            <Tabs.Tab value="revisions" leftSection={<IconHistory size={14} />}>
              Revisioni
            </Tabs.Tab>
          </Tabs.List>

          {/* --- Metadati + SEO/GEO --- */}
          <Tabs.Panel value="metadata" pt="md">
            <form onSubmit={form.onSubmit((values) => void handleMetadataSubmit(values))}>
              <Stack gap="lg">
                <Stack gap="sm">
                  <Title order={4}>Metadati</Title>
                  <TextInput label="Titolo" withAsterisk {...form.getInputProps('title')} />
                  <TextInput label="Slug" withAsterisk {...form.getInputProps('slug')} />
                  <TextInput
                    label="Locale"
                    value={page.locale}
                    disabled
                    description="Non modificabile dopo la creazione (F05)"
                  />
                  <TextInput
                    label="Pagina genitore (guid)"
                    placeholder="lascia vuoto per spostare in radice"
                    {...form.getInputProps('parentGuid')}
                  />
                </Stack>

                <Divider />

                <Stack gap="sm">
                  <Title order={4}>SEO</Title>
                  <TextInput label="Meta title" {...form.getInputProps('metaTitle')} />
                  <Textarea
                    label="Meta description"
                    autosize
                    minRows={2}
                    {...form.getInputProps('metaDescription')}
                  />
                  <TextInput label="URL canonica" {...form.getInputProps('canonicalUrl')} />
                  <Group grow>
                    <Select
                      label="Indicizzazione"
                      data={[
                        { value: 'index', label: 'index' },
                        { value: 'noindex', label: 'noindex' },
                      ]}
                      allowDeselect={false}
                      {...form.getInputProps('robotsIndex')}
                    />
                    <Select
                      label="Crawling link"
                      data={[
                        { value: 'follow', label: 'follow' },
                        { value: 'nofollow', label: 'nofollow' },
                      ]}
                      allowDeselect={false}
                      {...form.getInputProps('robotsFollow')}
                    />
                  </Group>
                  <TextInput label="Open Graph — titolo" {...form.getInputProps('ogTitle')} />
                  <Textarea
                    label="Open Graph — descrizione"
                    autosize
                    minRows={2}
                    {...form.getInputProps('ogDescription')}
                  />
                  <TextInput
                    label="Open Graph — immagine (URL)"
                    {...form.getInputProps('ogImage')}
                  />
                </Stack>

                <Divider />

                <Stack gap="sm">
                  <Title order={4}>GEO (motori generativi)</Title>
                  <Textarea
                    label="Riassunto sintetico (aiSummary)"
                    autosize
                    minRows={2}
                    {...form.getInputProps('aiSummary')}
                  />
                  <Textarea
                    label="Affermazioni chiave (una per riga)"
                    autosize
                    minRows={2}
                    {...form.getInputProps('keyFacts')}
                  />
                  <Textarea
                    label="Entità/argomenti (uno per riga)"
                    autosize
                    minRows={2}
                    {...form.getInputProps('entities')}
                  />
                  <Switch
                    label="Consenti l'uso del contenuto da parte dei crawler AI"
                    {...form.getInputProps('aiPolicyAllowed', { type: 'checkbox' })}
                  />

                  <Text fw={500} size="sm">
                    FAQ
                  </Text>
                  <Stack gap="xs">
                    {form.getValues().faq.map((_, index) => (
                      <Group key={index} align="flex-start" wrap="nowrap">
                        <Stack gap={4} style={{ flex: 1 }}>
                          <TextInput
                            placeholder="Domanda"
                            {...form.getInputProps(`faq.${index}.question`)}
                          />
                          <Textarea
                            placeholder="Risposta"
                            autosize
                            minRows={1}
                            {...form.getInputProps(`faq.${index}.answer`)}
                          />
                        </Stack>
                        <Button
                          variant="subtle"
                          color="red"
                          px="xs"
                          onClick={() => form.removeListItem('faq', index)}
                          aria-label="Rimuovi FAQ"
                        >
                          <IconTrash size={16} />
                        </Button>
                      </Group>
                    ))}
                    <Button
                      variant="light"
                      leftSection={<IconCirclePlus size={16} />}
                      onClick={() => form.insertListItem('faq', { question: '', answer: '' })}
                      w="fit-content"
                    >
                      Aggiungi FAQ
                    </Button>
                  </Stack>
                </Stack>

                <Group justify="flex-end">
                  <Button type="submit" loading={submitting} disabled={!form.isValid()}>
                    Salva
                  </Button>
                </Group>
              </Stack>
            </form>
          </Tabs.Panel>

          {/* --- Contenuto (sola lettura: la modifica avviene nell'editor visivo, F04) --- */}
          <Tabs.Panel value="content" pt="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {blockCount} {blockCount === 1 ? 'blocco' : 'blocchi'} nell&apos;albero contenuto.
                </Text>
                <Button
                  component={Link}
                  to={`/pages/${page.guid}/editor`}
                  leftSection={<IconLayoutGrid size={16} />}
                >
                  Apri editor
                </Button>
              </Group>
              {contentTree.length > 0 ? (
                <BlockTreeReadOnly blocks={contentTree} />
              ) : (
                <Text size="sm" c="dimmed">
                  Albero contenuto vuoto.
                </Text>
              )}
              <Divider label="JSON grezzo" labelPosition="left" />
              <ScrollArea.Autosize mah={400}>
                <Code block>{JSON.stringify(page.draftContent, null, 2)}</Code>
              </ScrollArea.Autosize>
            </Stack>
          </Tabs.Panel>

          {/* --- Cambio di stato --- */}
          <Tabs.Panel value="status" pt="md">
            <Stack gap="md">
              <Text size="sm">
                Stato corrente:{' '}
                <Badge color={PAGE_STATUS_COLORS[status]}>{PAGE_STATUS_LABELS[status]}</Badge>
              </Text>
              {allowedTransitions.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Nessuna transizione ammessa da questo stato.
                </Text>
              ) : (
                <Group>
                  {allowedTransitions.map((target) => (
                    <Button
                      key={target}
                      variant="light"
                      color={PAGE_STATUS_COLORS[target]}
                      onClick={() => {
                        if (target === 'scheduled') {
                          setScheduledAt(null);
                          setScheduleOpened(true);
                        } else {
                          setTransitionTarget(target);
                        }
                      }}
                    >
                      {STATUS_ACTION_LABELS[target]}
                    </Button>
                  ))}
                </Group>
              )}
            </Stack>
          </Tabs.Panel>

          {/* --- Cronologia Revisioni + ripristino --- */}
          <Tabs.Panel value="revisions" pt="md">
            <Stack gap="sm">
              <ListToolbar
                state={{
                  page: revisionsPage,
                  setPage: setRevisionsPage,
                  totalPages: revisionsTotalPages,
                  limit: revisionsLimit,
                  setLimit: setRevisionsLimit,
                  total: revisionsTotal,
                  search: '',
                  setSearch: () => undefined,
                }}
                hideSearch
              />
              <ScrollArea offsetScrollbars>
                <ResponsiveTable<PageRevisionSummary>
                  data={revisions}
                  loading={revisionsLoading}
                  rowKey={(row) => row.guid}
                  columns={revisionColumns}
                  emptyText="Nessuna Revisione pubblicata"
                  actions={[
                    {
                      label: 'Vedi',
                      icon: <IconEye size={16} />,
                      onClick: (row) => void handleViewRevision(row),
                    },
                    {
                      label: 'Ripristina in nuova bozza',
                      icon: <IconRestore size={16} />,
                      color: 'orange',
                      onClick: (row) => setRestoreTarget(row),
                    },
                  ]}
                />
              </ScrollArea>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </ContentCard>

      {/* Modal conferma transizione di stato (tutte tranne "scheduled"). */}
      <ConfirmModal
        opened={!!transitionTarget}
        onClose={() => setTransitionTarget(null)}
        onConfirm={() => transitionTarget && void doChangeStatus(transitionTarget)}
        loading={submitting}
        title="Conferma cambio di stato"
        confirmLabel={transitionTarget ? STATUS_ACTION_LABELS[transitionTarget] : 'Conferma'}
      >
        {transitionTarget === 'published' && (
          <>
            Pubblicare questa Pagina creerà una nuova Revisione immutabile e sostituirà
            immediatamente il contenuto pubblicato online.
          </>
        )}
        {transitionTarget === 'archived' && (
          <>La Pagina non sarà più raggiungibile pubblicamente.</>
        )}
        {transitionTarget === 'draft' && (
          <>
            La bozza tornerà modificabile. Se la Pagina era pubblicata, il contenuto pubblicato
            resta online finché non ripubblichi.
          </>
        )}
        {transitionTarget === 'review' && <>La bozza verrà inviata in revisione.</>}
      </ConfirmModal>

      {/* Modal programmazione pubblicazione: richiede data/ora futura. */}
      <Modal
        opened={scheduleOpened}
        onClose={() => setScheduleOpened(false)}
        title="Programma pubblicazione"
        centered
      >
        <Stack gap="md">
          <DateTimePicker
            label="Data e ora di pubblicazione"
            placeholder="Scegli data e ora"
            value={scheduledAt}
            onChange={(value) => setScheduledAt(value ? new Date(value) : null)}
            minDate={new Date()}
            withAsterisk
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setScheduleOpened(false)}
              disabled={submitting}
            >
              Annulla
            </Button>
            <Button
              loading={submitting}
              disabled={!scheduledAt}
              onClick={() =>
                scheduledAt && void doChangeStatus('scheduled', scheduledAt.toISOString())
              }
            >
              Programma
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal conferma ripristino Revisione — nuova bozza, non ripubblica. */}
      <ConfirmModal
        opened={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleRestoreConfirm}
        loading={submitting}
        title="Conferma ripristino Revisione"
        confirmLabel="Ripristina"
        confirmColor="orange"
      >
        Ripristinare la Revisione #{restoreTarget?.revisionNumber} ({restoreTarget?.title}) creerà
        una NUOVA bozza con questo contenuto. La Revisione pubblicata online e la Pagina
        eventualmente pubblicata restano invariate finché non ripubblichi esplicitamente.
      </ConfirmModal>

      {/* Modal visualizzazione snapshot Revisione (sola lettura). */}
      <Modal
        opened={!!viewRevision || viewRevisionLoading}
        onClose={() => setViewRevision(null)}
        title={viewRevision ? `Revisione #${viewRevision.revisionNumber}` : 'Caricamento…'}
        size="lg"
      >
        {viewRevisionLoading && !viewRevision && (
          <Center py="lg">
            <Loader size="sm" />
          </Center>
        )}
        {viewRevision && (
          <Stack gap="sm">
            <Text size="sm">
              <strong>{viewRevision.title}</strong> · /{viewRevision.slug} ·{' '}
              {formatDate(viewRevision.createdAt)} · {viewRevision.authorName}
            </Text>
            <Divider label="Contenuto" labelPosition="left" />
            <ScrollArea.Autosize mah={300}>
              <Code block>{JSON.stringify(viewRevision.content, null, 2)}</Code>
            </ScrollArea.Autosize>
            <Divider label="SEO/GEO" labelPosition="left" />
            <ScrollArea.Autosize mah={200}>
              <Code block>{JSON.stringify(viewRevision.seo, null, 2)}</Code>
            </ScrollArea.Autosize>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
