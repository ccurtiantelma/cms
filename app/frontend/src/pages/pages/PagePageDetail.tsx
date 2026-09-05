/**
 * Dettaglio Pagina (F01/T8 + F04): Metadati, SEO e GEO su schede separate — sono cose
 * diverse e si compilano in momenti diversi —, cronologia Revisioni + ripristino in nuova
 * bozza. Dopo ADR-54 non ospita più il contenuto: l'editor visivo a blocchi vive sulla
 * rotta isolata `/studio/:guid` (`PageStudio.tsx`), non in una scheda di questa pagina — un
 * pulsante linka lì, senza montare `BlockEditorPanel` qui.
 *
 * Due scelte di interfaccia con un motivo, non estetiche:
 * - **Lo stato è una tendina nell'intestazione**, non una scheda: una scheda per una sola
 *   voce è spazio sprecato, e lo stato va letto sempre, non cercato. La tendina offre solo
 *   le transizioni ammesse da `PAGE_STATUS_TRANSITIONS` per lo stato corrente — mai
 *   l'elenco completo degli stati, che porterebbe l'utente a scegliere qualcosa che il
 *   server rifiuta con `400`. La macchina a stati (menu, conferma, programmazione data/ora)
 *   è condivisa con `PageStudio.tsx` via `usePageStatusTransition`/`PageStatusTransitionModals`
 *   — un solo posto, non due copie quasi identiche.
 * - **"Vedi pagina" compare solo su una Pagina pubblicata**, perché la superficie pubblica
 *   serve solo contenuto `published` (ADR-24). **"Anteprima" compare solo su una Pagina in
 *   `draft`**, speculare: il backend nega il token (`403`) su ogni altro stato (ADR-25), e
 *   mostrare un pulsante che risponderebbe sempre con un errore non aiuta nessuno. Genera un
 *   token JWT effimero (15 minuti, non rinnovabile) e apre `{PUBLIC_SITE_URL}/__preview/:token`
 *   in una nuova scheda — il token non viene mai persistito lato client.
 *
 * **Pubblicazione senza pre-salvataggio.** Non avendo più accesso all'editor (montato altrove,
 * su un'altra rotta), "Pubblica" da qui pubblica sempre la bozza già salvata sul server — a
 * differenza di `PageStudio.tsx`, che HA accesso al salvataggio dell'albero e lo esegue prima
 * di pubblicare da lì. Vedi il commento su `presaveDraft` in `usePageStatusTransition.ts`.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Center,
  Code,
  Divider,
  Grid,
  Group,
  Loader,
  Menu,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconCirclePlus,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconGitCompare,
  IconHistory,
  IconRefresh,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { getErrorMessage } from '../../utils/api.utils';
import { formatDate } from '../../utils/date.utils';
import type { PaginationParams } from '../../types/common.types';
import {
  fetchPage,
  fetchPageRevisions,
  getPageRevision,
  issuePagePreviewToken,
  restorePageRevision,
  updatePage,
} from '../../services/pages.service';
import {
  PAGE_STATUS_COLORS,
  PAGE_STATUS_LABELS,
  statusActionLabel,
  type PageFaqEntry,
  type PageRecord,
  type PageRevisionDetail,
  type PageRevisionSummary,
  type PageStatus,
  type PagesErrorData,
  type UpdatePagePayload,
} from '../../types/pages.types';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { PUBLIC_SITE_URL, usePublicPageUrl } from '../../hooks/usePublicPageUrl';
import { usePublicSiteHealth } from '../../hooks/usePublicSiteHealth';
import { useAuthStore } from '../../hooks/useAuth';
import { usePageStatusTransition } from './hooks/usePageStatusTransition';
import PageStatusTransitionModals from './components/PageStatusTransitionModals';
import RevisionDiffModal from './editor/RevisionDiffModal';
import SeoSerpPreview from './editor/SeoSerpPreview';
import SeoSocialPreview from './editor/SeoSocialPreview';
import SeoJsonLdInspector from './editor/SeoJsonLdInspector';
import PageHeader from '../../components/PageHeader';
import PageNotFound from '../../components/PageNotFound';
import ContentCard from '../../components/ContentCard';
import ListToolbar from '../../components/ListToolbar';
import ResponsiveTable, { type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import ConfirmModal from '../../components/ConfirmModal';
import ParentPageSelectorDrawer from './components/ParentPageSelectorDrawer';
import MediaLibraryModal from '../../components/media/MediaLibraryModal';
import { resolveMediaSrc } from '../../components/blocks/media-url';
import styles from './PagePageDetail.module.css';

/**
 * Scarto entro cui `updatedAt` e `publishedAt` si considerano lo stesso istante. Copre le
 * due `new Date()` distinte scritte dalla transazione di pubblicazione; un margine così
 * corto non può mascherare una modifica reale, che arriva sempre da una richiesta separata.
 */
