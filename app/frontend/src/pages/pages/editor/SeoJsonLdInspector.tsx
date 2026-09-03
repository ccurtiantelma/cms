/**
 * Anteprima JSON-LD calcolata **in editor** (chrome dell'editor Pagina, scheda GEO). Rispecchia
 * l'algoritmo di `SeoGraphService.generateSeoMetadata` (backend, ADR-48) SOLO per dare
 * un'anteprima immediata mentre si scrivono titolo/description/FAQ — il valore autoritativo
 * resta quello generato dal backend a publish-time, dentro la Revisione immutabile. Le due
 * cose possono divergere (es. se `structuredData` manuale cambia dopo l'ultima bozza vista
 * qui), per questo il componente lo dichiara esplicitamente in UI, non solo nel commento.
 */
import { Badge, Code, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import type { PageFaqEntry } from '../../../types/pages.types';

interface SeoJsonLdInspectorProps {
  /** Titolo già risolto dal chiamante (`metaTitle || titolo Pagina`). */
  pageTitle: string;
  /** Description già risolta dal chiamante (`metaDescription`, può essere vuota). */
  description?: string;
  /** FAQ correnti del form — genera l'entità `FAQPage` quando non vuoto. */
  faq: PageFaqEntry[];
  /** `structuredData` manuale già salvato (`page.draftSeo?.structuredData`), non nel form. */
  manualStructuredData?: Record<string, unknown>;
}

/**
 * Ricalcola lo stesso oggetto JSON-LD generato dal backend (ADR-48 § Decisione): `WebPage`
 * fisso più, solo se `faq` non è vuota, un'entità `FAQPage` in `@graph`. Merge shallow con
 * l'estensione manuale: le chiavi di primo livello del manuale vincono sempre — stesso
 * comportamento non distruttivo del backend, nessun merge ricorsivo (il backend non lo fa).
 */
function buildJsonLdPreview(
  pageTitle: string,
  description: string | undefined,
  faq: PageFaqEntry[],
  manualStructuredData: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const generated = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: pageTitle, ...(description ? { description } : {}) },
      ...(faq.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: faq.map((f) => ({
                '@type': 'Question',
                name: f.question,
                acceptedAnswer: { '@type': 'Answer', text: f.answer },
              })),
            },
          ]
        : []),
    ],
  };
  return { ...generated, ...(manualStructuredData ?? {}) };
}

/**
 * Controllo strutturale leggero, non una validazione Schema.org completa: vero solo se
 * l'oggetto porta `@context` e almeno un `@type`, diretto o dentro `@graph`.
 */
function hasMinimalSchemaShape(data: Record<string, unknown>): boolean {
  if (!('@context' in data)) return false;
  if ('@type' in data) return true;
  const graph = data['@graph'];
  if (!Array.isArray(graph)) return false;
  return graph.some(
    (entry) => typeof entry === 'object' && entry !== null && '@type' in (entry as object),
  );
}

/** Pannello di anteprima JSON-LD per la Pagina in editing (solo lettura). */
export default function SeoJsonLdInspector({
  pageTitle,
  description,
  faq,
  manualStructuredData,
}: SeoJsonLdInspectorProps): JSX.Element {
  const merged = buildJsonLdPreview(pageTitle, description, faq, manualStructuredData);
  const valid = hasMinimalSchemaShape(merged);

  return (
    <Stack gap={6}>
      <Group gap="sm">
        <Text size="sm" fw={500}>
          Anteprima JSON-LD
        </Text>
        <Tooltip
          withArrow
          multiline
          w={280}
          label="Controllo strutturale leggero (presenza di @context e @type), non una validazione Schema.org completa."
        >
          {valid ? (
            <Badge color="green" variant="light" leftSection={<IconCircleCheck size={12} />}>
              Valid Schema.org
            </Badge>
          ) : (
            <Badge color="orange" variant="light" leftSection={<IconAlertTriangle size={12} />}>
              Struttura incompleta
            </Badge>
          )}
        </Tooltip>
      </Group>
      <Code block>{JSON.stringify(merged, null, 2)}</Code>
      <Text size="xs" c="dimmed">
        Anteprima calcolata in editor. Il valore effettivamente pubblicato è generato dal
        backend a publish-time (ADR-48) e può differire se il JSON-LD manuale cambia dopo.
      </Text>
    </Stack>
  );
}
