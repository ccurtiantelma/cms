/**
 * Scheda "Pagina" della sidebar sinistra dell'editor full-screen (E01): form compatto
 * Titolo/Slug/SEO essenziale, per un ritocco veloce senza uscire dal canvas verso la
 * scheda "Metadati" del dettaglio. Stesso `PATCH /app/pages/:guid` a lock ottimistico
 * della scheda "Metadati" (`PagePageDetail.tsx`, `handleMetadataSubmit`) — non una
 * seconda via di scrittura: stesso servizio, stesso `409` mai silenzioso.
 *
 * `draftSeo` è sostituito per intero dal backend a ogni `PATCH` che lo include
 * (`pages.service.ts` backend, `dto.draftSeo !== undefined` ⇒ colonna riscritta, mai
 * unita campo per campo): il payload qui parte sempre da uno spread di `page.draftSeo`
 * esistente e sovrascrive solo `metaTitle`/`metaDescription` — altrimenti un salvataggio
 * da questa scheda cancellerebbe silenziosamente URL canonica, Open Graph, riepilogo AI e
 * FAQ già compilati nella scheda "SEO"/"GEO" del dettaglio.
 */
import { useEffect, useState } from 'react';
import { Button, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { AxiosError } from 'axios';
import { getErrorMessage } from '../../../../utils/api.utils';
import { updatePage } from '../../../../services/pages.service';
import type { PageRecord, PagesErrorData, UpdatePagePayload } from '../../../../types/pages.types';
import styles from './PageSettingsTab.module.css';

export interface PageSettingsTabProps {
  /** La Pagina in editing — assente nel Builder delle Sezioni Globali (ADR-40). */
  page?: PageRecord;
  /** Propaga la Pagina restituita da un salvataggio riuscito (nuova `version`). */
  onPageUpdated?: (page: PageRecord) => void;
  /** Notifica di conflitto di editing (`409 PAGE_VERSION_CONFLICT`) — mai overwrite silenzioso. */
  onVersionConflict?: () => void;
}

interface PageSettingsFormValues {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
}

function seoString(seo: Record<string, unknown> | undefined, key: string): string {
  const value = seo?.[key];
  return typeof value === 'string' ? value : '';
}

function valuesFromPage(page: PageRecord): PageSettingsFormValues {
  const seo = (page.draftSeo ?? {}) as Record<string, unknown>;
  return {
    title: page.title,
    slug: page.slug,
    metaTitle: seoString(seo, 'metaTitle'),
    metaDescription: seoString(seo, 'metaDescription'),
  };
}

/** Form compatto Titolo/Slug/SEO essenziale della Pagina in editing. */
export default function PageSettingsTab({
  page,
  onPageUpdated,
  onVersionConflict,
}: PageSettingsTabProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<PageSettingsFormValues>({
    initialValues: page
      ? valuesFromPage(page)
      : { title: '', slug: '', metaTitle: '', metaDescription: '' },
    validate: {
      title: (value) => (value.trim() ? null : 'Titolo obbligatorio'),
      slug: (value) => (value.trim() ? null : 'Slug obbligatorio'),
    },
  });

  // Riallinea il form quando la Pagina servita dal dettaglio cambia davvero (salvataggio
  // riuscito da un'altra scheda, ricaricamento) — la dipendenza è `guid:version`, non
  // l'identità di `page`, stesso principio della `contentSignature` di
  // `BlockEditorPanel.tsx`: non si vuole scartare una modifica non ancora salvata qui a
  // ogni render del componente padre.
  const pageSignature = page ? `${page.guid}:${page.version}` : null;
  useEffect(() => {
    if (page) form.setValues(valuesFromPage(page));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSignature]);

  async function handleSubmit(values: PageSettingsFormValues): Promise<void> {
    if (!page) return;
    setSubmitting(true);
    try {
      const payload: UpdatePagePayload = {
        version: page.version,
        title: values.title.trim(),
        slug: values.slug.trim(),
        draftSeo: {
          ...page.draftSeo,
          metaTitle: values.metaTitle.trim() || undefined,
          metaDescription: values.metaDescription.trim() || undefined,
        },
      };
      const updated = await updatePage(page.guid, payload);
      onPageUpdated?.(updated);
      notifications.show({ color: 'green', message: 'Pagina aggiornata con successo' });
    } catch (err) {
      const error = err as AxiosError<PagesErrorData>;
      const code = error.response?.data?.code;
      if (code === 'PAGE_VERSION_CONFLICT') {
        onVersionConflict?.();
      } else if (code === 'PAGE_SLUG_DUPLICATE') {
        form.setFieldError('slug', 'Slug già in uso per questo locale/genitore');
      } else {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, "Errore nell'aggiornamento della Pagina"),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!page) {
    return (
      <div className={styles.root}>
        <Text size="sm" c="dimmed" ta="center" className={styles.emptyState}>
          Impostazioni Pagina non disponibili in questo contesto.
        </Text>
      </div>
    );
  }

  return (
    <form className={styles.root} onSubmit={form.onSubmit((values) => void handleSubmit(values))}>
      <Stack gap="sm">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Impostazioni Pagina
        </Text>
        <TextInput label="Titolo" size="xs" withAsterisk {...form.getInputProps('title')} />
        <TextInput label="Slug" size="xs" withAsterisk {...form.getInputProps('slug')} />
        <TextInput label="Meta title" size="xs" {...form.getInputProps('metaTitle')} />
        <Textarea
          label="Meta description"
          size="xs"
          autosize
          minRows={2}
          {...form.getInputProps('metaDescription')}
        />
        <Button type="submit" size="xs" loading={submitting} disabled={!form.isValid()}>
          Salva
        </Button>
      </Stack>
    </form>
  );
}
