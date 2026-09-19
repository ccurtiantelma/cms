import { Link } from '@mantine/tiptap';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';

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
