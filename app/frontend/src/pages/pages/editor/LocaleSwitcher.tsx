/**
 * Locale Switcher della topbar dell'editor full-screen (F05/T6, `FullScreenEditorLayout.tsx`).
 * Elenca i Locale attivi (`GET app/settings/multilingual`) e, per ciascuno diverso da quello
 * della Pagina corrente, mostra se il gruppo di traduzione (`GET app/pages/:guid/translations`,
 * bozze incluse) ha già una riga in quel Locale: se sì, un link diretto a quella Pagina; se
 * no, l'azione "Crea traduzione" (badge), che apre `CreateTranslationModal`.
 *
 * **Perché un `Menu.Item component="a" href`, non `onClick` + `navigate`.** Stesso principio
 * di "Torna alla Dashboard" in `FullScreenEditorLayout.tsx`: `useUnsavedChangesGuard`
 * intercetta in fase di cattura solo i click su `<a href>` interni. Un `onClick` imperativo
 * bypasserebbe la guardia e scarterebbe in silenzio le modifiche ai blocchi non ancora
 * salvate — esattamente l'overwrite silenzioso che CLAUDE.md vieta. La navigazione risultante
 * è quindi un vero cambio di pagina (non una transizione SPA), che reinizializza da sé lo
 * store Zustand dell'editor al caricamento della Pagina di destinazione (`BlockEditorPanel`,
 * `initTree` sull'effetto di `draftContent`) — nessuna sincronizzazione ad hoc necessaria qui.
 */
import { useEffect, useState } from 'react';
import { Badge, Button, Center, Group, Loader, Menu, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconChevronDown, IconLanguage, IconPlus } from '@tabler/icons-react';
import { getErrorMessage } from '../../../utils/api.utils';
import { fetchPageTranslations } from '../../../services/pages.service';
import { getMultilingualConfigApi } from '../../../services/settings.service';
import {
  PAGE_STATUS_COLORS,
  PAGE_STATUS_LABELS,
  type PageRecord,
  type PageStatus,
  type PageTranslationSummary,
} from '../../../types/pages.types';
import CreateTranslationModal from './CreateTranslationModal';

/** Etichetta di stato per un locale, con fallback sul codice grezzo se non fra i cinque noti. */
function statusLabel(status: string): string {
  return status in PAGE_STATUS_LABELS ? PAGE_STATUS_LABELS[status as PageStatus] : status;
}

/** Colore Mantine dello stato, con fallback neutro. */
function statusColor(status: string): string {
  return status in PAGE_STATUS_COLORS ? PAGE_STATUS_COLORS[status as PageStatus] : 'gray';
}

/**
 * Bandiera del Locale, derivata dal sottotag regione (es. `it-IT` → 🇮🇹) via i simboli
 * Unicode "regional indicator" — nessuna mappa statica locale→bandiera da inventare.
 * Fallback su un globo quando il Locale non porta un sottotag regione a due lettere.
 */
function localeFlag(locale: string): string {
  const region = locale.split('-')[1];
  if (!region || region.length !== 2) return '🌐';
  const codePoints = [...region.toUpperCase()].map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

interface LocaleSwitcherProps {
  /** La Pagina in editing — sorgente del locale corrente e delle eventuali traduzioni. */
  page: PageRecord;
}

/** Selettore di Locale della topbar dell'editor, con azione "Crea traduzione" (F05/T6). */
export default function LocaleSwitcher({ page }: LocaleSwitcherProps): JSX.Element {
  const [activeLocales, setActiveLocales] = useState<string[]>([]);
  const [translations, setTranslations] = useState<PageTranslationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createLocale, setCreateLocale] = useState<string | null>(null);

  /** Ricarica solo l'elenco delle traduzioni del gruppo (dopo una creazione riuscita). */
  async function reloadTranslations(): Promise<void> {
    try {
      const rows = await fetchPageTranslations(page.guid);
      setTranslations(rows);
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nel caricamento delle traduzioni'),
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getMultilingualConfigApi(), fetchPageTranslations(page.guid)])
      .then(([config, rows]) => {
        if (cancelled) return;
        setActiveLocales(config.active);
        setTranslations(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel caricamento dei Locale'),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page.guid]);

  return (
    <>
      <Menu shadow="md" position="bottom-start" withinPortal zIndex={1100}>
        <Menu.Target>
          <Tooltip label="Locale della pagina" withArrow>
            <Button
              variant="default"
              size="sm"
              leftSection={<IconLanguage size={16} />}
              rightSection={<IconChevronDown size={14} />}
              loading={loading}
            >
              {localeFlag(page.locale)} {page.locale}
            </Button>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Traduzioni</Menu.Label>
          {loading && (
            <Center p="sm">
              <Loader size="xs" />
            </Center>
          )}
          {!loading &&
            activeLocales.map((locale) => {
              if (locale === page.locale) {
                return (
                  <Menu.Item key={locale} disabled leftSection={<IconCheck size={14} />}>
                    {localeFlag(locale)} {locale} · pagina corrente
                  </Menu.Item>
                );
              }
              const sibling = translations.find((t) => t.locale === locale);
              if (sibling) {
                return (
                  <Menu.Item
                    key={locale}
                    component="a"
                    href={`/pages/${sibling.guid}`}
                    rightSection={
                      <Badge size="xs" variant="light" color={statusColor(sibling.status)}>
                        {statusLabel(sibling.status)}
                      </Badge>
                    }
                  >
                    <Text size="sm" truncate="end" maw={180}>
                      {localeFlag(locale)} {locale} — {sibling.title}
                    </Text>
                  </Menu.Item>
                );
              }
              return (
                <Menu.Item
                  key={locale}
                  onClick={() => setCreateLocale(locale)}
                  leftSection={<IconPlus size={14} />}
                >
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm">
                      {localeFlag(locale)} {locale}
                    </Text>
                    <Badge size="xs" variant="light" color="blue">
                      Crea traduzione
                    </Badge>
                  </Group>
                </Menu.Item>
              );
            })}
        </Menu.Dropdown>
      </Menu>

      <CreateTranslationModal
        opened={createLocale !== null}
        onClose={() => setCreateLocale(null)}
        sourcePage={page}
        locale={createLocale}
        onCreated={() => void reloadTranslations()}
      />
    </>
  );
}
