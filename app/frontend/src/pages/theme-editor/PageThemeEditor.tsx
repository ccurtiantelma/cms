/**
 * Editor tema (ADR-4, contratto v4) — pagina dedicata alla personalizzazione
 * del tema di installazione, SuperAdmin only.
 *
 * Header sticky (titolo + toggle scheme + azioni, tutto icon-only). Sotto:
 * la sidebar applicativa (LayoutProtected, solo su questa rotta) mostra le
 * ancore alle sezioni; lo spazio centrale, più ampio, impila le sezioni con
 * titolo + demo reale dei componenti (`ThemeEditorSectionDemo`); a destra una
 * barra fissa con i controlli della sezione attiva
 * (`ThemeEditorSectionPanel` + `ThemeEditorColorPicker` dei token per-scheme), sincronizzata
 * con l'ancora cliccata in sidebar (hash dell'URL).
 *
 * Ogni modifica scrive il draft nel `ThemeColorProvider`: l'anteprima è
 * l'intera app (tema Mantine rimemoizzato + variabili CSS `--app-*`).
 */
import { useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconClick,
  IconDeviceFloppy,
  IconMoon,
  IconRestore,
  IconSun,
  IconX,
} from '@tabler/icons-react';
import type { AxiosError } from 'axios';
import { useLocation } from 'react-router-dom';
import { ThemeEditorColorPicker } from '../../components/theme-editor/ThemeEditorColorPicker';
import { ThemeEditorSectionDemo } from '../../components/theme-editor/ThemeEditorDemos';
import { ThemeEditorSectionPanel } from '../../components/theme-editor/ThemeEditorPanels';
import { THEME_EDITOR_SECTIONS } from '../../config/themeEditorSections';
import { useThemeColorStore } from '../../hooks/useThemeColor';
import { DEFAULT_THEME_CONFIG, ThemeConfig, ThemeTokenName } from '../../theme';
import { saveThemeConfigApi } from '../../services/settings.service';
import classes from './PageThemeEditor.module.css';

/** Formato hex obbligatorio dei token (ADR-4): input parziali vengono ignorati. */
const HEX_TOKEN_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Pagina "Editor tema": sezioni impilate al centro con demo reale dei
 * componenti, barra di modifica fissa a destra sincronizzata con l'ancora
 * attiva in sidebar; anteprima live tramite `ThemeColorProvider`.
 */
