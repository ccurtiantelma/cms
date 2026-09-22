import { useState } from 'react';

/** Apertura dei tre modali del blocco (conferma eliminazione, preset, sezione globale). */
export function useBlockModalState() {
  const [confirmOpened, setConfirmOpened] = useState(false);
  const [presetOpened, setPresetOpened] = useState(false);
  const [convertOpened, setConvertOpened] = useState(false);
  return {
    confirmOpened,
    presetOpened,
    convertOpened,
    openConfirm: () => setConfirmOpened(true),
    openPreset: () => setPresetOpened(true),
    openConvert: () => setConvertOpened(true),
    closeConfirm: () => setConfirmOpened(false),
    closePreset: () => setPresetOpened(false),
    closeConvert: () => setConvertOpened(false),
  };
}
