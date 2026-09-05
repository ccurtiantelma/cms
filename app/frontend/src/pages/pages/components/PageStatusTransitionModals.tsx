/**
 * I due modali della transizione di stato di una Pagina — `ConfirmModal` di conferma (ogni
 * target tranne `scheduled`) e `Modal` di programmazione data/ora (`scheduled`) — estratti da
 * `PagePageDetail.tsx` e riusati da `PageStudio.tsx` (ADR-54): stesso testo di conferma, stesso
 * comportamento, un solo posto invece di due copie quasi identiche.
 */
import { Button, Group, Modal, Stack } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { statusActionLabel, type PageStatus } from '../../../types/pages.types';
import ConfirmModal from '../../../components/ConfirmModal';
import type { PageStatusTransitionApi } from '../hooks/usePageStatusTransition';

interface PageStatusTransitionModalsProps {
  /** Stato corrente della Pagina — determina il testo di conferma della ripubblicazione. */
  status: PageStatus;
  /** Stato/azioni prodotti da `usePageStatusTransition`. */
  api: PageStatusTransitionApi;
  /**
   * `z-index` esplicito dei due modali — di norma il default Mantine basta. Va alzato solo
   * quando il chiamante vive sotto un overlay con `z-index` più alto (l'editor full-screen,
   * `FullScreenEditorLayout`, `z-index: 1000`), il cui `position: fixed` altrimenti coprirebbe
   * il Modal montato in portale (`PageStudio.tsx`). `PagePageDetail.tsx` non ha più quell'overlay
   * dopo ADR-54 e non lo passa.
   */
  zIndex?: number;
}

/** Modali di conferma/programmazione della transizione di stato — nessuna logica propria, solo presentazione. */
export default function PageStatusTransitionModals({
  status,
  api,
  zIndex,
}: PageStatusTransitionModalsProps): JSX.Element {
  const {
    transitionTarget,
    scheduleOpened,
    scheduledAt,
    setScheduledAt,
    submitting,
    doChangeStatus,
    closeTransitionModal,
    closeScheduleModal,
  } = api;

  return (
    <>
      <ConfirmModal
        opened={!!transitionTarget}
        onClose={closeTransitionModal}
        onConfirm={() => transitionTarget && void doChangeStatus(transitionTarget)}
        loading={submitting}
        title="Conferma cambio di stato"
        confirmLabel={transitionTarget ? statusActionLabel(transitionTarget, status) : 'Conferma'}
        zIndex={zIndex}
      >
        {transitionTarget === 'published' &&
          (status === 'published' ? (
            <>
              Questa Pagina è già pubblicata. Ripubblicarla creerà una nuova Revisione immutabile
              con la bozza <strong>salvata</strong> e sostituirà immediatamente il contenuto
              attualmente online: le modifiche ai blocchi non ancora salvate restano fuori dalla
              Revisione.
            </>
          ) : (
            <>
              Pubblicare questa Pagina creerà una nuova Revisione immutabile e sostituirà
              immediatamente il contenuto pubblicato online. Viene pubblicata la bozza{' '}
              <strong>salvata</strong>: le modifiche ai blocchi non ancora salvate restano fuori
              dalla Revisione.
            </>
          ))}
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

      <Modal
        opened={scheduleOpened}
        onClose={closeScheduleModal}
        title="Programma pubblicazione"
        centered
        zIndex={zIndex}
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
            <Button variant="default" onClick={closeScheduleModal} disabled={submitting}>
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
    </>
  );
}
