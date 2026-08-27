/**
 * Drawer "Impostazioni Sito" (F07 step 2, Global Kit): chrome dell'editor a piena finestra,
 * non una pagina — stessa cartella/stesso principio di `TemplateLibraryModal.tsx`. Espone in
 * lettura/scrittura i Global Design Tokens (`libs/globalTokensCompiler.ts`): palette di brand
 * (4 colori), tipografia di base (font + dimensione), spaziatura di base.
 *
 * Ogni modifica scrive subito in `useBlockEditorStore` via `setGlobalTokens` (già applica live
 * il CSS al `document` e la registra sulla history undo/redo condivisa — nessuna applicazione
 * DOM duplicata qui). Nessun revert-on-close: le modifiche sono già committate live nello
 * store (stesso principio di `onSetAndCommit` nell'ispettore prop, `PropField.tsx`) —
 * annullarle è compito di Ctrl+Z, non di questo Drawer.
 *
 * Il pulsante "Salva" persiste sul server (`PUT app/settings/global-tokens`, Admin+ —
 * `GuardAdmin` lato server, 403 sotto quella soglia): resta visibile ma disabilitato con
 * tooltip esplicito sotto quella soglia, mai nascosto in silenzio (coerente con lo stile del
 * resto della chrome admin).
 */
import { useState } from 'react';
import {
  Button,
  Divider,
  Drawer,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDeviceFloppy } from '@tabler/icons-react';
import type { AxiosError } from 'axios';
import { ThemeEditorColorPicker } from '../../../components/theme-editor/ThemeEditorColorPicker';
import { useAuthStore } from '../../../hooks/useAuth';
import { useBlockEditorStore, useGlobalTokens } from '../../../hooks/useBlockEditorStore';
import {
  DEFAULT_GLOBAL_TOKENS,
  GLOBAL_TOKENS_DIMENSION_UNITS,
  type GlobalTokens,
} from '../../../libs/globalTokensCompiler';
import { saveGlobalTokensApi, toGlobalTokensDto } from '../../../services/settings.service';
import { THEME_FONT_FAMILIES, type ThemeFontFamilyId } from '../../../theme';
import { AppUserRoles } from '../../../types/common.types';

/** Opzioni del `Select` font, dalla whitelist condivisa col Theme Customizer (nessuna mappa duplicata). */
const FONT_OPTIONS = Object.entries(THEME_FONT_FAMILIES).map(([value, { label }]) => ({
  value,
  label,
}));

/** Opzioni unità dei campi dimensionali (`px`/`em`/`rem`, niente `%` — vedi `GLOBAL_TOKENS_DIMENSION_UNITS`). */
const UNIT_OPTIONS = [...GLOBAL_TOKENS_DIMENSION_UNITS];

export interface GlobalTokensDrawerProps {
  opened: boolean;
  onClose: () => void;
}

