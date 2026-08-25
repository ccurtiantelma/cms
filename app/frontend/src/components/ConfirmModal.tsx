/**
 * Modal di conferma generico per azioni distruttive/sensibili (soft delete,
 * reset MFA, impersonificazione, ecc.). Corpo libero via `children`, pulsanti
 * "Annulla" + azione di conferma colorata.
 * Sostituisce `window.confirm` (vietato) con un Modal Mantine.
 */
import type { ReactNode } from 'react';
import { Button, Group, Modal, Text } from '@mantine/core';

interface ConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Mostra lo stato di caricamento sul pulsante di conferma e disabilita "Annulla". */
  loading?: boolean;
  title: string;
  /** Etichetta del pulsante di conferma, es. "Disattiva". */
  confirmLabel: string;
  /** Colore Mantine del pulsante di conferma; default tema (blu). */
  confirmColor?: string;
  /**
   * `z-index` del Modal — di norma il default Mantine basta. Va alzato esplicitamente solo
   * quando il chiamante vive sotto un overlay con `z-index` più alto (es. l'editor
   * full-screen, `FullScreenEditorLayout`), il cui `position: fixed` altrimenti coprirebbe
   * il Modal montato in portale.
   */
  zIndex?: number;
  /** Testo/markup esplicativo mostrato nel corpo del modal. */
  children: ReactNode;
}

/** Modal di conferma riutilizzabile per le azioni che richiedono approvazione. */
export default function ConfirmModal({
  opened,
  onClose,
  onConfirm,
  loading = false,
  title,
  confirmLabel,
  confirmColor,
  zIndex,
  children,
}: ConfirmModalProps): JSX.Element {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered zIndex={zIndex}>
      <Text>{children}</Text>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose} disabled={loading}>
          Annulla
        </Button>
        <Button color={confirmColor} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
