/**
 * Ispettore delle proprietà del blocco selezionato (PLAN-F04-editor-visivo.md T5).
 *
 * **Un solo componente per tutti i tipi di blocco.** Non esiste — e non va introdotto —
 * un `HeadingInspector`/`ButtonInspector`: il form è generato leggendo il descrittore del
 * tipo in `BLOCK_TYPES` (generato dal registro backend, ADR-21) e mappando `PropSpec.kind`
 * al controllo Mantine corrispondente. Aggiungere una prop al registro la fa comparire qui
 * senza toccare questo file; aggiungere un tipo di blocco non richiede alcun file nuovo.
 * La mappa sotto è indicizzata per `kind`, mai per `type`: è la proprietà che rende vero
 * quanto sopra, e l'unica da preservare se il componente viene modificato.
 *
 * La validazione mostrata qui è **solo UX**: l'autorità resta il `400` del server, che
 * `PagePageDetail` traduce nel blocco colpevole. Nessun controllo di questo file blocca il
 * salvataggio — coerente con CLAUDE.md § Frontend ("validazione client solo UX").
 */
import { useState } from 'react';
import {
  Alert,
  Badge,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import {
  BLOCK_TYPES,
  type BlockPropDescriptor,
  type BlockTypeDescriptor,
} from '../../../types/blocks.types';
import {
  useBlockEditorStore,
  useSelectedNode,
  useTreeGeneration,
} from '../../../hooks/useBlockEditorStore';
import type { BlockNode } from './block-tree.utils';

/**
 * Schemi ammessi per `kind: 'url'`, ricalcati da `block-tree-validator.service.ts`
 * (SPEC-F02 § 3.6). Duplicati qui solo per anticipare l'errore a chi scrive: il rifiuto
 * autorevole resta quello del server, che applica gli stessi tre pattern.
 */
const URL_PATTERNS = [/^https?:\/\/.+/i, /^mailto:.+/i, /^\/(?!\/).*/];

/**
 * Oltre questa lunghezza massima una prop `plainText` si edita su più righe invece che su
 * una sola. Sotto la soglia stanno le prop che nella pratica sono una riga (titolo,
 * etichetta, testo alternativo); sopra, i testi lunghi.
 */
const MULTILINE_THRESHOLD = 300;

/** Etichetta leggibile di una prop: il registro non ne porta una, si usa il nome tecnico. */
function propLabel(prop: BlockPropDescriptor): string {
  return prop.name;
}

/** Il valore corrente di una prop come stringa, qualunque cosa contenga il `jsonb`. */
function asString(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value);
}

/** Messaggio di errore UX per una prop, o `undefined` se il valore è accettabile. */
function uxError(prop: BlockPropDescriptor, value: unknown): string | undefined {
  const text = asString(value);
  if (prop.kind === 'url' && text.trim() !== '' && !URL_PATTERNS.some((re) => re.test(text))) {
    return 'Ammessi: http(s)://…, mailto:… o un percorso che inizia con una sola /';
  }
  if ((prop.required || prop.nonEmpty) && text.trim() === '') {
    return 'Obbligatoria: il salvataggio verrà rifiutato finché è vuota';
  }
  return undefined;
}

interface PropertyFormProps {
  node: BlockNode;
  descriptor: BlockTypeDescriptor;
}

/**
 * Form delle proprietà di un singolo nodo. Il componente esportato lo monta con una `key`
 * che unisce l'id del nodo e la generazione dell'albero: cambiare selezione **o** ricaricare
 * l'albero dal server lo rimonta, azzerando le bozze locali senza bisogno di un effetto che
 * le sincronizzi. La generazione è indispensabile perché gli id sopravvivono a un
 * salvataggio: senza, dopo la sanitizzazione server-side il campo continuerebbe a mostrare
 * il testo digitato invece di quello davvero salvato, e il `blur` successivo lo rimanderebbe
 * in store.
 *
 * Le scritture testuali vanno in store `onBlur`, non a ogni tasto: un dispatch per
 * carattere farebbe ricalcolare i selettori dell'albero ad ogni battuta (NFR § Performance
 * — editor). I controlli senza semantica di "fine modifica" (`Select`, `Switch`) scrivono
 * invece `onChange`, dove il cambiamento è già l'atto conclusivo.
 */