/** Drawer "Impostazioni Sito": editor dei Global Design Tokens (palette/tipografia/spaziatura). */
export default function GlobalTokensDrawer({
  opened,
  onClose,
}: GlobalTokensDrawerProps): JSX.Element {
  // `null` finché l'idratazione iniziale (`FullScreenEditorLayout.tsx`, effect a mount) non è
  // arrivata: qui si mostra solo il default di fabbrica per il rendering iniziale, senza
  // scriverlo nello store (che resta compito esclusivo di `hydrateGlobalTokens`).
  const globalTokens = useGlobalTokens() ?? DEFAULT_GLOBAL_TOKENS;
  const setGlobalTokens = useBlockEditorStore((state) => state.setGlobalTokens);
  const user = useAuthStore((state) => state.user);
  const isAdminOrAbove = user?.role !== undefined && user.role <= AppUserRoles.Admin;

  const [saving, setSaving] = useState(false);

  /** Applica una mutazione ai token correnti e la scrive subito nello store (anteprima live). */
  function updateTokens(mutate: (draft: GlobalTokens) => void): void {
    const draft = structuredClone(globalTokens);
    mutate(draft);
    setGlobalTokens(draft);
  }

  /** Persiste i token correnti sul server (Admin+). */
  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      await saveGlobalTokensApi(toGlobalTokensDto(globalTokens));
      notifications.show({
        color: 'green',
        title: 'Impostazioni sito salvate',
        message: 'I Global Design Tokens sono stati salvati per tutti gli utenti.',
      });
    } catch (err) {
      const error = err as AxiosError<{ message?: string }>;
      notifications.show({
        color: 'red',
        title: 'Salvataggio non riuscito',
        message: error.response?.data?.message ?? 'Errore durante il salvataggio dei token.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer opened={opened} onClose={onClose} position="right" title="Impostazioni Sito" size="md">
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={5}>Palette</Title>
          <ThemeEditorColorPicker
            label="Primario"
            value={globalTokens.palette.primary}
            aria-label="Colore primario"
            onChange={(value) => updateTokens((draft) => (draft.palette.primary = value))}
          />
          <ThemeEditorColorPicker
            label="Secondario"
            value={globalTokens.palette.secondary}
            aria-label="Colore secondario"
            onChange={(value) => updateTokens((draft) => (draft.palette.secondary = value))}
          />
          <ThemeEditorColorPicker
            label="Testo"
            value={globalTokens.palette.text}
            aria-label="Colore testo"
            onChange={(value) => updateTokens((draft) => (draft.palette.text = value))}
          />
          <ThemeEditorColorPicker
            label="Accento"
            value={globalTokens.palette.accent}
            aria-label="Colore accento"
            onChange={(value) => updateTokens((draft) => (draft.palette.accent = value))}
          />
        </Stack>

        <Divider />

        <Stack gap="xs">
          <Title order={5}>Tipografia</Title>
          <Select
            label="Font di base"
            data={FONT_OPTIONS}
            value={globalTokens.typography.mainFont}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1200 }}
            onChange={(next) =>
              updateTokens((draft) => {
                draft.typography.mainFont = (next ?? draft.typography.mainFont) as ThemeFontFamilyId;
              })
            }
          />
          <Group gap="sm" align="flex-end" wrap="nowrap">
            <NumberInput
              label="Dimensione di base"
              min={1}
              style={{ flex: 1 }}
              value={globalTokens.typography.baseSize.value}
              onChange={(next) =>
                updateTokens((draft) => {
                  draft.typography.baseSize.value = typeof next === 'number' ? next : draft.typography.baseSize.value;
                })
              }
            />
            <Select
              aria-label="Unità dimensione di base"
              w={90}
              data={UNIT_OPTIONS}
              value={globalTokens.typography.baseSize.unit}
              allowDeselect={false}
              comboboxProps={{ zIndex: 1200 }}
              onChange={(next) =>
                updateTokens((draft) => {
                  draft.typography.baseSize.unit =
                    (next as GlobalTokens['typography']['baseSize']['unit']) ??
                    draft.typography.baseSize.unit;
                })
              }
            />
          </Group>
        </Stack>

        <Divider />

        <Stack gap="xs">
          <Title order={5}>Spaziatura</Title>
          <Group gap="sm" align="flex-end" wrap="nowrap">
            <NumberInput
              label="Unità di base"
              min={0}
              style={{ flex: 1 }}
              value={globalTokens.spacing.baseUnit.value}
              onChange={(next) =>
                updateTokens((draft) => {
                  draft.spacing.baseUnit.value = typeof next === 'number' ? next : draft.spacing.baseUnit.value;
                })
              }
            />
            <Select
              aria-label="Unità spaziatura di base"
              w={90}
              data={UNIT_OPTIONS}
              value={globalTokens.spacing.baseUnit.unit}
              allowDeselect={false}
              comboboxProps={{ zIndex: 1200 }}
              onChange={(next) =>
                updateTokens((draft) => {
                  draft.spacing.baseUnit.unit =
                    (next as GlobalTokens['spacing']['baseUnit']['unit']) ??
                    draft.spacing.baseUnit.unit;
                })
              }
            />
          </Group>
        </Stack>

        <Divider />

        <Group justify="flex-end">
          <Tooltip label="Richiede ruolo Admin o superiore" disabled={isAdminOrAbove} withArrow>
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              loading={saving}
              disabled={!isAdminOrAbove}
              onClick={() => void handleSave()}
            >
              Salva
            </Button>
          </Tooltip>
        </Group>

        <Text size="xs" c="dimmed">
          Le modifiche sono già applicate live all&apos;editor. Il salvataggio le rende
          permanenti per tutti gli utenti dell&apos;installazione.
        </Text>
      </Stack>
    </Drawer>
  );
}