const PUBLISH_TIMESTAMP_TOLERANCE_MS = 2000;

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

/** Divide un testo multi-riga in un array di stringhe non vuote, o `undefined` se vuoto. */
function linesToArray(text: string): string[] | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : undefined;
}

/**
 * URL da mostrare nell'anteprima SERP live: canonica se compilata, altrimenti dedotta dallo
 * slug corrente del form. A differenza di `usePublicPageUrl` (che risale gli antenati con una
 * richiesta di rete per il vero pulsante "Vedi pagina") questa è solo un'approssimazione per
 * l'anteprima — nessuna richiesta, si aggiorna ad ogni tasto.
 */
function resolveSerpPreviewUrl(canonicalUrl: string, slug: string): string {
  const trimmedCanonical = canonicalUrl.trim();
  if (trimmedCanonical) return trimmedCanonical;
  return `${PUBLIC_SITE_URL}/${slug.trim()}`;
}

/** Host di un URL assoluto, o l'URL grezzo se non ancora valido (es. slug vuoto durante la digitazione). */
function extractHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
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

/**
 * Slug riservato alla home page (ADR-24 § 7, `HOME_SLUG` in
 * `app/backend/src/pages/public-path.util.ts`): una Pagina senza genitore con questo slug
 * è servita su `/`. Nessun flag DB dedicato — è pura convenzione sullo slug, già applicata
 * dal backend; qui serve solo a pilotare l'interfaccia (input disabilitato + badge).
 */
const HOME_SLUG = 'home';

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

