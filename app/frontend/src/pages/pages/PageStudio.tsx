/**
 * Editor Visivo a blocchi — rotta isolata `/studio/:guid` (ADR-54), fuori da
 * `LayoutProtected` (`LayoutStudio.tsx`). Sostituisce l'overlay CSS che prima viveva nella
 * scheda "Contenuto" di `PagePageDetail.tsx`: qui l'intera rotta è l'editor, senza bisogno
 * di governarne la visibilità in base a una scheda selezionata altrove — `BlockEditorPanel`
 * monta sempre `FullScreenEditorLayout` senza condizioni.
 *
 * Carica la Pagina da sé (`guid` di rotta via `useParams`, stesso pattern fetch/loading/
 * notFound di `PagePageDetail.tsx`): questa rotta non riceve più nulla come prop dal
 * dettaglio, che ora si limita a linkare `/studio/:guid`.
 *
 * Cambio di stato e anteprima riusano la stessa logica di `PagePageDetail.tsx`
 * (`usePageStatusTransition`/`PageStatusTransitionModals`, `issuePagePreviewToken`): un solo
 * punto che decide la macchina a stati, montato da entrambe le pagine.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Center, Loader, Stack, Text, Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { getErrorMessage } from '../../utils/api.utils';
import { fetchPage, issuePagePreviewToken } from '../../services/pages.service';
import type { PageRecord, PageStatus } from '../../types/pages.types';
import { PUBLIC_SITE_URL } from '../../hooks/usePublicPageUrl';
import { useAuthStore } from '../../hooks/useAuth';
import PageNotFound from '../../components/PageNotFound';
import BlockEditorPanel from './editor/BlockEditorPanel';
import PageStatusTransitionModals from './components/PageStatusTransitionModals';
import { usePageStatusTransition } from './hooks/usePageStatusTransition';

/**
 * `z-index` dei modali di transizione di stato: sopra la chrome full-screen dell'editor
 * (`FullScreenEditorLayout`, z-index 1000) — senza, il `Modal`/`ConfirmModal` (montati in
 * portale) resterebbero dietro l'overlay `position: fixed` dell'editor. Stesso valore già
 * usato altrove nella chrome dell'editor (`CreateTranslationModal.tsx`, il `ConfirmModal`
 * di modifiche non salvate in `BlockEditorPanel.tsx`).
 */
const MODALS_Z_INDEX = 1100;

/** Editor Visivo a blocchi di una Pagina, montato per intero sulla rotta `/studio/:guid`. */
export default function PageStudio(): JSX.Element {
  const { guid } = useParams<{ guid: string }>();
  const authUser = useAuthStore((s) => s.user);

  const [page, setPage] = useState<PageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  /**
   * Registrato da `BlockEditorPanel` (`onSaveDraftReady`): a differenza di
   * `PagePageDetail.tsx` — che dopo ADR-54 non monta più l'editor e quindi non ha modo di
   * salvare un albero di blocchi pendente prima di pubblicare — questa pagina HA accesso
   * reale al salvataggio, e lo usa per garantire che "Pubblica" da qui includa le modifiche
   * ai blocchi non ancora salvate.
   */
  const saveDraftRef = useRef<(() => Promise<PageRecord | null>) | null>(null);

  /** Ricarica la Pagina dal backend — usata al mount e per recuperare da un 409/403. */
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

  /**
   * Notifica dedicata di conflitto di editing (`409 PAGE_VERSION_CONFLICT`), distinta dal
   * conflitto di slug duplicato: mai sovrascrittura silenziosa, offre sempre di ricaricare
   * la bozza corrente. Stesso testo/stesso pattern di `PagePageDetail.tsx`.
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

  const statusApi = usePageStatusTransition({
    page,
    setPage,
    onVersionConflict: notifyVersionConflict,
    role: authUser?.role,
    onReload: () => void loadPage(),
    presaveDraft: () => saveDraftRef.current?.() ?? Promise.resolve(page),
  });

  /**
   * Genera un token di anteprima e apre subito la bozza corrente in una nuova scheda
   * (ADR-25). Il token non viene mai conservato lato client oltre questa chiamata.
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

  if (notFound) return <PageNotFound />;

  if (loading || !page) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  const status = page.status as PageStatus;

  return (
    <>
      <BlockEditorPanel
        page={page}
        onPageUpdated={setPage}
        onVersionConflict={notifyVersionConflict}
        onSaveDraftReady={(saveDraft) => {
          saveDraftRef.current = saveDraft;
        }}
        onPreview={status === 'draft' ? () => void handlePreview() : undefined}
        previewLoading={previewLoading}
        pageStatus={status}
        visibleTransitions={statusApi.visibleTransitions}
        statusSubmitting={statusApi.submitting}
        onRequestStatusChange={statusApi.requestStatusTransition}
      />

      <PageStatusTransitionModals status={status} api={statusApi} zIndex={MODALS_Z_INDEX} />
    </>
  );
}
