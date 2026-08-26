/**
 * Editor dual-mode Visuale/Codice per la prop `html` di RichText (@mantine/tiptap,
 * dipendenza approvata in sessione — CLAUDE.md § Ask first: dipendenze npm). Tab "Visuale":
 * `RichTextEditor` Mantine con toolbar Grassetto/Corsivo/Sottolineato/Barrato, liste, link,
 * allineamenti — nessuna citazione: `blockquote` è disattivato in `StarterKit` perché il tag
 * che produrrebbe non è nell'allowlist del profilo `basic` (ADR-26 § 3). Tab "Codice": lo
 * stesso Textarea sull'HTML grezzo che
 * `PropertyInspector.tsx` usava da solo prima di questo componente — resta disponibile per
 * chi preferisce editare il markup a mano.
 *
 * Non tocca `Heading`: la sua prop `text` è `plainText` (SPEC-F02-blocchi.md § 3.3, mai
 * HTML) — un editor che vi scrivesse markup cambierebbe il `kind` dichiarato dal registro,
 * una modifica di schema blocco fuori scope per questo componente (CLAUDE.md § Ask first).
 *
 * Convenzione di commit invariata rispetto agli altri campi di `PropertyInspector.tsx`
 * (`PropertyForm.setLocal`/`.commit`): `onLocalChange` aggiorna solo la bozza locale del
 * form, mai lo store, ad ogni tasto/click di formattazione. `onCommit` scrive nello store —
 * al `blur` dell'editor visuale, al `blur` della textarea in modalità Codice, e al cambio di
 * tab (un punto di sincronizzazione esplicito fra le due rappresentazioni, non un tasto).
 *
 * Nessuna sanitizzazione qui: resta autorità esclusiva del server pre-persistenza
 * (ADR-20/ADR-21) — questo componente propone soltanto l'HTML scritto o digitato.
 */
import { useEffect, useState } from 'react';
import { ActionIcon, Group, Stack, Tabs, Text, Textarea, Tooltip } from '@mantine/core';
import { Link, RichTextEditor } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { IconMaximize, IconMinimize } from '@tabler/icons-react';
import styles from './RichTextFieldEditor.module.css';

interface RichTextFieldEditorProps {
  label: string;
  required?: boolean;
  maxLength?: number;
  value: string;
  error?: string;
  /** Bozza locale del form (mai lo store) — vedi commento di testa. */
  onLocalChange: (nextHtml: string) => void;
  /** Scrittura nello store — vedi commento di testa. */
  onCommit: (nextHtml: string) => void;
}

type EditorTab = 'visual' | 'code';

/**
 * Estensioni Tiptap del profilo `basic` — esportate (non inline in `useEditor`) perché il test
 * di ADR-26 § 3 deve verificare esattamente questo insieme, non una copia che potrebbe
 * divergere. `@tiptap/starter-kit` v2 non registra `Link` (a differenza di v3): nessun
 * conflitto con quello di `@mantine/tiptap` qui sotto, che resta l'unico registrato.
 * heading/blockquote/code/codeBlock/horizontalRule disattivati: nessuno dei quattro tag che
 * produrrebbero è nell'allowlist del profilo `basic` (block-sanitize-profiles.config.ts) —
 * ADR-26 § 3 impone che sia la configurazione di StarterKit, non la sola toolbar, a impedirne
 * la produzione.
 */
export const richTextEditorExtensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
  }),
  Link,
  Underline,
  // Solo `paragraph`: `heading` è disattivato sopra, indicarlo qui produrrebbe un riferimento
  // a un'estensione di nodo inesistente.
  TextAlign.configure({ types: ['paragraph'] }),
];

/** Un documento Tiptap vuoto normalizza a `<p></p>`, mai a stringa vuota — vedi `switchToCode`. */
function isEmptyHtml(html: string): boolean {
  const trimmed = html.trim();
  return trimmed === '' || trimmed === '<p></p>';
}