/** Pagina di dettaglio di una Pagina (chrome amministrativa, F01/T8). */
export default function PagePageDetail(): JSX.Element {
  const { guid } = useParams<{ guid: string }>();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);

  const [page, setPage] = useState<PageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mediaLibraryOpened, setMediaLibraryOpened] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<PageRevisionSummary | null>(null);
  const [viewRevision, setViewRevision] = useState<PageRevisionDetail | null>(null);
  const [viewRevisionLoading, setViewRevisionLoading] = useState(false);
  const [diffModalOpened, setDiffModalOpened] = useState(false);

  /**
   * `?tab=` iniziale (letto una sola volta, mai risincronizzato dopo il mount): non ha più
   * consumer dedicati dopo ADR-54 (l'ex scheda "Contenuto" è ora la rotta `/studio/:guid`,
   * `CreateTranslationModal.tsx` reindirizza lì) — resta come convenienza generica per
   * linkare direttamente su "seo"/"geo"/"revisions", un valore non riconosciuto ricade
   * silenziosamente sul default invece di rompere il rendering.
   */
  const [activeTab, setActiveTab] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('tab') ?? 'metadata',
  );

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

  /** URL pubblico della Pagina — `null` finché non è pubblicata (ADR-24). */
  const publicUrl = usePublicPageUrl(page);

  /**
   * Sonda passiva su `{PUBLIC_SITE_URL}/healthz`, avviata solo quando esiste un URL
   * pubblico da mostrare (quindi solo insieme al pulsante "Vedi pagina"). Non blocca né
   * ritarda il link, che resta un vero `href` funzionante indipendentemente dall'esito.
   */
  const publicSiteHealth = usePublicSiteHealth(publicUrl ? PUBLIC_SITE_URL : null);

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

  /**
   * Macchina a stati condivisa con `PageStudio.tsx` (`usePageStatusTransition`, ADR-54):
   * nessun `presaveDraft` qui — questa pagina non monta più l'editor (rotta separata), quindi
   * "Pubblica" pubblica sempre la bozza già salvata sul server (vedi commento di testa).
   */
  const statusApi = usePageStatusTransition({
    page,
    setPage,
    onVersionConflict: notifyVersionConflict,
    role: authUser?.role,
    onReload: () => void loadPage(),
  });

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

  /**
   * Genera un token di anteprima e apre subito la bozza corrente in una nuova scheda
   * (ADR-25). Il token non viene mai conservato lato client oltre questa chiamata: niente
   * `localStorage`/store, `window.open` lo consuma e basta.
   */
  async function handlePreview(): Promise<void> {
    if (!page) return;
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      notifications.show({
        color: 'red',
        message: "Impossibile aprire l'anteprima: consenti i popup per questo sito.",
      });
      return;
    }
    previewWindow.opener = null;
    setPreviewLoading(true);
    try {
      const { token } = await issuePagePreviewToken(page.guid);
      previewWindow.location.href = `${PUBLIC_SITE_URL}/__preview/${token}`;
    } catch (err) {
      previewWindow.close();
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, "Errore nella generazione dell'anteprima"),
      });
    } finally {
      setPreviewLoading(false);
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

  /**
   * La bozza è stata toccata dopo l'ultima pubblicazione: online c'è ancora la Revisione
   * precedente. Il confronto è fra `updatedAt` della riga e `publishedAt`, gli unici due
   * dati già disponibili nel contratto — non serve caricare la Revisione pubblicata per
   * saperlo. Sovrastima di proposito: anche una modifica ai soli metadati SEO conta come
   * "non pubblicata", perché in effetti lo è.
   *
   * La tolleranza non è cosmetica: la pubblicazione scrive `publishedAt` e `updatedAt` con
   * due `new Date()` distinte nella stessa transazione (`pages.service.ts`), che possono
   * cadere su millisecondi diversi. Senza margine il badge si accenderebbe sull'istante
   * stesso della pubblicazione, che è il momento in cui è certamente falso.
   */
  const hasUnpublishedChanges =
    status === 'published' &&
    page.publishedAt !== null &&
    new Date(page.updatedAt).getTime() - new Date(page.publishedAt).getTime() >
      PUBLISH_TIMESTAMP_TOLERANCE_MS;

  const revisionColumns: ResponsiveTableColumn<PageRevisionSummary>[] = [
    { key: 'revisionNumber', label: '#', hideInCard: true },
    { key: 'title', label: 'Titolo' },
    { key: 'slug', label: 'Slug', hideInCard: true },
    { key: 'authorName', label: 'Autore' },
    { key: 'createdAt', label: 'Data', render: (row) => formatDate(row.createdAt) },
  ];

  /*
   * Valori live per i pannelli di anteprima SEO/OG/JSON-LD (`Tabs.Panel` "seo"/"geo" sotto):
   * derivati da `form.values`, non da `page` salvato — l'obiettivo esplicito è aggiornarsi
   * mentre l'utente digita, prima di premere "Salva". Stessi fallback già usati dal business
   * rule (`docs/business-rules.md` § SEO): `ogTitle || metaTitle || title`,
   * `ogDescription || metaDescription`.
   */
  /**
   * Vero quando lo slug corrente del form coincide con `HOME_SLUG`: pilota solo l'interfaccia
   * (input disabilitato "/" + badge invece del pulsante "Imposta come Home Page") — la
   * convenzione che rende la Pagina effettivamente la home è tutta lato backend (ADR-24 § 7).
   */
  const isHome = form.values.slug.trim() === HOME_SLUG;

  const seoPreviewUrl = resolveSerpPreviewUrl(form.values.canonicalUrl, form.values.slug);
  const seoPreviewDomain = extractHost(seoPreviewUrl);
  const seoPreviewTitle = form.values.metaTitle || form.values.title;
  const seoPreviewDescription = form.values.metaDescription;
  const ogPreviewTitle = form.values.ogTitle || seoPreviewTitle;
  const ogPreviewDescription = form.values.ogDescription || seoPreviewDescription;

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
            {/*
              Tendina di stato: le voci sono le sole transizioni ammesse dallo stato
              corrente, non l'elenco completo degli stati — un menu con tutti gli stati
              produrrebbe `400` prevedibili. Unica eccezione legittima allo stato corrente
              escluso dalle opzioni: `published` può comparire come transizione anche
              quando lo stato corrente È già `published` (ripubblicazione dopo una modifica
              alla bozza, Regola 1 di `docs/business-rules.md` § Stati di una Pagina). Non è
              un no-op travestito da transizione — crea comunque una nuova Revisione e
              sostituisce il contenuto online — quindi `statusActionLabel` gli dà
              un'etichetta distinta ("Ripubblica") invece di riusare "Pubblica" così com'è.
            */}
            <Menu
              shadow="md"
              position="bottom-start"
              withinPortal
              disabled={submitting || statusApi.submitting}
            >
              <Menu.Target>
                <Button
                  variant="light"
                  color={PAGE_STATUS_COLORS[status] ?? 'gray'}
                  rightSection={<IconChevronDown size={16} />}
                  disabled={statusApi.visibleTransitions.length === 0}
                >
                  {PAGE_STATUS_LABELS[status] ?? status}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Transizioni ammesse</Menu.Label>
                {statusApi.visibleTransitions.map((target) => (
                  <Menu.Item
                    key={target}
                    color={PAGE_STATUS_COLORS[target]}
                    onClick={() => statusApi.requestStatusTransition(target)}
                  >
                    {statusActionLabel(target, status)}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            {/*
              Il segnale che manca di più a chi scrive: la bozza è cambiata dopo l'ultima
              pubblicazione, quindi ciò che si vede in "Vedi pagina" non è ciò che si sta
              modificando. Senza, l'unico modo di accorgersene è aprire il sito pubblico e
              non trovarci le proprie modifiche.
            */}
            {hasUnpublishedChanges && (
              <Tooltip
                withArrow
                multiline
                w={280}
                label="La bozza è stata modificata dopo l'ultima pubblicazione. Online resta la Revisione precedente finché non ripubblichi."
              >
                <Badge color="orange" variant="light" leftSection={<IconAlertTriangle size={12} />}>
                  Modifiche non pubblicate
                </Badge>
              </Tooltip>
            )}
            <Text size="sm" c="dimmed">
              Versione {page.version} · Aggiornata {formatDate(page.updatedAt)}
            </Text>
          </Group>
          <Group gap="sm">
            {/*
              Ingresso all'Editor Visivo a blocchi (ADR-54): rotta isolata `/studio/:guid`,
              non più una scheda di questa pagina. `navigate()` (SPA), non `<a href>`: nessuno
              stato non salvato da proteggere qui (l'albero di blocchi vive solo dentro
              `/studio/:guid`), stesso pattern dell'azione "Apri" di `PagePages.tsx`.
            */}
            <Button
              leftSection={<IconEdit size={16} />}
              onClick={() => navigate(`/studio/${page.guid}`)}
            >
              Apri Editor
            </Button>
            {/*
              Solo su Pagina pubblicata: è l'unico stato che la superficie pubblica serve.
              È un vero `href` (non un `onClick` che apre una finestra) così restano
              disponibili apri-in-nuova-scheda, copia indirizzo e tasto centrale.
            */}
            {publicUrl && (
              <Group gap={4} wrap="nowrap">
                <Button
                  component="a"
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="default"
                  leftSection={<IconExternalLink size={16} />}
                >
                  Anteprima
                </Button>
                {/*
                  Avviso non bloccante, non un'interdizione: il link resta un vero `href`
                  cliccabile a prescindere da questo esito. La sonda (`usePublicSiteHealth`)
                  non ritarda né condiziona il rendering del pulsante sopra.
                */}
                {publicSiteHealth === 'unhealthy' && (
                  <Tooltip
                    withArrow
                    multiline
                    w={280}
                    label="Il sito pubblico (porta 55000) non risponde: la pagina potrebbe non essere raggiungibile."
                  >
                    <Center aria-label="Sito pubblico non raggiungibile">
                      <IconAlertTriangle size={18} color="var(--mantine-color-yellow-6)" />
                    </Center>
                  </Tooltip>
                )}
              </Group>
            )}
            {/*
              Solo su bozza (`draft`): il backend nega il token su ogni altro stato
              (`403`, ADR-25) — coerente con "Vedi pagina" sopra, che è l'inverso e compare
              solo su `published`. `onClick`, non `href`: il token va generato al momento,
              mai anticipato in un URL statico.

              Dopo ADR-54 questo è l'unico pulsante "Anteprima" del dettaglio: l'editor (che
              ha il proprio, nella topbar di `FullScreenEditorLayout`) vive sulla rotta
              separata `/studio/:guid`, non più co-locato in questa pagina — nessun doppio
              bottone da disambiguare.
            */}
            {status === 'draft' && (
              <Button
                variant="default"
                leftSection={<IconEye size={16} />}
                loading={previewLoading}
                onClick={() => void handlePreview()}
              >
                Anteprima
              </Button>
            )}
            <Tooltip label="Ricarica" withArrow>
              <ActionIcon variant="default" aria-label="Ricarica" onClick={() => void loadPage()}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/*
          `value`/`onChange` (controllato) invece di `defaultValue`: `activeTab` resta
          leggibile dall'iniziale `?tab=` dell'URL (vedi commento sopra).
        */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="metadata">Metadati</Tabs.Tab>
            <Tabs.Tab value="seo">SEO</Tabs.Tab>
            <Tabs.Tab value="geo">GEO</Tabs.Tab>
            <Tabs.Tab value="revisions" leftSection={<IconHistory size={14} />}>
              Revisioni
            </Tabs.Tab>
          </Tabs.List>

          {/*
            Metadati, SEO e GEO sono tre schede ma **un solo** `useForm` e un solo
            `PATCH`: sono campi della stessa Pagina, e il lock ottimistico è per riga, non
            per sezione. Salvare da una qualunque delle tre invia sempre l'intero payload —
            l'alternativa (tre salvataggi parziali) moltiplicherebbe i `409` senza dare
            nulla in cambio.
          */}

          {/* --- Metadati (identità della Pagina: titolo, slug, posizione) --- */}
          <Tabs.Panel value="metadata" pt="md">
            <form onSubmit={form.onSubmit((values) => void handleMetadataSubmit(values))}>
              <Stack gap="lg">
                <Stack gap="sm">
                  <TextInput label="Titolo" withAsterisk {...form.getInputProps('title')} />
                  {/*
                    Slug + azione Home Page: `isHome` (derivato da `form.values.slug`, sopra)
                    pilota entrambe le colonne. Quando è la home, l'input mostra `/` senza
                    essere collegato a `form.getInputProps('slug')` — altrimenti mostrerebbe il
                    valore reale `home` invece della radice pubblica che rappresenta.
                  */}
                  <Grid gutter="sm" align="flex-end">
                    <Grid.Col span={8}>
                      {isHome ? (
                        <TextInput label="Slug" value="/" disabled />
                      ) : (
                        <TextInput label="Slug" withAsterisk {...form.getInputProps('slug')} />
                      )}
                    </Grid.Col>
                    <Grid.Col span={4}>
                      <Stack justify="flex-end" h="100%">
                        {isHome ? (
                          <Badge color="green" variant="light">
                            Home Page (Radice)
                          </Badge>
                        ) : (
                          <Button
                            variant="light"
                            onClick={() => {
                              form.setFieldValue('slug', HOME_SLUG);
                              form.setFieldValue('parentGuid', '');
                            }}
                          >
                            Imposta come Home Page
                          </Button>
                        )}
                      </Stack>
                    </Grid.Col>
                  </Grid>
                  <ParentPageSelectorDrawer
                    currentPageGuid={page.guid}
                    value={form.values.parentGuid}
                    onChange={(parentGuid) => form.setFieldValue('parentGuid', parentGuid)}
                  />
                </Stack>

                <Group justify="flex-end">
                  <Button type="submit" loading={submitting} disabled={!form.isValid()}>
                    Salva
                  </Button>
                </Group>
              </Stack>
            </form>
          </Tabs.Panel>

          {/* --- SEO (motori di ricerca classici) --- */}
          <Tabs.Panel value="seo" pt="md">
            <Grid gutter="xl" align="start">
              <Grid.Col span={{ base: 12, md: 7 }}>
                <form onSubmit={form.onSubmit((values) => void handleMetadataSubmit(values))}>
                  <Stack gap="lg">
                    <Stack gap="sm">
                      <TextInput
                        label={
                          <Group gap={6}>
                            <span>Meta title</span>
                            <Badge
                              size="xs"
                              variant="light"
                              color={form.values.metaTitle.length > 60 ? 'orange' : 'gray'}
                            >
                              {form.values.metaTitle.length}/60
                            </Badge>
                          </Group>
                        }
                        {...form.getInputProps('metaTitle')}
                      />
                      <Textarea
                        label={
                          <Group gap={6}>
                            <span>Meta description</span>
                            <Badge
                              size="xs"
                              variant="light"
                              color={form.values.metaDescription.length > 160 ? 'orange' : 'gray'}
                            >
                              {form.values.metaDescription.length}/160
                            </Badge>
                          </Group>
                        }
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
                      <Group align="flex-end" wrap="nowrap">
                        <TextInput
                          label="Open Graph (immagine)"
                          value={form.values.ogImage ? 'Immagine selezionata' : 'Nessuna immagine'}
                          readOnly
                          className={styles.seoImageField}
                        />
                        <Button
                          type="button"
                          variant="light"
                          leftSection={<IconCirclePlus size={16} />}
                          onClick={() => setMediaLibraryOpened(true)}
                        >
                          Scegli immagine
                        </Button>
                      </Group>
                      {form.values.ogImage && (
                        <Button
                          type="button"
                          variant="subtle"
                          color="red"
                          size="xs"
                          onClick={() => form.setFieldValue('ogImage', '')}
                        >
                          Rimuovi immagine
                        </Button>
                      )}
                    </Stack>

                    <Group justify="flex-end">
                      <Button type="submit" loading={submitting} disabled={!form.isValid()}>
                        Salva
                      </Button>
                    </Group>
                  </Stack>
                </form>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 5 }} className={styles.seoPreviewColumn}>
                <Stack gap="lg">
                  <Divider label="Anteprima" labelPosition="left" />
                  <SeoSerpPreview
                    title={seoPreviewTitle}
                    description={seoPreviewDescription}
                    url={seoPreviewUrl}
                  />
                  <SeoSocialPreview
                    title={ogPreviewTitle}
                    description={ogPreviewDescription}
                    image={form.values.ogImage}
                    domain={seoPreviewDomain}
                  />
                </Stack>
              </Grid.Col>
            </Grid>
            <MediaLibraryModal
              opened={mediaLibraryOpened}
              onClose={() => setMediaLibraryOpened(false)}
              currentGuid={undefined}
              onSelect={(file) => {
                form.setFieldValue('ogImage', resolveMediaSrc(file.guid));
                setMediaLibraryOpened(false);
              }}
              zIndex={1200}
            />

            {/*
              Anteprime live (chrome dell'editor, puramente presentazionali — nessuna chiamata
              API propria): alimentate da `form.values`, si aggiornano ad ogni tasto, prima
              ancora di "Salva". Le checklist di lunghezza sono consultive (business rule 4),
              mai un blocco alla pubblicazione.
            */}
          </Tabs.Panel>

          {/* --- GEO (motori generativi): non è "SEO avanzato", è un altro consumatore --- */}
          <Tabs.Panel value="geo" pt="md">
            <form onSubmit={form.onSubmit((values) => void handleMetadataSubmit(values))}>
              <Stack gap="lg">
                <Stack gap="sm">
                  <Text size="sm" c="dimmed">
                    GEO = Generative Engine Optimization: come il contenuto viene riassunto e citato
                    dai motori generativi, non come viene indicizzato dai motori di ricerca.
                  </Text>
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

            {/*
              Anteprima JSON-LD (puramente presentazionale, calcolata in editor — vedi
              `SeoJsonLdInspector.tsx`): `manualStructuredData` viene dal record salvato
              (`page.draftSeo?.structuredData`), non dal form — quel campo non è editabile qui.
            */}
            <Divider label="Anteprima" labelPosition="left" mt="lg" />
            <Stack mt="sm">
              <SeoJsonLdInspector
                pageTitle={seoPreviewTitle}
                description={seoPreviewDescription}
                faq={form.values.faq}
                manualStructuredData={
                  page.draftSeo?.structuredData as Record<string, unknown> | undefined
                }
              />
            </Stack>
          </Tabs.Panel>

          {/* --- Cronologia Revisioni + ripristino --- */}
          <Tabs.Panel value="revisions" pt="md">
            <Stack gap="sm">
              <Group justify="flex-end">
                <Button
                  variant="default"
                  leftSection={<IconGitCompare size={16} />}
                  onClick={() => setDiffModalOpened(true)}
                  disabled={revisions.length < 2}
                >
                  Confronta Revisioni
                </Button>
              </Group>
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

      {/*
        Modali di conferma/programmazione della transizione di stato: condivisi con
        `PageStudio.tsx` (`usePageStatusTransition`/`PageStatusTransitionModals`, ADR-54).
        Nessun `zIndex` esplicito: questa pagina non ha più una chrome full-screen sotto
        (l'editor vive sulla rotta separata `/studio/:guid`), il default Mantine basta.
      */}
      <PageStatusTransitionModals status={status} api={statusApi} />

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

      {/* Modal confronto strutturale fra due Revisioni (F07-02). */}
      {page && (
        <RevisionDiffModal
          opened={diffModalOpened}
          onClose={() => setDiffModalOpened(false)}
          pageGuid={page.guid}
          revisions={revisions}
          onRestore={(revision) => {
            setRestoreTarget(revision);
            setDiffModalOpened(false);
          }}
        />
      )}
    </div>
  );
}