export default function PageThemeEditor(): JSX.Element {
  const themeConfig = useThemeColorStore((state) => state.themeConfig);
  const setThemeConfig = useThemeColorStore((state) => state.setThemeConfig);
  const applyServerConfig = useThemeColorStore((state) => state.applyServerConfig);
  const location = useLocation();

  const [editScheme, setEditScheme] = useState<'light' | 'dark'>('light');
  const [saving, setSaving] = useState(false);
  const [resetModalOpened, { open: openResetModal, close: closeResetModal }] = useDisclosure(false);

  const savedConfigRef = useRef(themeConfig);

  // La sezione "attiva" per la barra a destra segue l'ancora cliccata in
  // sidebar (hash dell'URL) — nessuno stato duplicato, unica fonte di verità.
  // Senza hash (primo caricamento) il default è "Generale", come già fa la
  // sidebar in `LayoutProtected` per evidenziare la prima voce.
  const activeKey = location.hash ? location.hash.slice(1) : THEME_EDITOR_SECTIONS[0]?.key;
  const activeSection = THEME_EDITOR_SECTIONS.find((section) => section.key === activeKey) ?? null;

  /** Applica una mutazione al draft: clona il config, muta, imposta (anteprima live). */
  const updateConfig = (mutate: (draft: ThemeConfig) => void): void => {
    const draft = structuredClone(themeConfig);
    mutate(draft);
    setThemeConfig(draft);
  };

  /**
   * Aggiorna un token nel solo scheme in modifica. Update mirato (solo lo
   * scheme toccato) invece di `structuredClone` dell'intero config: questo è
   * il percorso agganciato direttamente al drag del `ColorPicker` (decine di
   * eventi/sec), non ha senso clonare in profondità anche typography/shadows/
   * components ad ogni pixel di movimento.
   */
  const updateSchemeToken = (token: ThemeTokenName, value: string): void => {
    if (!HEX_TOKEN_REGEX.test(value)) return;
    setThemeConfig({
      ...themeConfig,
      [editScheme]: { ...themeConfig[editScheme], [token]: value },
    });
  };

  /** Aggiorna un token in entrambi gli scheme (sezione Navbar) — stesso update mirato. */
  const updateBothSchemesToken = (token: ThemeTokenName, value: string): void => {
    if (!HEX_TOKEN_REGEX.test(value)) return;
    setThemeConfig({
      ...themeConfig,
      light: { ...themeConfig.light, [token]: value },
      dark: { ...themeConfig.dark, [token]: value },
    });
  };

  /** Ripristina l'ultimo stato salvato. */
  const handleCancel = (): void => {
    if (saving) return;
    setThemeConfig(savedConfigRef.current);
  };

  /** Ricarica i default di fabbrica come draft (anteprima live, da salvare). */
  const handleReset = (): void => {
    setThemeConfig(DEFAULT_THEME_CONFIG);
    closeResetModal();
  };

  /** Persiste il draft corrente sul DB per tutti gli utenti (PUT SuperAdmin). */
  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await saveThemeConfigApi(themeConfig);
      applyServerConfig(saved);
      savedConfigRef.current = saved;
      notifications.show({
        color: 'green',
        title: 'Tema salvato',
        message: "Configurazione salvata per tutti gli utenti dell'installazione.",
      });
    } catch (err) {
      const error = err as AxiosError<{ message?: string }>;
      notifications.show({
        color: 'red',
        title: 'Salvataggio non riuscito',
        message: error.response?.data?.message ?? 'Errore durante il salvataggio del tema.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={classes.page}>
      <div className={classes.header}>
        <Title order={2}>Editor tema</Title>
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value={editScheme}
            onChange={(value) => setEditScheme(value as 'light' | 'dark')}
            aria-label="Scheme in modifica"
            data={[
              { value: 'light', label: <IconSun size={16} /> },
              { value: 'dark', label: <IconMoon size={16} /> },
            ]}
          />
          <Tooltip label="Salva">
            <ActionIcon
              onClick={() => void handleSave()}
              loading={saving}
              aria-label="Salva"
              size="lg"
            >
              <IconDeviceFloppy size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Annulla">
            <ActionIcon
              variant="default"
              onClick={handleCancel}
              disabled={saving}
              aria-label="Annulla"
              size="lg"
            >
              <IconX size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Ripristina default">
            <ActionIcon
              variant="light"
              color="red"
              onClick={openResetModal}
              disabled={saving}
              aria-label="Ripristina default"
              size="lg"
            >
              <IconRestore size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>

      <Modal
        opened={resetModalOpened}
        onClose={closeResetModal}
        title="Ripristina default"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Sei davvero sicuro che vuoi Ripristinare tutte le impostazioni del tema allo stato
            originale?
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeResetModal}>
              Annulla
            </Button>
            <Button color="red" onClick={handleReset}>
              Ripristina
            </Button>
          </Group>
        </Stack>
      </Modal>

      <div className={classes.body}>
        <ScrollArea
          className={classes.center}
          scrollbars="y"
          style={{ background: themeConfig[editScheme].pageBg }}
        >
          <Stack gap={0} className={classes.centerContent}>
            {THEME_EDITOR_SECTIONS.map((section, index) => (
              <div key={section.key} id={section.key} className={classes.section}>
                <Title order={3} mb={4} style={{ color: themeConfig[editScheme].textPrimary }}>
                  {section.label}
                </Title>
                <Text size="xs" mb="md" style={{ color: themeConfig[editScheme].textSecondary }}>
                  {section.description}
                </Text>
                <ThemeEditorSectionDemo
                  section={section}
                  config={themeConfig}
                  scheme={editScheme}
                />
                {index < THEME_EDITOR_SECTIONS.length - 1 && (
                  <Divider className={classes.sectionDivider} />
                )}
              </div>
            ))}
          </Stack>
        </ScrollArea>

        <ScrollArea className={classes.panel} scrollbars="y">
          {!activeSection && (
            <div className={classes.emptyState}>
              <IconClick size={56} stroke={1.3} />
              <Text c="dimmed" fw={500}>
                Seleziona un componente
              </Text>
            </div>
          )}

          {activeSection && (
            <>
              <div className={classes.panelHeader}>
                <Title order={4}>{activeSection.label}</Title>
              </div>

              <Stack gap="md" className={classes.panelBody}>
                {activeSection.tokens && (
                  <Stack gap="sm">
                    {activeSection.tokens.map(({ token, label }) => (
                      <ThemeEditorColorPicker
                        key={token}
                        label={label}
                        value={
                          activeSection.scopedByScheme
                            ? themeConfig[editScheme][token]
                            : themeConfig.light[token]
                        }
                        onChange={(value) =>
                          activeSection.scopedByScheme
                            ? updateSchemeToken(token, value)
                            : updateBothSchemesToken(token, value)
                        }
                        aria-label={label}
                      />
                    ))}
                  </Stack>
                )}

                <ThemeEditorSectionPanel
                  sectionKey={activeSection.key}
                  config={themeConfig}
                  editScheme={editScheme}
                  updateConfig={updateConfig}
                />
              </Stack>
            </>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
