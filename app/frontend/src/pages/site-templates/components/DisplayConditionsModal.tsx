/**
 * Modale "Condizioni di visualizzazione" (RFC-40 Opzione B) — modifica
 * `displayConditions` di un Template di tema. Riusa per intero lo store
 * (`useSiteTemplatesStore`): all'apertura ricarica il Template dal server
 * (`selectTemplate`, `version` sempre fresca per il lock ottimistico) invece
 * di fidarsi della fotografia della card cliccata, e il salvataggio passa da
 * `saveCurrentTemplate` — stesso `409 SITE_TEMPLATE_VERSION_CONFLICT` già
 * gestito lì, nessuna logica di scrittura duplicata qui.
 *
 * Semantica di valutazione (`TemplateResolverService.matchesDisplayConditions`,
 * `app/backend/src/site-templates/template-resolver.service.ts`), riportata
 * nell'help text: nessuna regola ⇒ il Template si applica ovunque; un
 * `Escludi` che corrisponde esclude sempre; con almeno un `Includi` presente,
 * serve che almeno uno corrisponda (allowlist).
 *
 * `value` è sempre un **path pubblico** (esatto per `specific_page`, con
 * wildcard `*` per `path_pattern`) — mai un guid di Pagina: il resolver
 * riceve solo `path`, senza dipendenza da `PagesModule`
 * (`DisplayConditionRuleDto`, stesso commento sul DTO backend). Nessun
 * selettore di Pagina da inventare qui.
 */
import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconAlertCircle, IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSiteTemplatesStore } from '../../../hooks/useSiteTemplatesStore';
import {
  DISPLAY_CONDITION_TARGET_LABELS,
  DISPLAY_CONDITION_TYPE_LABELS,
  type DisplayConditionRule,
  type DisplayConditionTarget,
  type DisplayConditionType,
} from '../../../types/site-templates.types';

interface DisplayConditionsModalProps {
  opened: boolean;
  onClose: () => void;
  /** Guid del Template su cui operare; `null` mentre il modale è chiuso. */
  guid: string | null;
}

const TYPE_OPTIONS: { value: DisplayConditionType; label: string }[] = [
  { value: 'include', label: DISPLAY_CONDITION_TYPE_LABELS.include },
  { value: 'exclude', label: DISPLAY_CONDITION_TYPE_LABELS.exclude },
];

const TARGET_OPTIONS: { value: DisplayConditionTarget; label: string }[] = [
  { value: 'entire_site', label: DISPLAY_CONDITION_TARGET_LABELS.entire_site },
  { value: 'specific_page', label: DISPLAY_CONDITION_TARGET_LABELS.specific_page },
  { value: 'path_pattern', label: DISPLAY_CONDITION_TARGET_LABELS.path_pattern },
];

/** Placeholder del campo valore, in base al bersaglio scelto per la riga. */
function valuePlaceholder(target: DisplayConditionTarget): string {
  if (target === 'path_pattern') return '/prodotti/*';
  if (target === 'specific_page') return '/chi-siamo';
  return '';
}