export default function RichTextFieldEditor({
  label,
  required,
  maxLength,
  value,
  error,
  onLocalChange,
  onCommit,
}: RichTextFieldEditorProps): JSX.Element {
  const [tab, setTab] = useState<EditorTab>('visual');
  const [fullscreen, setFullscreen] = useState(false);

  const editor = useEditor({
    extensions: richTextEditorExtensions,
    content: value,
    onUpdate: ({ editor: instance }) => onLocalChange(instance.getHTML()),
    onBlur: ({ editor: instance }) => onCommit(instance.getHTML()),
  });

  /** Codice → Visuale: l'editor Tiptap riceve il markup scritto a mano nella textarea. */
  function switchToVisual(): void {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value, false);
    }
    setTab('visual');
  }

  /**
   * Visuale → Codice: la textarea riparte dall'HTML corrente dell'editor visuale. Il cambio
   * di tab è già un punto di sincronizzazione esplicito (non un tasto premuto a caso), quindi
   * commit immediato invece di aspettare un `blur` che qui non arriverebbe mai da solo — **a
   * meno che** non ci sia niente da sincronizzare: un documento Tiptap vuoto normalizza
   * sempre a `<p></p>` (mai stringa vuota), e senza questa guardia il solo passaggio di tab
   * su un campo mai toccato dall'utente sporcherebbe lo undo stack e `isDirty()` con un
   * commit "vuoto → `<p></p>`" che l'utente non ha chiesto.
   */
  function switchToCode(): void {
    if (editor) {
      const html = editor.getHTML();
      if (html !== value && !(isEmptyHtml(html) && isEmptyHtml(value))) {
        onLocalChange(html);
        onCommit(html);
      }
    }
    setTab('code');
  }

  // `Esc` chiude lo schermo intero, come farebbe il `Modal` sostituito — vedi commento di
  // testa del CSS module sul perché non è più un `Modal`.
  useEffect(() => {
    if (!fullscreen) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setFullscreen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen]);

  const fullscreenLabel = fullscreen ? 'Esci da schermo intero' : 'Editor a schermo intero';

  const body = (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <Tabs
          value={tab}
          onChange={(next) => {
            if (next === 'code') switchToCode();
            else if (next === 'visual') switchToVisual();
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="visual">Visuale</Tabs.Tab>
            <Tabs.Tab value="code">Codice</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <Tooltip label={fullscreenLabel} withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={fullscreenLabel}
            onClick={() => setFullscreen((current) => !current)}
          >
            {fullscreen ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      {tab === 'visual' ? (
        <RichTextEditor editor={editor} className={fullscreen ? undefined : styles.editorFrame}>
          <RichTextEditor.Toolbar>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Underline />
              <RichTextEditor.Strikethrough />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.AlignLeft />
              <RichTextEditor.AlignCenter />
              <RichTextEditor.AlignRight />
              <RichTextEditor.AlignJustify />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>
          <RichTextEditor.Content
            className={fullscreen ? undefined : styles.editorContent}
            style={{ minHeight: fullscreen ? '65vh' : 120, maxHeight: fullscreen ? '65vh' : undefined }}
          />
        </RichTextEditor>
      ) : (
        <Textarea
          aria-label={label}
          autosize
          minRows={fullscreen ? 26 : 6}
          maxRows={fullscreen ? 26 : 14}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onLocalChange(event.currentTarget.value)}
          onBlur={(event) => onCommit(event.currentTarget.value)}
        />
      )}

      <Text size="xs" c="dimmed">
        Viene ripulito dal server al salvataggio contro l&apos;allowlist del profilo: il contenuto
        salvato può differire da quello digitato.
      </Text>
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );

  return (
    <div>
      <Text size="sm" fw={500} mb={4}>
        {label}
        {required && (
          <Text component="span" c="red" inherit>
            {' *'}
          </Text>
        )}
      </Text>

      {fullscreen && (
        <div className={styles.backdrop} onClick={() => setFullscreen(false)} role="presentation" />
      )}
      <div className={fullscreen ? styles.fullscreenPanel : undefined}>{body}</div>
    </div>
  );
}
