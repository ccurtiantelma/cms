/**
 * Dashboard "Parti del Sito" (RFC-40 Opzione B, restyle Elementor Pro Theme
 * Builder) — elenco dei Template di tema, filtrabile per tipo (sidebar "Site
 * Parts") e lingua, in vista Griglia o Tabella. Le sole azioni di scrittura
 * qui sono creazione, duplicazione, eliminazione ed edit delle
 * `displayConditions`; il contenuto a blocchi si modifica nell'Editor
 * (`/site-templates/:guid/builder`, non ancora costruito — la voce di menu
 * "Modifica nell'Editor" naviga lì per coerenza col naming già in uso da
 * `/global-sections/:guid/builder`, ma quella rotta non è nello scope di
 * questo task e non è registrata in `App.tsx`).
 *
 * `Header`/`Footer` non sono tipi di Template (`SiteTemplateType`,
 * `common/enums.ts` backend): restano su `global_sections` (ADR-40). La
 * sidebar li presenta comunque, come collegamento rapido a quella sezione,
 * non come filtro di questa lista.
 */
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Center,
  Group,
  Loader,
  NavLink,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAdjustments,
  IconApps,
  IconArticle,
  IconError404,
  IconFileText,
  IconLayoutBottombar,
  IconLayoutGrid,
  IconLayoutNavbar,
  IconPlus,
  IconRepeat,
  IconSearch,
  IconTable,
  IconTrash,
  IconWand,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../utils/api.utils';
