/**
 * Modal "Crea Traduzione in Lingua" (F05/T6, `LocaleSwitcher.tsx`): conferma il locale di
 * destinazione e permette di personalizzare il `title` della nuova Pagina localizzata prima
 * di chiamare `POST /app/pages/:guid/translations`.
 *
 * **Redirect condizionato dopo il successo.** La richiesta chiede di reindirizzare l'editor
 * alla nuova bozza appena creata — ma questo componente vive dentro l'editor full-screen
 * (`FullScreenEditorLayout`, montato sulla rotta `/studio/:guid`, ADR-54), la cui
 * `useUnsavedChangesGuard` intercetta solo i click su `<a href>`: una `navigate()` imperativa
 * la bypasserebbe, scartando in silenzio eventuali modifiche ai blocchi non ancora salvate
 * sulla Pagina *corrente* (mai overwrite silenzioso, CLAUDE.md). Con l'albero pulito si
 * reindirizza subito (`navigate`); con modifiche pendenti si resta sulla pagina corrente e si
 * offre il link come notifica persistente — un vero `<a href>` (`Button component="a"`), così
 * un click ci passa comunque attraverso la stessa guardia, stesso principio di "Torna alla
 * Dashboard" in `FullScreenEditorLayout.tsx`.
 *
 * Destinazione `/studio/:guid` (non più `pages/:guid?tab=content`, superata da ADR-54): la
 * nuova traduzione apre direttamente l'Editor Visivo a blocchi sulla propria rotta isolata.
 */
import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { getErrorMessage } from '../../../utils/api.utils';
import { createPageTranslation } from '../../../services/pages.service';
import type { PageRecord, PagesErrorData } from '../../../types/pages.types';
import { useHasUnsavedChanges } from '../../../hooks/useBlockEditorStore';

interface CreateTranslationModalProps {
  opened: boolean;
  onClose: () => void;
  /** Pagina sorgente da cui copiare bozza/SEO (`createTranslation`, deep-clone server-side). */
  sourcePage: PageRecord;
  /** Locale di destinazione della nuova traduzione — `null` finché la modale non è aperta. */
  locale: string | null;
  /** Notifica il chiamante (`LocaleSwitcher`) della traduzione creata, per aggiornare l'elenco. */
  onCreated: (page: PageRecord) => void;
}

/** Modal di conferma creazione traduzione, con `title` personalizzabile (F05/T6). */
export default function CreateTranslationModal({
  opened,
  onClose,
  sourcePage,
  locale,
  onCreated,
}: CreateTranslationModalProps): JSX.Element {
  const [title, setTitle] = useState(sourcePage.title);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const hasUnsavedChanges = useHasUnsavedChanges();

  // Riparte dal titolo della sorgente ogni volta che si apre su un nuovo locale — non
  // conserva una modifica precedente fra un'apertura e l'altra.
  useEffect(() => {
    if (opened) setTitle(sourcePage.title);
  }, [opened, sourcePage.title]);

  async function handleConfirm(): Promise<void> {
    if (!locale) return;
    setSubmitting(true);
    try {
      const created = await createPageTranslation(sourcePage.guid, {
        locale,
        title: title.trim() || undefined,
      });
      onCreated(created);
      onClose();

      const destination = `/studio/${created.guid}`;
      if (!hasUnsavedChanges) {
        navigate(destination);
      } else {
        notifications.show({
          color: 'green',
          autoClose: false,
          title: 'Traduzione creata',
          message: (
            <Stack gap={4}>
              <Text size="sm">
                La traduzione in "{locale}" è stata creata. Questa pagina ha modifiche non salvate:
                vai alla nuova traduzione quando sei pronto.
              </Text>
              <Button component="a" href={destination} size="xs" variant="light">
                Vai alla traduzione
              </Button>
            </Stack>
          ),
        });
      }
    } catch (err) {
      const error = err as AxiosError<PagesErrorData>;
      if (error.response?.status === 409) {
        notifications.show({
          color: 'orange',
          message: `Esiste già una traduzione in "${locale}" per questo gruppo.`,
        });
      } else {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nella creazione della traduzione'),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Crea traduzione"
      centered
      // Sopra la chrome full-screen dell'editor (z-index 1000, FullScreenEditorLayout.module.css):
      // stesso motivo/stesso valore del ConfirmModal di BlockEditorPanel.tsx.
      zIndex={1100}
    >
      <Stack gap="md">
        <Text size="sm">
          Crea una nuova Pagina in bozza per il locale <strong>{locale}</strong>, a partire dal
          contenuto e dai metadati SEO/GEO attuali di questa Pagina.
        </Text>
        <TextInput
          label="Titolo della traduzione"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          withAsterisk
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            Annulla
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            loading={submitting}
            disabled={!title.trim()}
          >
            Crea traduzione
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
