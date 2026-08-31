/**
 * Elenco Sezioni Globali (F06, ADR-40) — stesso pattern CRUD di `PagePages`
 * (`ResponsiveTable` + `ListToolbar` + `usePaginatedList`). Qui si gestiscono
 * solo i **meta-dati** (titolo, slug, slot di layout): il contenuto a blocchi
 * si modifica nel Visual Builder, raggiunto dall'azione "Apri nel Builder"
 * (`/global-sections/:guid/builder`).
 *
 * L'unicità di `header`/`footer` fra le righe attive è un vincolo di database
 * (indice parziale, ADR-40): l'autorità resta il `409
 * GLOBAL_SECTION_LAYOUT_SLOT_TAKEN` del server, mai una SELECT preventiva.
 * Questa pagina si limita a *mostrare* l'occupante corrente di ciascuno slot
 * e a disabilitarne la scelta, così l'utente non incappa in un errore che era
 * già noto — ma se la fotografia è stale (un altro editor ha assegnato lo slot
 * nel frattempo) è il `409` a fermare la scrittura, non questa UI.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Checkbox, ScrollArea, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconLayoutNavbar,
  IconPencil,
  IconTrash,
  IconWand,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { getErrorMessage } from '../../utils/api.utils';
import {
  createGlobalSection,
  deleteGlobalSection,
  fetchGlobalSections,
  updateGlobalSection,
} from '../../services/global-sections.service';
import {
  GLOBAL_SECTION_LAYOUT_SLOTS,
  LAYOUT_SLOT_COLORS,
  LAYOUT_SLOT_LABELS,
  type GlobalSectionLayoutSlot,
  type GlobalSectionRecord,
} from '../../types/global-sections.types';
import ListToolbar from '../../components/ListToolbar';
import PageHeader from '../../components/PageHeader';
import ContentCard from '../../components/ContentCard';
import ResponsiveTable, { type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import ColumnSelector from '../../components/ColumnSelector';
import ConfirmModal from '../../components/ConfirmModal';
import FormDrawer from '../../components/FormDrawer';

/** Colonne ordinabili lato API (`o=` — vedi `GlobalSectionsController_findAll`). */
const GLOBAL_SECTIONS_SORTABLE: (keyof GlobalSectionRecord)[] = [
  'title',
  'slug',
  'layoutSlot',
  'createdAt',
  'updatedAt',
];

/**
 * Tetto alle righe ispezionate per sapere **chi** occupa `header`/`footer`.
 * Le Sezioni Globali sono per natura poche unità (ADR-40: gli slot pubblici
 * sono e restano due); oltre questo tetto la UI smette semplicemente di
 * pre-avvisare e l'unica barriera resta il `409` del server, che è comunque
 * quella vera.
 */
const SLOT_OCCUPANTS_SCAN_LIMIT = 100;

/** Occupante corrente di ciascuno slot innestabile (`undefined` = slot libero). */
type SlotOccupants = Partial<Record<Exclude<GlobalSectionLayoutSlot, 'none'>, GlobalSectionRecord>>;

/** Valori del form meta-dati (creazione e modifica condividono la stessa forma). */
interface GlobalSectionFormValues {
  title: string;
  slug: string;
  layoutSlot: GlobalSectionLayoutSlot;
  isSticky: boolean;
}

const EMPTY_FORM: GlobalSectionFormValues = {
  title: '',
  slug: '',
  layoutSlot: 'none',
  isSticky: false,
};

