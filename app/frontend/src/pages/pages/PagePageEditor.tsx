/**
 * Shell dell'editor visivo dei blocchi (PLAN-F04-editor-visivo.md T2): carica la bozza
 * di una Pagina, inizializza lo store di editing (T1), salva la bozza e pubblica.
 *
 * Divisione di responsabilità: questo file è solo la chrome (caricamento, azioni,
 * errori, layout a due colonne). L'albero vive nello store Zustand — deliberatamente
 * **non** sottoscritto qui: la shell lo legge in modo imperativo
 * (`useBlockEditorStore.getState()`) solo al momento del salvataggio, così una modifica
 * di props non ri-renderizza intestazione e pulsanti (NFR § Performance — editor).
 *
 * L'autorità di validazione resta il server: qui non si duplica una sola regola del
 * registro dei blocchi. Un `400` di validazione viene tradotto nel nodo colpevole
 * (evidenziato nel canvas), non in un errore generico.
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Center, Grid, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconDeviceFloppy, IconRefresh, IconWorldUpload } from '@tabler/icons-react';
import { Link, useParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { getErrorMessage } from '../../utils/api.utils';
import { changePageStatus, fetchPage, updatePage } from '../../services/pages.service';
import {
  PAGE_STATUS_COLORS,
  PAGE_STATUS_LABELS,
  PAGE_STATUS_TRANSITIONS,
  type PageRecord,
  type PageStatus,
  type PagesErrorData,
} from '../../types/pages.types';
import { BLOCK_TYPES, ENVELOPE_VERSION } from '../../types/blocks.types';
import { useBlockEditorStore } from '../../hooks/useBlockEditorStore';
import type { BlockNode } from './editor/block-tree.utils';
import PageHeader from '../../components/PageHeader';
import PageNotFound from '../../components/PageNotFound';
import ContentCard from '../../components/ContentCard';
import ConfirmModal from '../../components/ConfirmModal';
import EditorCanvas from './editor/EditorCanvas';
import { InvalidBlockProvider } from './editor/EditorBlockWrapper';

/** Etichetta leggibile di un tipo di blocco, presa dal registro (mai scritta a mano). */
function blockLabel(type: string): string {
  return BLOCK_TYPES.find((descriptor) => descriptor.type === type)?.meta?.label ?? type;
}

/**
 * Normalizza il contenuto persistito (`draftContent.blocks`, `jsonb` non tipizzato) nella
 * forma dell'albero di editing. I nodi malformati vengono scartati invece di far esplodere
 * l'editor: la Pagina resta apribile e il salvataggio successivo riscrive la forma valida.
 *
 * `v` non entra nell'albero di editing: è ristampato dal registro al salvataggio (vedi
 * {@link toPersistableBlocks}).
 */
function toEditorBlocks(raw: unknown): BlockNode[] {
  if (!raw || typeof raw !== 'object') return [];
  const blocks = (raw as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const node = entry as Record<string, unknown>;
    if (typeof node.id !== 'string' || typeof node.type !== 'string') return [];
    return [
      {
        id: node.id,
        type: node.type,
        props:
          node.props && typeof node.props === 'object' && !Array.isArray(node.props)
            ? { ...(node.props as Record<string, unknown>) }
            : {},
        children: toEditorBlocks({ blocks: node.children }),
      },
    ];
  });
}

/**
 * Aggiunge a ogni nodo il `v` del proprio tipo, obbligatorio in scrittura (ADR-21 § 1,
 * `content-tree.ts`). Il valore è preso dal registro e non dall'albero caricato perché
 * la lettura di una Pagina restituisce già il contenuto migrato alla versione corrente
 * (`migrateContentForRead` in `pages.service.ts`): la `v` corrente è quindi l'unica
 * corretta per ciò che l'editor ha in mano. Un tipo non nel registro resta senza `v` —
 * il server lo respinge con il path del nodo, che è esattamente il comportamento voluto
 * (nessuna invenzione di versione lato client).
 */
function toPersistableBlocks(tree: readonly BlockNode[]): Record<string, unknown>[] {
  return tree.map((node) => {
    const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
    return {
      id: node.id,
      type: node.type,
      ...(descriptor ? { v: descriptor.v } : {}),
      props: node.props,
      children: toPersistableBlocks(node.children),
    };
  });
}