/** Modale di modifica delle regole di visualizzazione di un Template di tema. */
export default function DisplayConditionsModal({
  opened,
  onClose,
  guid,
}: DisplayConditionsModalProps): JSX.Element {
  const selectedTemplate = useSiteTemplatesStore((state) => state.selectedTemplate);
  const isLoading = useSiteTemplatesStore((state) => state.isLoading);
  const isSaving = useSiteTemplatesStore((state) => state.isSaving);
  const selectTemplate = useSiteTemplatesStore((state) => state.selectTemplate);
  const updateDisplayConditions = useSiteTemplatesStore((state) => state.updateDisplayConditions);
  const saveCurrentTemplate = useSiteTemplatesStore((state) => state.saveCurrentTemplate);

  const [rules, setRules] = useState<DisplayConditionRule[]>([]);

  // Carica una `version` fresca all'apertura; azzera la selezione alla chiusura, così il
  // prossimo Template aperto non eredita per un istante lo stato di quello precedente.
  useEffect(() => {
    if (opened && guid) void selectTemplate(guid);
    if (!opened) void selectTemplate(null);
  }, [opened, guid, selectTemplate]);

  const ready = opened && !isLoading && selectedTemplate?.guid === guid;

  // Inizializza il form dalle regole del Template appena caricato (una sola volta per apertura).
  useEffect(() => {
    if (ready && selectedTemplate) setRules(selectedTemplate.displayConditions);
  }, [ready, selectedTemplate]);

  function updateRule(index: number, patch: Partial<DisplayConditionRule>): void {
    setRules((prev) => prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function addRule(): void {
    setRules((prev) => [...prev, { type: 'include', target: 'entire_site' }]);
  }

  function removeRule(index: number): void {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave(): Promise<void> {
    if (!selectedTemplate) return;
    // `value` non ha senso per `entire_site`: non lo si porta dietro se l'utente ha
    // cambiato bersaglio dopo averlo compilato per un target diverso.
    const normalized = rules.map((rule) =>
      rule.target === 'entire_site' ? { type: rule.type, target: rule.target } : rule,
    );
    updateDisplayConditions(normalized);
    await saveCurrentTemplate();
    if (!useSiteTemplatesStore.getState().hasUnsavedChanges) onClose();
  }

  const hasIncompleteRule = rules.some(
    (rule) => rule.target !== 'entire_site' && !rule.value?.trim(),
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Condizioni di visualizzazione"
      size="lg"
      centered
    >
      {!ready ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <Stack gap="md">
          <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
            Nessuna regola: il Template si applica ovunque per il suo tipo/lingua. Una regola{' '}
            <strong>Escludi</strong> che corrisponde esclude sempre. Con almeno un{' '}
            <strong>Includi</strong>, serve che almeno uno corrisponda.
          </Alert>

          {rules.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="md">
              Nessuna condizione: il Template si applica a ogni pagina del suo tipo.
            </Text>
          )}

          <Stack gap="sm">
            {rules.map((rule, index) => (
              <Group key={index} align="flex-start" wrap="nowrap">
                <Select
                  aria-label="Verso della regola"
                  data={TYPE_OPTIONS}
                  value={rule.type}
                  onChange={(value) =>
                    value && updateRule(index, { type: value as DisplayConditionType })
                  }
                  allowDeselect={false}
                  w={130}
                />
                <Select
                  aria-label="Bersaglio della regola"
                  data={TARGET_OPTIONS}
                  value={rule.target}
                  onChange={(value) =>
                    value &&
                    updateRule(index, { target: value as DisplayConditionTarget, value: undefined })
                  }
                  allowDeselect={false}
                  w={180}
                />
                <TextInput
                  aria-label="Percorso"
                  flex={1}
                  placeholder={valuePlaceholder(rule.target)}
                  disabled={rule.target === 'entire_site'}
                  value={rule.target === 'entire_site' ? '' : (rule.value ?? '')}
                  onChange={(event) => updateRule(index, { value: event.currentTarget.value })}
                  error={
                    rule.target !== 'entire_site' && !rule.value?.trim()
                      ? 'Percorso obbligatorio'
                      : undefined
                  }
                />
                <ActionIcon
                  variant="light"
                  color="red"
                  radius="md"
                  aria-label="Rimuovi condizione"
                  onClick={() => removeRule(index)}
                  mt={2}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>

          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={addRule}
            style={{ alignSelf: 'flex-start' }}
          >
            Aggiungi Condizione
          </Button>

          {hasIncompleteRule && (
            <Alert color="orange" variant="light" icon={<IconAlertCircle size={16} />}>
              Compila il percorso di ogni condizione prima di salvare.
            </Alert>
          )}

          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose} disabled={isSaving}>
              Annulla
            </Button>
            <Button
              onClick={() => void handleSave()}
              loading={isSaving}
              disabled={hasIncompleteRule}
            >
              Salva
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
