/**
 * Modale di creazione di un Template di tema (RFC-40 Opzione B). Tre soli
 * campi in ingresso — titolo, tipo, lingua — coerenti con `CreateSiteTemplateDto`:
 * il resto (`contentTree`, `displayConditions`, `priority`) resta ai default
 * del backend (albero vuoto, nessuna condizione, priorità 0), da comporre
 * poi nell'Editor a blocchi. `isPublished` non è un campo qui: un Template
 * appena creato nasce bozza, si pubblica esplicitamente in un secondo
 * momento (stesso principio "bozza e pubblicato coesistono", CLAUDE.md).
 *
 * Lingue: stesso elenco di Locale attivi del Locale Switcher dell'editor di
 * Pagina (`GET app/settings/multilingual`, `LocaleSwitcher.tsx`) — nessuna
 * lista hardcoded, `language` accetta comunque qualunque stringa 2-10
 * caratteri lato backend (`Matches(/^[A-Za-z-]{2,10}$/)`), ma la UI offre
 * solo i Locale che il sito multilingua ha davvero attivato.
 */
import { useEffect, useState } from 'react';
import { Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { getErrorMessage } from '../../../utils/api.utils';
import { getMultilingualConfigApi } from '../../../services/settings.service';
import { useSiteTemplatesStore } from '../../../hooks/useSiteTemplatesStore';
import {
  SITE_TEMPLATE_TYPES,
  SITE_TEMPLATE_TYPE_LABELS,
  SITE_TEMPLATE_TYPES_COMING_SOON,
  type SiteTemplateType,
} from '../../../types/site-templates.types';
import FormDrawer from '../../../components/FormDrawer';

interface CreateTemplateModalProps {
  opened: boolean;
  onClose: () => void;
}

interface CreateTemplateFormValues {
  title: string;
  type: SiteTemplateType;
  language: string;
}

const TYPE_OPTIONS = SITE_TEMPLATE_TYPES.map((type) => ({
  value: type,
  label: SITE_TEMPLATE_TYPES_COMING_SOON.has(type)
    ? `${SITE_TEMPLATE_TYPE_LABELS[type]} — In arrivo`
    : SITE_TEMPLATE_TYPE_LABELS[type],
  disabled: SITE_TEMPLATE_TYPES_COMING_SOON.has(type),
}));

/** Drawer di creazione di un nuovo Template di tema. */
export default function CreateTemplateModal({
  opened,
  onClose,
}: CreateTemplateModalProps): JSX.Element {
  const createTemplate = useSiteTemplatesStore((state) => state.createTemplate);
  const isSaving = useSiteTemplatesStore((state) => state.isSaving);

  const [activeLocales, setActiveLocales] = useState<string[]>([]);

  useEffect(() => {
    if (!opened) return;
    getMultilingualConfigApi()
      .then((config) => {
        setActiveLocales(config.active);
        if (config.active.length > 0) form.setFieldValue('language', config.default);
      })
      .catch((err) => {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel caricamento delle lingue attive'),
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const form = useForm<CreateTemplateFormValues>({
    mode: 'controlled',
    initialValues: { title: '', type: 'single_page', language: '' },
    validate: {
      title: (value) => (value.trim().length === 0 ? 'Titolo obbligatorio' : null),
      language: (value) => (value.trim().length === 0 ? 'Lingua obbligatoria' : null),
    },
  });

  function handleClose(): void {
    form.reset();
    onClose();
  }

  async function handleSubmit(values: CreateTemplateFormValues): Promise<void> {
    await createTemplate({
      title: values.title.trim(),
      type: values.type,
      language: values.language,
    });
    if (!useSiteTemplatesStore.getState().error) handleClose();
  }

  return (
    <FormDrawer
      opened={opened}
      onClose={handleClose}
      title="Nuovo Template di tema"
      size="min(27.5rem, 100vw)"
      onSubmit={form.onSubmit((values) => void handleSubmit(values))}
      canSubmit={form.isValid()}
      submitting={isSaving}
    >
      <Stack gap="sm">
        <TextInput
          label="Titolo"
          placeholder="Ricerca — layout risultati"
          withAsterisk
          {...form.getInputProps('title')}
        />
        <Select
          label="Tipo di Template"
          description="Determina dove il Template può essere risolto nel sito pubblico."
          data={TYPE_OPTIONS}
          allowDeselect={false}
          {...form.getInputProps('type')}
        />
        <Select
          label="Lingua"
          description="Locale attivi del sito (Impostazioni → Multilingua)."
          data={activeLocales}
          allowDeselect={false}
          disabled={activeLocales.length === 0}
          {...form.getInputProps('language')}
        />
      </Stack>
    </FormDrawer>
  );
}