import { getMultilingualConfigApi } from '../../services/settings.service';
import { useSiteTemplatesStore } from '../../hooks/useSiteTemplatesStore';
import {
  SITE_TEMPLATE_TYPE_LABELS,
  SITE_TEMPLATE_TYPES_COMING_SOON,
  type SiteTemplate,
  type SiteTemplateType,
} from '../../types/site-templates.types';
import PageHeader from '../../components/PageHeader';
import ContentCard from '../../components/ContentCard';
import ConfirmModal from '../../components/ConfirmModal';
import ResponsiveTable, { type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import TemplateCard from './components/TemplateCard';
import DisplayConditionsModal from './components/DisplayConditionsModal';
import CreateTemplateModal from './components/CreateTemplateModal';
import classes from './PageSiteTemplates.module.css';

/**
 * Tetto alle righe caricate in un colpo solo: nessuna paginazione richiesta
 * dalla spec di questa dashboard (stesso principio del tetto di
 * `PageGlobalSections.tsx`, `SLOT_OCCUPANTS_SCAN_LIMIT` — i Template di tema
 * sono per natura poche unità).
 */
const SITE_TEMPLATES_PAGE_SIZE = 100;

interface SitePartItem {
  key: SiteTemplateType | 'all';
  label: string;
  icon: TablerIcon;
}

const SITE_PART_ITEMS: SitePartItem[] = [
  { key: 'all', label: 'Tutte le parti', icon: IconApps },
  { key: 'single_page', label: SITE_TEMPLATE_TYPE_LABELS.single_page, icon: IconFileText },
  { key: 'search_results', label: SITE_TEMPLATE_TYPE_LABELS.search_results, icon: IconSearch },
  { key: 'loop_item', label: SITE_TEMPLATE_TYPE_LABELS.loop_item, icon: IconRepeat },
  { key: 'error_404', label: SITE_TEMPLATE_TYPE_LABELS.error_404, icon: IconError404 },
  { key: 'single_post', label: SITE_TEMPLATE_TYPE_LABELS.single_post, icon: IconArticle },
  { key: 'archive', label: SITE_TEMPLATE_TYPE_LABELS.archive, icon: IconRepeat },
];

/** Pagina Dashboard "Parti del Sito" (Template Editor, F09). */
export default function PageSiteTemplates(): JSX.Element {
  const navigate = useNavigate();

  const templates = useSiteTemplatesStore((state) => state.templates);
  const filterType = useSiteTemplatesStore((state) => state.filterType);
  const filterLang = useSiteTemplatesStore((state) => state.filterLang);
  const isLoading = useSiteTemplatesStore((state) => state.isLoading);
  const fetchTemplates = useSiteTemplatesStore((state) => state.fetchTemplates);
  const createTemplate = useSiteTemplatesStore((state) => state.createTemplate);
  const deleteTemplate = useSiteTemplatesStore((state) => state.deleteTemplate);

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [activeLocales, setActiveLocales] = useState<string[]>([]);
  const [createOpened, setCreateOpened] = useState(false);
  const [conditionsGuid, setConditionsGuid] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SiteTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void fetchTemplates({ i: SITE_TEMPLATES_PAGE_SIZE });
    getMultilingualConfigApi()
      .then((config) => setActiveLocales(config.active))
      .catch((err) => {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel caricamento delle lingue attive'),
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ricarica l'elenco applicando tipo/lingua correnti (fotografia dello store). */
  function reload(type: SiteTemplateType | 'all', language: string): void {
    void fetchTemplates({
      i: SITE_TEMPLATES_PAGE_SIZE,
      type: type === 'all' ? undefined : type,
      language: language || undefined,
    });
  }

  function handleEdit(template: SiteTemplate): void {
    navigate(`/site-templates/${template.guid}/builder`);
  }

  /** Crea un nuovo Template come copia integrale di uno esistente — sempre bozza, mai pubblicata a sua insaputa. */
  async function handleDuplicate(template: SiteTemplate): Promise<void> {
    await createTemplate({
      title: `${template.title} (copia)`,
      type: template.type,
      language: template.language,
      priority: template.priority,
      contentTree: template.contentTree,
      displayConditions: template.displayConditions,
      isPublished: false,
    });
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTemplate(deleteTarget.guid);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const columns: ResponsiveTableColumn<SiteTemplate>[] = [
    { key: 'title', label: 'Titolo' },
    { key: 'type', label: 'Tipo', render: (row) => SITE_TEMPLATE_TYPE_LABELS[row.type] },
    {
      key: 'language',
      label: 'Lingua',
      hideInCard: true,
      render: (row) => row.language.toUpperCase(),
    },
    {
      key: 'isPublished',
      label: 'Stato',
      render: (row) => (
        <Badge
          color={row.isPublished ? 'green' : 'gray'}
          variant={row.isPublished ? 'filled' : 'light'}
        >
          {row.isPublished ? 'Pubblicato' : 'Bozza'}
        </Badge>
      ),
    },
    { key: 'priority', label: 'Priorità', hideInCard: true },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Parti del Sito' }]}
        title="Parti globali del tuo sito"
        kpis={[{ value: templates.length, label: 'Template', icon: IconLayoutGrid }]}
      />

      <div className={classes.layout}>
        <aside className={classes.sidebar}>
          <Text className={classes.sidebarTitle}>Site Parts</Text>
          <div className={classes.sidebarList}>
            {SITE_PART_ITEMS.map((item) => {
              const comingSoon =
                item.key !== 'all' && SITE_TEMPLATE_TYPES_COMING_SOON.has(item.key);
              return (
                <NavLink
                  key={item.key}
                  className={classes.navItem}
                  label={item.label}
                  leftSection={<item.icon size={16} />}
                  rightSection={
                    comingSoon ? (
                      <Badge size="xs" variant="light" color="gray">
                        In arrivo
                      </Badge>
                    ) : undefined
                  }
                  active={filterType === item.key}
                  disabled={comingSoon}
                  onClick={() => reload(item.key, filterLang)}
                />
              );
            })}
          </div>

          <Text className={classes.sidebarTitle} mt="md">
            Sezioni Globali
          </Text>
          <div className={classes.sidebarList}>
            <NavLink
              className={classes.navItem}
              component={Link}
              to="/global-sections"
              label="Header"
              leftSection={<IconLayoutNavbar size={16} />}
            />
            <NavLink
              className={classes.navItem}
              component={Link}
              to="/global-sections"
              label="Footer"
              leftSection={<IconLayoutBottombar size={16} />}
            />
          </div>
        </aside>

        <div className={classes.main}>
          <div className={classes.toolbar}>
            <Select
              placeholder="Tutte le lingue"
              data={activeLocales}
              value={filterLang || null}
              onChange={(value) => reload(filterType, value ?? '')}
              clearable
              w={160}
              aria-label="Filtra per lingua"
            />
            <SegmentedControl
              value={viewMode}
              onChange={(value) => setViewMode(value as 'grid' | 'table')}
              data={[
                { value: 'grid', label: <IconLayoutGrid size={16} /> },
                { value: 'table', label: <IconTable size={16} /> },
              ]}
              aria-label="Modalità vista"
            />
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateOpened(true)}
              className={classes.addButton}
            >
              Aggiungi Nuovo
            </Button>
          </div>

          <ContentCard>
            {isLoading ? (
              <Center py="xl">
                <Loader />
              </Center>
            ) : templates.length === 0 ? (
              <Text ta="center" c="dimmed" size="sm" py="xl">
                Nessun Template di tema trovato
              </Text>
            ) : viewMode === 'grid' ? (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.guid}
                    template={template}
                    onEdit={handleEdit}
                    onDisplayConditions={(t) => setConditionsGuid(t.guid)}
                    onDuplicate={(t) => void handleDuplicate(t)}
                    onDelete={(t) => setDeleteTarget(t)}
                  />
                ))}
              </SimpleGrid>
            ) : (
              <ScrollArea offsetScrollbars>
                <ResponsiveTable<SiteTemplate>
                  data={templates}
                  columns={columns}
                  rowKey={(row) => row.guid}
                  cardHeader={(row) => (
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600}>{row.title}</Text>
                    </Group>
                  )}
                  actions={[
                    {
                      label: "Modifica nell'Editor",
                      icon: <IconWand size={16} />,
                      onClick: handleEdit,
                    },
                    {
                      label: 'Condizioni di visualizzazione',
                      icon: <IconAdjustments size={16} />,
                      onClick: (row) => setConditionsGuid(row.guid),
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
            )}
          </ContentCard>
        </div>
      </div>

      <CreateTemplateModal opened={createOpened} onClose={() => setCreateOpened(false)} />

      <DisplayConditionsModal
        opened={conditionsGuid !== null}
        onClose={() => setConditionsGuid(null)}
        guid={conditionsGuid}
      />

      <ConfirmModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
        loading={deleting}
        title="Conferma Eliminazione"
        confirmLabel="Elimina"
        confirmColor="red"
      >
        Eliminare il Template di tema <strong>{deleteTarget?.title}</strong>? L&apos;operazione è
        un&apos;eliminazione soft (la riga resta recuperabile lato dati).
      </ConfirmModal>
    </div>
  );
}