/** Segmenti di percorso prodotti dal backend: `blocks[0].children[2].props.text`. */
const PATH_SEGMENT_RE = /(?:blocks|children)\[(\d+)\]/g;

/** Nome della prop colpevole, se il path del server ne indica una. */
function propNameFromPath(path: string): string | undefined {
  return /\.props\.([A-Za-z0-9_]+)/.exec(path)?.[1];
}

/**
 * Risolve il path di un errore di validazione del server nel nodo corrispondente
 * dell'albero in editing. Il path è posizionale (indici, non id): si percorre l'albero
 * con gli stessi indici usati dal backend.
 */
function resolveNodeByPath(tree: readonly BlockNode[], path: string): BlockNode | undefined {
  let siblings: readonly BlockNode[] = tree;
  let node: BlockNode | undefined;
  for (const match of path.matchAll(PATH_SEGMENT_RE)) {
    node = siblings[Number(match[1])];
    if (!node) return undefined;
    siblings = node.children;
  }
  return node;
}

/** Editor visivo dei blocchi di una Pagina (rotta `pages/:guid/editor`). */
export default function PagePageEditor(): JSX.Element {
  const { guid } = useParams<{ guid: string }>();

  const [page, setPage] = useState<PageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [publishOpened, setPublishOpened] = useState(false);
  /** Nodo respinto dall'ultima validazione server-side, evidenziato nel canvas. */
  const [invalidBlockId, setInvalidBlockId] = useState<string | null>(null);

  const initTree = useBlockEditorStore((state) => state.initTree);

  /** Carica la Pagina e (ri)inizializza l'albero di editing dalla bozza persistita. */
  const loadPage = useCallback(async (): Promise<void> => {
    if (!guid) return;
    setLoading(true);
    try {
      const data = await fetchPage(guid);
      setPage(data);
      initTree(toEditorBlocks(data.draftContent));
      setInvalidBlockId(null);
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
  }, [guid, initTree]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  /**
   * Conflitto di editing (`409 PAGE_VERSION_CONFLICT`) — stesso trattamento di
   * `PagePageDetail`: mai sovrascrittura silenziosa, sempre l'opzione di ricaricare.
   * Distinto dal conflitto di slug duplicato, che ha il proprio messaggio.
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

  /**
   * Traduce un `400` di validazione dell'albero nel blocco colpevole: lo evidenzia nel
   * canvas e nomina tipo e prop nella notifica. Ritorna `false` se l'errore non è
   * riconducibile a un nodo (limiti d'albero, envelope), lasciando al chiamante la
   * notifica generica.
   */
  function handleTreeValidationError(error: AxiosError<PagesErrorData>): boolean {
    const path = error.response?.data?.details?.path;
    if (error.response?.status !== 400 || !path) return false;

    const node = resolveNodeByPath(useBlockEditorStore.getState().tree, path);
    setInvalidBlockId(node?.id ?? null);

    const propName = propNameFromPath(path);
    const target = node
      ? `Blocco "${blockLabel(node.type)}"${propName ? ` — proprietà "${propName}"` : ''}`
      : `Blocco in "${path}"`;
    notifications.show({
      color: 'red',
      autoClose: false,
      title: 'Blocco non valido',
      message: `${target}: ${getErrorMessage(error, 'contenuto rifiutato dalla validazione')}`,
    });
    return true;
  }

  /** Salva l'albero corrente come bozza (`PATCH /app/pages/:guid`, lock ottimistico). */
  async function handleSaveDraft(): Promise<void> {
    if (!page) return;
    setSubmitting(true);
    setInvalidBlockId(null);
    try {
      const updated = await updatePage(page.guid, {
        version: page.version,
        draftContent: {
          version: ENVELOPE_VERSION,
          blocks: toPersistableBlocks(useBlockEditorStore.getState().tree),
        },
      });
      setPage(updated);
      // Il server sanitizza il rich text prima di persistere: si riparte da ciò che è
      // stato davvero salvato, così l'editor mostra il contenuto reale e non la versione
      // pre-sanitizzazione digitata dall'utente.
      initTree(toEditorBlocks(updated.draftContent));
      notifications.show({ color: 'green', message: 'Bozza salvata' });
    } catch (err) {
      const error = err as AxiosError<PagesErrorData>;
      const code = error.response?.data?.code;
      if (code === 'PAGE_VERSION_CONFLICT') {
        notifyVersionConflict();
      } else if (code === 'PAGE_SLUG_DUPLICATE') {
        notifications.show({
          color: 'red',
          title: 'Slug già in uso',
          message:
            'Lo slug della Pagina è già usato per questo locale/genitore. Modificalo dal dettaglio della Pagina.',
        });
      } else if (!handleTreeValidationError(error)) {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel salvataggio della bozza'),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** Pubblica la bozza già persistita (`POST /app/pages/:guid/status`). */
  async function handlePublish(): Promise<void> {
    if (!page) return;
    setSubmitting(true);
    try {
      const updated = await changePageStatus(page.guid, { status: 'published' });
      setPage(updated);
      setPublishOpened(false);
      notifications.show({ color: 'green', message: 'Pagina pubblicata' });
    } catch (err) {
      const error = err as AxiosError<PagesErrorData>;
      const code = error.response?.data?.code;
      if (code === 'PAGE_VERSION_CONFLICT') {
        notifyVersionConflict();
        setPublishOpened(false);
      } else if (error.response?.status === 400 && error.response.data?.details?.transition) {
        notifications.show({
          color: 'red',
          message: `Transizione non ammessa: ${error.response.data.details.transition}`,
        });
      } else if (!handleTreeValidationError(error)) {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nella pubblicazione'),
        });
      }
    } finally {
      setSubmitting(false);
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
  const canPublish = (PAGE_STATUS_TRANSITIONS[status] ?? []).includes('published');

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Pagine', href: '/pages' },
          { label: page.title, href: `/pages/${page.guid}` },
          { label: 'Editor' },
        ]}
        title={page.title}
        subtitle={`/${page.slug} · ${page.locale} · editor visivo`}
      />

      <ContentCard>
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <Button
              component={Link}
              to={`/pages/${page.guid}`}
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
            >
              Dettaglio Pagina
            </Button>
            <Badge color={PAGE_STATUS_COLORS[status] ?? 'gray'} size="lg">
              {PAGE_STATUS_LABELS[status] ?? status}
            </Badge>
            <Text size="sm" c="dimmed">
              Versione {page.version}
            </Text>
          </Group>
          <Group gap="sm">
            <Button
              variant="default"
              leftSection={<IconRefresh size={16} />}
              onClick={() => void loadPage()}
              disabled={submitting}
            >
              Ricarica
            </Button>
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={() => void handleSaveDraft()}
              loading={submitting}
            >
              Salva bozza
            </Button>
            {canPublish && (
              <Button
                color="green"
                leftSection={<IconWorldUpload size={16} />}
                onClick={() => setPublishOpened(true)}
                disabled={submitting}
              >
                Pubblica
              </Button>
            )}
          </Group>
        </Group>

        <InvalidBlockProvider invalidBlockId={invalidBlockId}>
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 8 }}>
              <EditorCanvas />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Paper withBorder p="md" radius="md">
                <Stack gap="xs">
                  <Text fw={600}>Proprietà</Text>
                  <Text size="sm" c="dimmed">
                    L&apos;ispettore delle proprietà non è ancora disponibile (F04 — T5). In questa
                    revisione si possono aggiungere, riordinare ed eliminare blocchi.
                  </Text>
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>
        </InvalidBlockProvider>
      </ContentCard>

      <ConfirmModal
        opened={publishOpened}
        onClose={() => setPublishOpened(false)}
        onConfirm={() => void handlePublish()}
        loading={submitting}
        title="Pubblica Pagina"
        confirmLabel="Pubblica"
        confirmColor="green"
      >
        Viene pubblicata la bozza <strong>salvata</strong>: le modifiche non ancora salvate restano
        fuori dalla Revisione. Salva la bozza prima di pubblicare se hai appena modificato i
        blocchi.
      </ConfirmModal>
    </div>
  );
}