/** Formatta una data ISO nel formato locale italiano (data + ora). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('it-IT');
}

/** Pagina elenco Sezioni Globali (chrome amministrativa, F06). */
export default function PageGlobalSections(): JSX.Element {
  const navigate = useNavigate();

  const [formOpened, setFormOpened] = useState(false);
  /** Riga in modifica; `null` = il drawer è aperto in creazione. */
  const [editTarget, setEditTarget] = useState<GlobalSectionRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlobalSectionRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slotOccupants, setSlotOccupants] = useState<SlotOccupants>({});

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
  } = usePaginatedList<GlobalSectionRecord, Record<string, never>>(fetchGlobalSections, {
    errorMessage: 'Errore nel caricamento delle Sezioni Globali',
  });

  /**
   * Rilegge chi occupa `header` e `footer` indipendentemente da pagina/ricerca
   * correnti della tabella: l'occupante può benissimo non essere fra le righe
   * visibili. Fallisce in silenzio (nessuna notifica): è un aiuto alla UI, non
   * un dato di cui la pagina ha bisogno per funzionare.
   */
  const reloadSlotOccupants = useCallback(async (): Promise<void> => {
    try {
      const { items } = await fetchGlobalSections({ p: 1, i: SLOT_OCCUPANTS_SCAN_LIMIT });
      const next: SlotOccupants = {};
      for (const item of items) {
        if (item.layoutSlot !== 'none') next[item.layoutSlot] = item;
      }
      setSlotOccupants(next);
    } catch {
      setSlotOccupants({});
    }
  }, []);

  useEffect(() => {
    void reloadSlotOccupants();
  }, [reloadSlotOccupants]);

  const form = useForm<GlobalSectionFormValues>({
    mode: 'controlled',
    initialValues: EMPTY_FORM,
    validate: {
      title: (value) => (value.trim().length === 0 ? 'Titolo obbligatorio' : null),
    },
  });

  function openCreate(): void {
    setEditTarget(null);
    form.setValues(EMPTY_FORM);
    setFormOpened(true);
  }

  function openEdit(row: GlobalSectionRecord): void {
    setEditTarget(row);
    form.setValues({
      title: row.title,
      slug: row.slug,
      layoutSlot: row.layoutSlot,
      isSticky: row.isSticky ?? false,
    });
    setFormOpened(true);
  }

  function closeForm(): void {
    setFormOpened(false);
  }

  /**
   * Opzioni dello slot. Uno slot occupato da un'**altra** Sezione è disabilitato
   * e ne nomina l'occupante: assegnarlo verrebbe respinto con `409` (l'indice
   * parziale non riassegna, rifiuta), quindi va prima liberato riportando quella
   * Sezione a "Nessuno".
   */
  function slotOptions(): { value: string; label: string; disabled?: boolean }[] {
    return GLOBAL_SECTION_LAYOUT_SLOTS.map((slot) => {
      if (slot === 'none') return { value: slot, label: LAYOUT_SLOT_LABELS[slot] };
      const occupant = slotOccupants[slot];
      const takenByOther = occupant && occupant.guid !== editTarget?.guid;
      return {
        value: slot,
        label: takenByOther
          ? `${LAYOUT_SLOT_LABELS[slot]} — già occupato da "${occupant.title}"`
          : LAYOUT_SLOT_LABELS[slot],
        disabled: Boolean(takenByOther),
      };
    });
  }

  /**
   * Traduce i `409` del modulo in un messaggio esplicito: mai un overwrite
   * silenzioso, e mai un "errore generico" là dove la causa è nota.
   */
  function notifyWriteError(err: unknown, fallback: string): void {
    const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
    if (code === 'GLOBAL_SECTION_LAYOUT_SLOT_TAKEN') {
      notifications.show({
        color: 'red',
        autoClose: false,
        title: 'Slot già occupato',
        message:
          "Un'altra Sezione Globale occupa già questo slot. Riportala a “Nessuno” prima di assegnarlo qui.",
      });
      void reloadSlotOccupants();
      return;
    }
    if (code === 'GLOBAL_SECTION_VERSION_CONFLICT') {
      notifications.show({
        color: 'red',
        autoClose: false,
        title: 'Modifica concorrente',
        message:
          'La Sezione Globale è stata modificata da un altro utente: ricarica la lista e riprova.',
      });
      void reload();
      return;
    }
    notifications.show({ color: 'red', message: getErrorMessage(err, fallback) });
  }

  async function handleFormSubmit(values: GlobalSectionFormValues): Promise<void> {
    setSubmitting(true);
    try {
      if (editTarget) {
        await updateGlobalSection(editTarget.guid, {
          version: editTarget.version,
          title: values.title.trim(),
          slug: values.slug.trim() || undefined,
          layoutSlot: values.layoutSlot,
          isSticky: values.layoutSlot === 'header' ? values.isSticky : false,
        });
        notifications.show({ color: 'green', message: 'Sezione Globale aggiornata' });
        closeForm();
        await Promise.all([reload(), reloadSlotOccupants()]);
      } else {
        const created = await createGlobalSection({
          title: values.title.trim(),
          slug: values.slug.trim() || undefined,
          layoutSlot: values.layoutSlot,
          isSticky: values.layoutSlot === 'header' ? values.isSticky : false,
        });
        notifications.show({ color: 'green', message: 'Sezione Globale creata' });
        closeForm();
        void reloadSlotOccupants();
        navigate(`/global-sections/${created.guid}/builder`);
      }
    } catch (err) {
      notifyWriteError(
        err,
        editTarget
          ? "Errore nell'aggiornamento della Sezione Globale"
          : 'Errore nella creazione della Sezione Globale',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteGlobalSection(deleteTarget.guid);
      notifications.show({ color: 'green', message: 'Sezione Globale eliminata' });
      setDeleteTarget(null);
      await Promise.all([reload(), reloadSlotOccupants()]);
    } catch (err) {
      notifyWriteError(err, "Errore nell'eliminazione della Sezione Globale");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: ResponsiveTableColumn<GlobalSectionRecord>[] = [
    { key: 'title', label: 'Titolo' },
    { key: 'slug', label: 'Slug', hideInCard: true },
    {
      key: 'layoutSlot',
      label: 'Slot di layout',
      render: (row) => (
        <Badge
          color={LAYOUT_SLOT_COLORS[row.layoutSlot]}
          variant={row.layoutSlot === 'none' ? 'light' : 'filled'}
        >
          {LAYOUT_SLOT_LABELS[row.layoutSlot]}
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

  const { visibleColumns, isVisible, toggle } = useColumnVisibility(
    'app.columns.globalSections',
    columns,
  );

  /** Lo slot scelto nel form è già occupato da un'altra Sezione (fotografia locale). */
  const selectedSlot = form.getValues().layoutSlot;
  const conflictingOccupant =
    selectedSlot !== 'none' && slotOccupants[selectedSlot]?.guid !== editTarget?.guid
      ? slotOccupants[selectedSlot]
      : undefined;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Sezioni Globali' }]}
        title="Sezioni Globali"
        kpis={[{ value: total, label: 'Sezioni', icon: IconLayoutNavbar }]}
      />

      <ContentCard>
        <ListToolbar
          state={{ page, setPage, totalPages, limit, setLimit, total, search, setSearch }}
          searchPlaceholder="Cerca per titolo o slug..."
          newLabel="Nuova Sezione Globale"
          onNew={openCreate}
          columnSelector={
            <ColumnSelector columns={columns} isVisible={isVisible} onToggle={toggle} />
          }
        />

        <ScrollArea offsetScrollbars>
          <ResponsiveTable<GlobalSectionRecord>
            data={records}
            loading={loading}
            rowKey={(row) => row.guid}
            columns={visibleColumns}
            sortable={GLOBAL_SECTIONS_SORTABLE}
            sort={sort}
            onSortChange={toggleSort}
            emptyText="Nessuna Sezione Globale trovata"
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
                label: 'Apri nel Builder',
                icon: <IconWand size={16} />,
                onClick: (row) => navigate(`/global-sections/${row.guid}/builder`),
              },
              {
                label: 'Modifica meta-dati',
                icon: <IconPencil size={16} />,
                onClick: (row) => openEdit(row),
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

      {/* Drawer meta-dati — il contenuto a blocchi si modifica solo nel Builder. */}
      <FormDrawer
        opened={formOpened}
        onClose={closeForm}
        title={editTarget ? 'Modifica Sezione Globale' : 'Nuova Sezione Globale'}
        size="min(27.5rem, 100vw)"
        onSubmit={form.onSubmit((values) => void handleFormSubmit(values))}
        canSubmit={form.isValid()}
        submitting={submitting}
      >
        <Stack gap="sm">
          <TextInput label="Titolo" withAsterisk {...form.getInputProps('title')} />
          <TextInput
            label="Slug"
            placeholder="generato dal titolo se vuoto"
            description="Identificatore amministrativo: non è una rotta pubblica."
            {...form.getInputProps('slug')}
          />
          <Select
            label="Slot di layout"
            description="Dove la Sezione viene innestata nel sito pubblico. Un solo Header e un solo Footer alla volta."
            data={slotOptions()}
            allowDeselect={false}
            {...form.getInputProps('layoutSlot')}
          />
          {form.values.layoutSlot === 'header' && (
            <Checkbox
              label="Header sticky"
              description="Rende l'header fisso in alto durante lo scroll della pagina."
              {...form.getInputProps('isSticky', { type: 'checkbox' })}
            />
          )}
          {conflictingOccupant && (
            <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
              Lo slot <strong>{LAYOUT_SLOT_LABELS[selectedSlot]}</strong> è occupato da{' '}
              <strong>{conflictingOccupant.title}</strong>: il salvataggio verrà rifiutato finché
              quella Sezione non torna a &ldquo;Nessuno&rdquo;.
            </Alert>
          )}
          {!editTarget && (
            <Text size="xs" c="dimmed">
              Dopo la creazione si apre il Builder per comporre il contenuto a blocchi.
            </Text>
          )}
        </Stack>
      </FormDrawer>

      {/* Conferma eliminazione (soft-delete). */}
      <ConfirmModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={submitting}
        title="Conferma Eliminazione"
        confirmLabel="Elimina"
        confirmColor="red"
      >
        Eliminare la Sezione Globale <strong>{deleteTarget?.title}</strong>?
        {deleteTarget && deleteTarget.layoutSlot !== 'none' && (
          <>
            {' '}
            È attualmente innestata come{' '}
            <strong>{LAYOUT_SLOT_LABELS[deleteTarget.layoutSlot]}</strong>: dopo l&apos;eliminazione
            il sito pubblico tornerà a rendere le Pagine senza quella sezione.
          </>
        )}{' '}
        L&apos;operazione è un&apos;eliminazione soft (la riga resta recuperabile lato dati).
      </ConfirmModal>
    </div>
  );
}
