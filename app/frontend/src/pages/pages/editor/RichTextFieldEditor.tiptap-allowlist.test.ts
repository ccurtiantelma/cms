/**
 * Test mandato da ADR-26 § 3: le estensioni Tiptap configurate per il WYSIWYG del rich text
 * (`richTextEditorExtensions`, esportate da `RichTextFieldEditor.tsx`) non devono poter
 * produrre alcun tag fuori dall'allowlist del profilo `basic`. Non asserisce sulla toolbar
 * (nascondere un pulsante non basta, ADR-26 § 3): asserisce sull'insieme delle estensioni
 * effettivamente istanziate, cosa che scorciatoie da tastiera, input rule e incolla non
 * possono aggirare — quei percorsi non introducono nodi che l'estensione non registra.
 *
 * Se un aggiornamento di `@tiptap/starter-kit` aggiunge un'estensione non censita qui sotto,
 * il primo test fallisce con il nome dell'estensione ignota, prima che produca un tag mai
 * verificato contro il sanitizzatore.
 */
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { richTextEditorExtensions } from './RichTextFieldEditor';

/**
 * Deve combaciare con `BASIC_SANITIZE_OPTIONS.allowedTags` in
 * `app/backend/src/common/sanitizer/block-sanitize-profiles.config.ts` (profilo `basic`) —
 * stessa convenzione di duplicazione dichiarata di `src/types/*.types.ts` verso i DTO
 * backend: il frontend non importa mai sorgente del workspace `app/backend`.
 */
const BASIC_ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'ul',
  'ol',
  'li',
]);

/**
 * Tag HTML prodotto da ciascuna estensione attesa in `richTextEditorExtensions` — tabella
 * verificata a mano contro la documentazione di Tiptap v2. Un'estensione presente in
 * `richTextEditorExtensions` ma assente da questa mappa fa fallire il test sotto per
 * costruzione: non c'è un default permissivo.
 */
const KNOWN_EXTENSION_TAGS: Record<string, string[]> = {
  // Plumbing interno di `@tiptap/core`/`starter-kit`, sempre presente indipendentemente
  // dalla configurazione: nessun nodo/mark proprio, nessun tag prodotto. Elenco fissato
  // instanziando `richTextEditorExtensions` una volta e leggendo
  // `editor.extensionManager.extensions.map(e => e.name)`.
  editable: [],
  clipboardTextSerializer: [],
  commands: [],
  focusEvents: [],
  keymap: [],
  tabindex: [],
  drop: [],
  paste: [],
  starterKit: [],
  dropCursor: [],
  gapCursor: [],
  history: [],
  doc: [],
  text: [],
  paragraph: ['p'],
  bold: ['strong'],
  italic: ['em'],
  strike: ['s'],
  underline: ['u'],
  bulletList: ['ul'],
  orderedList: ['ol'],
  listItem: ['li'],
  hardBreak: ['br'],
  link: ['a'],
  // Estensione di attributo (aggiunge `style="text-align: …"` al `paragraph` esistente):
  // nessun tag proprio. L'attributo è verificato in
  // `test/unit/common/sanitizer/block-prop-sanitizer.service.spec.ts` (backend).
  textAlign: [],
};

/** Disattivate esplicitamente in `RichTextFieldEditor.tsx` — nessuna deve ricomparire attiva. */
const EXPLICITLY_DISABLED = ['heading', 'blockquote', 'code', 'codeBlock', 'horizontalRule'];

describe('RichTextFieldEditor — estensioni Tiptap vs allowlist basic (ADR-26 § 3)', () => {
  it('ogni estensione attiva è censita e produce solo tag della allowlist basic', () => {
    const editor = new Editor({ extensions: richTextEditorExtensions });
    try {
      const activeNames = editor.extensionManager.extensions.map((extension) => extension.name);
      expect(activeNames.length).toBeGreaterThan(0);
      for (const name of activeNames) {
        expect(
          KNOWN_EXTENSION_TAGS,
          `estensione non censita nella tabella di test: "${name}"`,
        ).toHaveProperty(name);
        for (const tag of KNOWN_EXTENSION_TAGS[name]) {
          expect(
            BASIC_ALLOWED_TAGS.has(tag),
            `l'estensione "${name}" produce <${tag}>, fuori dall'allowlist basic`,
          ).toBe(true);
        }
      }
    } finally {
      editor.destroy();
    }
  });

  it('non registra le estensioni disattivate esplicitamente (heading/blockquote/code/codeBlock/horizontalRule)', () => {
    const editor = new Editor({ extensions: richTextEditorExtensions });
    try {
      const activeNames = new Set(
        editor.extensionManager.extensions.map((extension) => extension.name),
      );
      for (const disabled of EXPLICITLY_DISABLED) {
        expect(activeNames.has(disabled), `"${disabled}" risulta ancora attiva`).toBe(false);
      }
    } finally {
      editor.destroy();
    }
  });

  it('un HTML con tag disattivati converge a solo tag ammessi dopo il parsing Tiptap', () => {
    const editor = new Editor({
      extensions: richTextEditorExtensions,
      content:
        '<h1>Titolo</h1><blockquote><p>Citazione</p></blockquote><pre><code>codice</code></pre><hr><p>Testo</p>',
    });
    try {
      const html = editor.getHTML();
      const tagsInOutput = [...html.matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)].map((match) =>
        match[1].toLowerCase(),
      );
      for (const tag of tagsInOutput) {
        expect(
          BASIC_ALLOWED_TAGS.has(tag),
          `<${tag}> presente nell'HTML prodotto dall'editor`,
        ).toBe(true);
      }
    } finally {
      editor.destroy();
    }
  });
});