function PropertyForm({ node, descriptor }: PropertyFormProps): JSX.Element {
  const updateBlockPropsAction = useBlockEditorStore((state) => state.updateBlockPropsAction);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...node.props }));

  /** Aggiorna la sola bozza locale (nessun dispatch): usato mentre si digita. */
  function setLocal(name: string, value: unknown): void {
    setDraft((previous) => ({ ...previous, [name]: value }));
  }

  /** Scrive nello store, se il valore è davvero cambiato rispetto al nodo. */
  function commit(name: string, value: unknown): void {
    if (Object.is(value, node.props[name])) return;
    updateBlockPropsAction(node.id, { [name]: value });
  }

  /** Scrive nello store immediatamente (controlli senza `onBlur` significativo). */
  function setAndCommit(name: string, value: unknown): void {
    setLocal(name, value);
    commit(name, value);
  }

  if (descriptor.props.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Il blocco &laquo;{descriptor.meta?.label ?? descriptor.type}&raquo; non ha proprietà
        modificabili: si configura aggiungendo blocchi al suo interno.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      {descriptor.props.map((prop) => {
        const value = draft[prop.name];
        const label = propLabel(prop);
        const error = uxError(prop, value);
        const required = prop.required || prop.nonEmpty === true;

        // La mappa è per `kind` — mai per tipo di blocco: è il vincolo strutturale di T5.
        switch (prop.kind) {
          case 'enum':
            return (
              <Select
                key={prop.name}
                label={label}
                withAsterisk={required}
                allowDeselect={false}
                data={[...(prop.values ?? [])]}
                value={asString(value) || null}
                error={error}
                onChange={(next) => setAndCommit(prop.name, next ?? '')}
              />
            );

          case 'boolean':
            return (
              <Switch
                key={prop.name}
                label={label}
                checked={value === true}
                onChange={(event) => setAndCommit(prop.name, event.currentTarget.checked)}
              />
            );

          case 'number':
            return (
              <NumberInput
                key={prop.name}
                label={label}
                withAsterisk={required}
                value={typeof value === 'number' ? value : ''}
                error={error}
                onChange={(next) => setLocal(prop.name, next)}
                onBlur={() =>
                  commit(prop.name, typeof value === 'number' ? value : Number(value) || 0)
                }
              />
            );

          case 'mediaRef':
            // Nessuna scorciatoia che finga una libreria media: F09 non è costruita, e un
            // campo libero inviterebbe a incollare un riferimento che il server rifiuta.
            return (
              <TextInput
                key={prop.name}
                label={label}
                withAsterisk={required}
                disabled
                value={asString(value)}
                placeholder="Libreria media non disponibile (F09 non ancora costruita)"
              />
            );

          case 'url':
            return (
              <TextInput
                key={prop.name}
                label={label}
                withAsterisk={required}
                maxLength={prop.maxLength}
                value={asString(value)}
                error={error}
                placeholder="https://esempio.it/pagina"
                onChange={(event) => setLocal(prop.name, event.currentTarget.value)}
                onBlur={() => commit(prop.name, asString(value))}
              />
            );

          case 'richText':
            return (
              <Textarea
                key={prop.name}
                label={label}
                withAsterisk={required}
                autosize
                minRows={4}
                maxLength={prop.maxLength}
                value={asString(value)}
                error={error}
                description="HTML grezzo: viene ripulito dal server al salvataggio contro l'allowlist del profilo, quindi il contenuto salvato può differire da quello digitato."
                onChange={(event) => setLocal(prop.name, event.currentTarget.value)}
                onBlur={() => commit(prop.name, asString(value))}
              />
            );

          case 'plainText':
          default: {
            const multiline = (prop.maxLength ?? 0) > MULTILINE_THRESHOLD;
            const shared = {
              label,
              withAsterisk: required,
              maxLength: prop.maxLength,
              value: asString(value),
              error,
              onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setLocal(prop.name, event.currentTarget.value),
              onBlur: () => commit(prop.name, asString(value)),
            };
            return multiline ? (
              <Textarea key={prop.name} autosize minRows={3} {...shared} />
            ) : (
              <TextInput key={prop.name} {...shared} />
            );
          }
        }
      })}
    </Stack>
  );
}

/** Pannello delle proprietà del blocco selezionato nel canvas. */
export default function PropertyInspector(): JSX.Element {
  const node = useSelectedNode();
  const generation = useTreeGeneration();
  const descriptor = node ? BLOCK_TYPES.find((entry) => entry.type === node.type) : undefined;

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600}>Proprietà</Text>
          {descriptor && <Badge variant="light">{descriptor.meta?.label ?? descriptor.type}</Badge>}
        </Group>

        {!node ? (
          <Text size="sm" c="dimmed">
            Seleziona un blocco nel canvas per modificarne le proprietà.
          </Text>
        ) : !descriptor ? (
          // Un tipo fuori registro non è raggiungibile dalla palette, ma può arrivare da un
          // contenuto salvato prima che il tipo venisse rimosso: si dice cosa succede invece
          // di mostrare un pannello vuoto.
          <Alert color="orange" icon={<IconInfoCircle size={16} />}>
            Il tipo di blocco &laquo;{node.type}&raquo; non è nel registro: non è modificabile e il
            salvataggio verrà rifiutato finché il blocco resta nell&apos;albero.
          </Alert>
        ) : (
          <PropertyForm key={`${node.id}:${generation}`} node={node} descriptor={descriptor} />
        )}
      </Stack>
    </Paper>
  );
}
