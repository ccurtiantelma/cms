import type { RenderableBlockNode } from '@blocks/types';
import styleTokensCss from '@blocks/style-tokens.module.css?inline';
import sectionCss from '@blocks/blocks/Section.module.css?inline';
import containerCss from '@blocks/blocks/Container.module.css?inline';
import contentPlaceholderCss from '@blocks/blocks/ContentPlaceholderBlock.module.css?inline';
import headingCss from '@blocks/blocks/Heading.module.css?inline';
import richTextCss from '@blocks/blocks/RichText.module.css?inline';
import imageCss from '@blocks/blocks/Image.module.css?inline';
import buttonCss from '@blocks/blocks/Button.module.css?inline';
import navMenuCss from '@blocks/blocks/NavMenuBlock.module.css?inline';
import formBlockCss from '@blocks/blocks/FormBlock.module.css?inline';
import formFieldBlockCss from '@blocks/blocks/FormFieldBlock.module.css?inline';
import formSubmitBlockCss from '@blocks/blocks/FormSubmitBlock.module.css?inline';

/**
 * Quanti blocchi di primo livello dell'albero di Pagina (`content.blocks`, non i
 * discendenti: quelli sono già inclusi ricorsivamente da {@link collectBlockTypes})
 * si considerano "sopra la piega" (SPEC-F03 § 3.2). Nessun motore di analisi layout:
 * lo stesso principio già usato da `ThemeStyleTag`, un numero fisso derivato
 * dall'ordine dell'albero, non da una misura a runtime. Le prime due Sezioni coprono
 * il primo viewport nella quasi totalità dei layout reali (hero + una sezione), senza
 * gonfiare il `<style>` inline con l'intera Pagina.
 */
const ABOVE_FOLD_ROOT_BLOCK_COUNT = 2;

/** CSS Module (già processato, classi hashate) di ogni tipo di blocco noto al renderer pubblico. */
const CSS_BY_BLOCK_TYPE: Readonly<Record<string, string>> = {
  section: sectionCss,
  // `container` copre sia il Container "vero" sia il segnaposto "Area Contenuto
  // Pagina" del Template Editor (stesso `node.type`, distinti solo da una prop —
  // vedi `BlockRenderer.tsx`): includere entrambi i fogli evita di dover
  // replicare qui quel controllo solo per scegliere il CSS giusto.
  container: `${containerCss}\n${contentPlaceholderCss}`,
  heading: headingCss,
  richText: richTextCss,
  image: imageCss,
  button: buttonCss,
  navMenu: navMenuCss,
  // `NavMenuItemBlock.tsx` importa `NavMenuBlock.module.css` (nessun foglio proprio).
  navMenuItem: navMenuCss,
  form: formBlockCss,
  'form-field': formFieldBlockCss,
  'form-submit': formSubmitBlockCss,
};

/** Raccoglie ricorsivamente i `type` distinti presenti nell'albero (nodo + discendenti). */
function collectBlockTypes(nodes: readonly RenderableBlockNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(node.type);
    collectBlockTypes(node.children, into);
  }
}

/**
 * Compone il CSS critico (above-the-fold) da iniettare inline nel `<head>` del
 * documento: i design token (`style-tokens.module.css`, sempre presenti — quasi
 * ogni blocco vi attinge per spaziatura/colore/tipografia) più il foglio dei soli
 * tipi di blocco usati nei primi blocchi della Pagina e nell'header (SPEC-F03 §
 * 3.2). Il resto del foglio CSS Modules resta il `<link>` esterno immutabile già
 * prodotto dalla build (`cssHref`): nessuna rimozione, solo un sottoinsieme
 * duplicato per il primo render.
 *
 * @param pageBlocks Blocchi di primo livello di `content.blocks` della Pagina.
 * @param headerBlocks Blocchi della Sezione Globale assegnata allo slot `header`
 *   (ADR-40) — sempre visibile sopra la piega quando presente, a differenza del
 *   footer che non lo è mai.
 */
export function buildCriticalCss(
  pageBlocks: readonly RenderableBlockNode[],
  headerBlocks: readonly RenderableBlockNode[],
): string {
  const types = new Set<string>();
  collectBlockTypes(headerBlocks, types);
  collectBlockTypes(pageBlocks.slice(0, ABOVE_FOLD_ROOT_BLOCK_COUNT), types);

  const parts = [styleTokensCss];
  for (const type of types) {
    const css = CSS_BY_BLOCK_TYPE[type];
    if (css) parts.push(css);
  }
  return parts.join('\n');
}
