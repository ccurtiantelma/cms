/**
 * Modal di conferma/azione aperti dalla toolbar di un blocco: "Elimina" (`ConfirmModal`),
 * "Salva come Preset Globale" (F14-01, stesso `usePresetStore` di `AdvancedTab.tsx`) e
 * "Converti in Sezione Globale" (ADR-55, stesso `ConvertToGlobalSectionModal.tsx`). Un solo
 * registro/componente condiviso col Property Inspector, mai una seconda implementazione.
 */
import { useState } from 'react';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import ConfirmModal from '../../../../components/ConfirmModal';
import ConvertToGlobalSectionModal from '../ConvertToGlobalSectionModal';
import { usePresetStore } from '../usePresetStore';
import type { BlockNode } from '../block-tree.utils';

/** Sopra la chrome full-screen dell'editor (z-index 1000, `FullScreenEditorLayout.module.css`). */
const MODAL_Z_INDEX = 1100;

interface BlockModalsProps {
  node: BlockNode;
  label: string;
  childCount: number;
  confirmOpened: boolean;
  presetOpened: boolean;
  convertOpened: boolean;
  onCloseConfirm: () => void;
  onClosePreset: () => void;
  onCloseConvert: () => void;
}

export default function BlockModals({
  node,
  label,
  childCount,
  confirmOpened,
  presetOpened,
  convertOpened,
  onCloseConfirm,
  onClosePreset,
  onCloseConvert,
}: BlockModalsProps): JSX.Element {
  const removeBlockAction = useBlockEditorStore((state) => state.removeBlockAction);
  const convertToGlobalSectionAction = useBlockEditorStore(
    (state) => state.convertToGlobalSectionAction,
  );
  const savePreset = usePresetStore((state) => state.savePreset);
  const [presetName, setPresetName] = useState('');

  /** Salva l'intero sottoalbero della Sezione corrente nel registro locale dei preset. */
  function handleSavePreset(): void {
    const name = presetName.trim();
    if (!name) return;
    savePreset(name, node);
    setPresetName('');
    onClosePreset();
  }

  return (
    <>
      {confirmOpened && (
        <ConfirmModal
          opened
          onClose={onCloseConfirm}
          onConfirm={() => {
            removeBlockAction(node.id);
            onCloseConfirm();
          }}
          title={`Elimina blocco "${label}"`}
          confirmLabel="Elimina"
          confirmColor="red"
          zIndex={MODAL_Z_INDEX}
        >
          {childCount > 0
            ? `Il blocco e i suoi ${childCount} blocchi figli vengono rimossi dalla bozza. L'eliminazione diventa definitiva al salvataggio.`
            : "Il blocco viene rimosso dalla bozza. L'eliminazione diventa definitiva al salvataggio."}
        </ConfirmModal>
      )}

      {presetOpened && (
        <Modal
          opened
          onClose={onClosePreset}
          title="Salva come Preset Globale"
          centered
          zIndex={MODAL_Z_INDEX}
        >
          <Stack>
            <TextInput
              label="Nome del preset"
              placeholder="Es. Hero aziendale"
              value={presetName}
              onChange={(event) => setPresetName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSavePreset();
              }}
              data-autofocus
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClosePreset}>
                Annulla
              </Button>
              <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
                Salva
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}

      {/* `key` azzera nome e caricamento se la selezione cambia a modal aperto. */}
      {convertOpened && (
        <ConvertToGlobalSectionModal
          key={node.id}
          opened
          onClose={onCloseConvert}
          onConfirm={(title) => convertToGlobalSectionAction(node.id, title)}
          blockLabel={label}
        />
      )}
    </>
  );
}
