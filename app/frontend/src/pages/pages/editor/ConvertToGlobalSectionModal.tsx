/**
 * Modal "Converti in Sezione Globale" (ADR-55, estende ADR-40): unico punto d'ingresso
 * condiviso da entrambi i chiamanti chrome (Floating Toolbar `BlockHoverOverlay.tsx`/
 * `EditorBlockWrapper.tsx` e Property Inspector `inspector/AdvancedTab.tsx`), invece di due
 * copie dello stesso Modal — a differenza di "Salva come Preset Globale" (F14-01), che vive
 * duplicato nei due file perché lì non c'era una chiamata di rete né uno stato di
 * caricamento da coordinare.
 *
 * Combina in un solo passaggio la richiesta del titolo della nuova Sezione Globale e la
 * conferma esplicita dell'azione — irreversibile in modo non ovvio per l'utente: il
 * sottoalbero selezionato viene estratto e sostituito da un puntatore `globalRef` sulla
 * Pagina corrente. "Annulla" (Ctrl+Z) riporta l'albero locale a prima della sostituzione, ma
 * non elimina la Sezione Globale nel frattempo creata sul server (stesso principio di
 * "Elimina", un soft-delete a sé che Ctrl+Z non annulla mai) — da qui l'avviso esplicito nel
 * corpo del modal, non un semplice `window.confirm` (vietato, CLAUDE.md): la digitazione
 * obbligatoria del nome più il pulsante "Converti" fungono già da conferma deliberata, sullo
 * stesso modello del modal "Salva come Preset Globale".
 */
import { useState } from 'react';
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';

export interface ConvertToGlobalSectionModalProps {
  opened: boolean;
  onClose: () => void;
  /**
   * Esegue `convertToGlobalSectionAction(id, title)` (`useBlockEditorStore.ts`). Ritorna
   * `true` se la Sezione Globale è stata creata (il modal si chiude), `false` se la
   * creazione è fallita — l'errore è già stato notificato dallo store, il modal resta
   * aperto col nome digitato per un nuovo tentativo senza doverlo ridigitare.
   */
  onConfirm: (title: string) => Promise<boolean>;
  /** Etichetta leggibile del blocco convertito (`BLOCK_TYPES[...].meta.label`), per il testo esplicativo. */
  blockLabel: string;
}

/** Modal di nome + conferma per l'estrazione di un contenitore/sezione in una Sezione Globale. */
export default function ConvertToGlobalSectionModal({
  opened,
  onClose,
  onConfirm,
  blockLabel,
}: ConvertToGlobalSectionModalProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  /** Chiusura manuale: mai mentre la richiesta è in volo (stesso principio di `ConfirmModal`). */
  function handleClose(): void {
    if (loading) return;
    setTitle('');
    onClose();
  }

  async function handleConfirm(): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    const succeeded = await onConfirm(trimmed);
    setLoading(false);
    if (succeeded) {
      setTitle('');
      onClose();
    }
    // Fallito: il modal resta aperto di proposito, il nome digitato resta per un nuovo
    // tentativo — l'errore è già visibile via `notifications.show` (store).
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Converti in Sezione Globale"
      centered
      // Sopra la chrome full-screen dell'editor (z-index 1000, `FullScreenEditorLayout.module.css`):
      // stesso valore già usato dagli altri modal montati dentro il Canvas/l'Ispettore
      // (`ConfirmModal` in `EditorBlockWrapper.tsx`, "Salva come Preset Globale").
      zIndex={1100}
    >
      <Stack>
        <Text size="sm">
          Il blocco &laquo;{blockLabel}&raquo; viene estratto dalla Pagina e sostituito con un
          riferimento a una nuova Sezione Globale. Da quel momento, modificarne il contenuto
          dal modulo Sezioni Globali aggiorna ogni Pagina che la referenzia — non solo questa.
        </Text>
        <TextInput
          label="Nome della Sezione Globale"
          placeholder="Es. Hero aziendale"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleConfirm();
          }}
          disabled={loading}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose} disabled={loading}>
            Annulla
          </Button>
          <Button onClick={() => void handleConfirm()} loading={loading} disabled={!title.trim()}>
            Converti
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
