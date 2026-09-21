# SPEC — Widget Batch 1: `divider`, `spacer`, `icon`, `iconBox`, `htmlEmbed`

> Stato: proposta, da firmare come ADR prima dell'esecuzione.
> Contesto: `PLAN-parita-elementor-pro.md` § R4 (widget base CSS-only), `SPEC-propkind-v2.md`.
> Registro attuale: 20 tipi (`block-registry.ts`). Questa spec porta a **25**.

## 0. Principio guida

Nessun widget di questo batch introduce un nuovo `PropKind`, un nuovo motore di
compilazione CSS o un runtime JS. Tutti e cinque si esprimono con i `kind` già
dichiarati in `prop-spec.types.ts` e già compilati da `compiler/value-to-declarations.ts`.
È la ragione per cui questo è il **batch 1**: massimo riempimento della palette,
rischio architetturale nullo.

Due sole eccezioni dichiarate esplicitamente, entrambe segnalate nel testo:

- `icon` usa un `enum` chiuso di nomi icona invece di un `kind: 'iconRef'` dedicato
  (§ 3.3, con la motivazione e il percorso di migrazione futuro).
- `htmlEmbed` richiede una decisione di sicurezza separata prima di essere abilitato
  (§ 3.5) — è l'unico dei cinque che **non** va in produzione con `enabled: true`
  senza un ADR di sanitizzazione firmato.

## 1. Convenzioni rispettate

Ogni definizione segue la forma già in uso nei venti tipi esistenti:

| Elemento | Convenzione |
|---|---|
| File | `app/backend/src/blocks/types/<tipo>.block.ts`, export `<tipo>Block: BlockDefinition` |
| Commento di testa | Italiano, cita l'ADR/spec che autorizza il tipo e motiva le scelte non ovvie |
| Versione | `v: 1`, `migrations: []` (tipi nuovi, nessuna storia da migrare) |
| Prop comuni | `hideOn`, `customCssClass`, `customElementId` su **tutti** i tipi (come `gallery`) |
| Prop di stile | `margin: spacing`, `styleLayer: enum`, `styleBorder`, `styleShadow` dove sensato |
| `meta.props` | Una voce per **ogni** prop dichiarata — l'assenza è un difetto presidiato da test di invariante (ADR-30 § 4) |
| Stati | `stateful: true` solo dove Elementor espone davvero Normal/Hover (ADR-75) |

## 2. Wiring comune (una volta sola, non per widget)

### 2.1 Registro backend — `block-registry.ts`

```ts
import { dividerBlock } from './types/divider.block';
import { spacerBlock } from './types/spacer.block';
import { iconBlock } from './types/icon.block';
import { iconBoxBlock } from './types/icon-box.block';
import { htmlEmbedBlock } from './types/html-embed.block';
```

Aggiungere i cinque a `BLOCK_DEFINITIONS`. Aggiornare il commento di testa
(«venti tipi» → «venticinque tipi»).

**`ROOT_ALLOWED`**: aggiungere `divider`, `spacer`, `icon`, `iconBox`, `htmlEmbed`.
Motivazione da scrivere nel commento: sono tutte foglie senza tipo-figlio dedicato,
stesso trattamento di `gallery` — un autore può legittimamente mettere un separatore
o un embed come unico nodo di un template di area.

`computeBlockRegistryToken` cambia da solo: nessuna azione, ma il deploy invalida
la cache pubblica (comportamento atteso e documentato).

### 2.2 Palette editor — `sidebar/WidgetPalette.tsx`

```ts
const CATEGORY_BY_TYPE: Record<string, string> = {
  // … esistenti
  divider: 'Base',
  spacer: 'Base',
  icon: 'Base',
  iconBox: 'Base',
  htmlEmbed: 'Struttura',
};
```

Dopo questo batch "Base" passa da 3 a 7 tessere: la griglia a 2 colonne attuale
produce 4 righe. Raccomandazione (fuori scope di questa spec, § 5): 3 colonne.

### 2.3 Icone — `block-icon` (mappa `ICON_MAP`)

| tipo | `meta.icon` | icona Tabler |
|---|---|---|
| `divider` | `separator-horizontal` | `IconSeparatorHorizontal` |
| `spacer` | `arrows-vertical` | `IconArrowsVertical` |
| `icon` | `star` | `IconStar` |
| `iconBox` | `box-align-top` | `IconBoxAlignTop` |
| `htmlEmbed` | `code` | `IconCode` |

Ogni voce va aggiunta a `ICON_MAP` con riferimento stabile (mai una funzione creata
inline — vincolo `react-hooks/static-components` già documentato in `WidgetPalette.tsx`).

### 2.4 Renderer pubblici

Un componente per tipo in `app/frontend/src/components/blocks/blocks/`, registrato
nella mappa di rendering esistente, con `<Tipo>.module.css` accanto. Tutti e cinque
sono CSS-only: nessun `useEffect`, nessun listener, nessuna dipendenza nuova.

---

## 3. I cinque widget

### 3.1 `divider` — Separatore

Linea orizzontale con stile, spessore, colore, larghezza e allineamento.
Equivalente Elementor: *Divider* (senza il sotto-caso "testo/icona nel mezzo",
rimandato: richiede un figlio o una prop testo, e raddoppia la superficie CSS).

```ts
import { BlockDefinition } from '../block-definition.types';

/**
 * `divider` — ventunesimo tipo del registro (`SPEC-widget-batch-1.md` § 3.1).
 * Foglia CSS-only: una regola `border-top` su un elemento vuoto, nessun runtime.
 *
 * `color` è `colorRef` con `cssProperty: 'border-top-color'` — la stessa prop che
 * su `heading` punta a `color` (ADR-81): il `kind` è identico, il bersaglio CSS lo
 * dichiara il descrittore, mai il compilatore. `stateful: true` perché Elementor
 * espone l'hover sul separatore e il costo è nullo (ADR-75 lo compila già).
 *
 * `weight` e `width` usano `unitValue` invece di `number`: entrambi hanno un'unità
 * significativa e variabile (`px`/`%` per la larghezza) — `number` costringerebbe a
 * un'unità implicita nel renderer, che è esattamente ciò che `unitValue` evita.
 */
export const dividerBlock: BlockDefinition = {
  type: 'divider',
  v: 1,
  props: {
    dividerStyle: {
      kind: 'enum',
      required: false,
      values: ['solid', 'dashed', 'dotted', 'double'],
      default: 'solid',
    },
    weight: {
      kind: 'unitValue',
      required: false,
      units: ['px'],
      min: 1,
      max: 50,
      responsive: true,
      cssProperty: 'border-top-width',
      default: { default: { value: 1, unit: 'px' } },
    },
    width: {
      kind: 'unitValue',
      required: false,
      units: ['px', '%'],
      min: 0,
      max: 1920,
      responsive: true,
      cssProperty: 'width',
      default: { default: { value: 100, unit: '%' } },
    },
    color: {
      kind: 'colorRef',
      required: false,
      responsive: true,
      stateful: true,
      cssProperty: 'border-top-color',
    },
    align: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['left', 'center', 'right'],
      default: { default: 'center' },
    },
    margin: {
      kind: 'spacing',
      required: false,
      target: 'margin',
      units: ['px', '%', 'em', 'rem'],
      min: 0,
      max: 500,
      responsive: true,
    },
    hideOn: { kind: 'hideOn', required: false },
    customCssClass: { kind: 'cssClassName', required: false },
    customElementId: { kind: 'htmlId', required: false },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Separatore',
    category: 'base',
    icon: 'separator-horizontal',
    props: {
      dividerStyle: { label: 'Stile', tab: 'style', order: 1 },
      weight: { label: 'Spessore', tab: 'style', order: 2 },
      width: { label: 'Larghezza', tab: 'style', order: 3 },
      color: { label: 'Colore', tab: 'style', order: 4 },
      align: { label: 'Allineamento', tab: 'style', order: 5 },
      margin: { label: 'Margine', tab: 'style', order: 6 },
      hideOn: { label: 'Nascondi su breakpoint', tab: 'advanced', order: 7 },
      customCssClass: {
        label: 'Classe CSS personalizzata',
        tab: 'advanced',
        order: 8,
        help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
      },
      customElementId: {
        label: 'ID elemento personalizzato',
        tab: 'advanced',
        order: 9,
        help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
      },
    },
  },
};
```

**Renderer.** `<hr>` no: un `<div role="separator">` evita i default UA inconsistenti.

```css
.divider {
  border-top-style: var(--divider-style, solid);
  /* weight / width / border-top-color arrivano dal CSS compilato per style-id */
  margin-inline: 0;   /* align=left */
}
.alignCenter { margin-inline: auto; }
.alignRight  { margin-inline-start: auto; }
```

`dividerStyle` e `align` sono prop di **presentazione senza `cssProperty`**: il
renderer le traduce in classi, come già fa `Section.tsx` con `withOverlay`.

---

### 3.2 `spacer` — Spaziatore

Spazio verticale esplicito e responsive. Il widget più banale del batch e uno dei
tre più usati in Elementor.

```ts
/**
 * `spacer` — ventiduesimo tipo (`SPEC-widget-batch-1.md` § 3.2). Un solo scopo:
 * uno spazio verticale che l'autore controlla per breakpoint senza toccare i
 * margini del vicino. Foglia, nessuna prop di colore/bordo/ombra: un `spacer` che
 * si vede non è più uno `spacer` (usare `divider` o un `container`).
 */
export const spacerBlock: BlockDefinition = {
  type: 'spacer',
  v: 1,
  props: {
    height: {
      kind: 'unitValue',
      required: false,
      units: ['px', 'vh', 'rem'],
      min: 0,
      max: 1000,
      responsive: true,
      cssProperty: 'height',
      default: { default: { value: 50, unit: 'px' } },
    },
    hideOn: { kind: 'hideOn', required: false },
    customCssClass: { kind: 'cssClassName', required: false },
    customElementId: { kind: 'htmlId', required: false },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Spaziatore',
    category: 'base',
    icon: 'arrows-vertical',
    props: {
      height: { label: 'Altezza', tab: 'style', order: 1 },
      hideOn: { label: 'Nascondi su breakpoint', tab: 'advanced', order: 2 },
      customCssClass: { label: 'Classe CSS personalizzata', tab: 'advanced', order: 3 },
      customElementId: { label: 'ID elemento personalizzato', tab: 'advanced', order: 4 },
    },
  },
};
```

**Nota editor.** Uno `spacer` vuoto è invisibile sul canvas: `EditorBlockWrapper`
deve dargli un'altezza minima cliccabile e un tratteggio in modalità editing
(stesso trattamento già riservato ai contenitori vuoti). Senza questo, il widget
è inselezionabile — è il difetto più probabile di questo batch.

---

### 3.3 `icon` — Icona

Icona singola con dimensione, colore, rotazione e link opzionale.

**Decisione: `enum` chiuso, non un nuovo `kind: 'iconRef'`.**
Un `iconRef` con libreria completa richiede: nuovo kind in `prop-spec.types.ts`,
ramo nel validator (113k righe già), nuovo controllo con ricerca nell'inspector,
e una decisione su quale libreria spedire al frontend pubblico. Un `enum` di ~40
nomi Tabler già presenti nel bundle costa zero su tutti e quattro i fronti e copre
il caso reale (icone decorative accanto a testo). Il percorso di migrazione è
pulito: quando `iconRef` esisterà, una `migrate-icon-v1-to-v2` mapperà il nome
enum sulla nuova forma — esattamente come `migrate-heading-v1-to-v2` ha mappato
`styleTextColor` su `color`.

```ts
/** Set chiuso, allineato a `ICON_MAP` del frontend: ogni valore qui DEVE avere una
 *  voce lì, presidiato da un test di invariante (stesso principio di `meta.props`). */
const ICON_NAMES = [
  'star', 'heart', 'check', 'x', 'plus', 'minus', 'arrow-right', 'arrow-left',
  'arrow-up', 'arrow-down', 'chevron-right', 'chevron-down', 'phone', 'mail',
  'map-pin', 'clock', 'calendar', 'user', 'users', 'settings', 'search', 'home',
  'shopping-cart', 'credit-card', 'truck', 'package', 'shield', 'lock', 'world',
  'device-mobile', 'download', 'upload', 'link', 'bulb', 'rocket', 'target',
  'chart-bar', 'trophy', 'quote', 'info-circle',
] as const;

export const iconBlock: BlockDefinition = {
  type: 'icon',
  v: 1,
  props: {
    iconName: { kind: 'enum', required: true, values: ICON_NAMES },
    link: { kind: 'link', required: false },
    size: {
      kind: 'unitValue',
      required: false,
      units: ['px', 'rem', 'em'],
      min: 8,
      max: 400,
      responsive: true,
      cssProperty: 'font-size',
      default: { default: { value: 32, unit: 'px' } },
    },
    color: {
      kind: 'colorRef',
      required: false,
      responsive: true,
      stateful: true,
      cssProperty: 'color',
    },
    iconStyle: {
      kind: 'enum',
      required: false,
      values: ['default', 'stacked', 'framed'],
      default: 'default',
    },
    backgroundColor: {
      kind: 'colorRef',
      required: false,
      responsive: true,
      stateful: true,
      cssProperty: 'background-color',
    },
    styleRadius: { kind: 'radius', required: false, responsive: true },
    rotate: { kind: 'number', required: false, min: -360, max: 360, default: 0 },
    align: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['left', 'center', 'right'],
      default: { default: 'left' },
    },
    padding: {
      kind: 'spacing',
      required: false,
      target: 'padding',
      units: ['px', 'em', 'rem'],
      min: 0,
      max: 200,
      responsive: true,
    },
    margin: {
      kind: 'spacing',
      required: false,
      target: 'margin',
      units: ['px', '%', 'em', 'rem'],
      min: 0,
      max: 500,
      responsive: true,
    },
    styleBorder: { kind: 'border', required: false },
    hideOn: { kind: 'hideOn', required: false },
    customCssClass: { kind: 'cssClassName', required: false },
    customElementId: { kind: 'htmlId', required: false },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Icona',
    category: 'base',
    icon: 'star',
    props: {
      iconName: { label: 'Icona', order: 1 },
      link: { label: 'Link', order: 2 },
      size: { label: 'Dimensione', tab: 'style', order: 3 },
      color: { label: 'Colore', tab: 'style', order: 4 },
      iconStyle: {
        label: 'Stile',
        tab: 'style',
        order: 5,
        help: 'Default: sola icona. Stacked: icona su sfondo pieno. Framed: icona dentro un bordo.',
      },
      backgroundColor: { label: 'Colore di sfondo', tab: 'style', order: 6 },
      styleRadius: { label: 'Raggio', tab: 'style', order: 7 },
      rotate: { label: 'Rotazione (gradi)', tab: 'style', order: 8 },
      align: { label: 'Allineamento', tab: 'style', order: 9 },
      padding: { label: 'Padding', tab: 'style', order: 10 },
      margin: { label: 'Margine', tab: 'style', order: 11 },
      styleBorder: { label: 'Bordo', tab: 'style', order: 12 },
      hideOn: { label: 'Nascondi su breakpoint', tab: 'advanced', order: 13 },
      customCssClass: { label: 'Classe CSS personalizzata', tab: 'advanced', order: 14 },
      customElementId: { label: 'ID elemento personalizzato', tab: 'advanced', order: 15 },
    },
  },
};
```

**Renderer.** L'icona è un SVG Tabler dimensionato con `width: 1em; height: 1em`,
così `size` (che compila su `font-size`) la governa senza una seconda prop.
`rotate` è l'unica prop senza `cssProperty`: il renderer emette
`style={{ rotate: `${rotate}deg` }}` inline, perché è un valore per-istanza che
non ha senso come regola per style-id.

`iconStyle` seleziona la classe: `.default` (nessun box), `.stacked`
(`background-color` + `padding` attivi), `.framed` (`border` attivo, sfondo
trasparente). L'inspector dovrebbe nascondere `backgroundColor` fuori da `stacked`
e `styleBorder` fuori da `framed` — stesso pattern di `visibleFields` già in
`StyleTab.tsx` per `section`/`image`. Presentazione, mai validazione.

---

### 3.4 `iconBox` — Box icona

Icona + titolo + testo in un blocco allineato. In Elementor è tra i tre widget più
usati per le sezioni "servizi/features".

**Decisione: foglia con prop proprie, non un contenitore di `icon`+`heading`+`richText`.**
Un contenitore darebbe più libertà ma costringe l'autore a comporre tre nodi e a
gestirne l'allineamento reciproco a mano — cioè esattamente il lavoro che questo
widget esiste per evitare. Chi vuole la composizione libera ha già `container`.

```ts
export const iconBoxBlock: BlockDefinition = {
  type: 'iconBox',
  v: 1,
  props: {
    iconName: { kind: 'enum', required: true, values: ICON_NAMES },
    title: { kind: 'plainText', required: true, maxLength: 120 },
    titleLevel: {
      kind: 'enum',
      required: false,
      values: ['h2', 'h3', 'h4', 'h5', 'h6', 'div'],
      default: 'h3',
    },
    description: { kind: 'plainText', required: false, maxLength: 600 },
    link: { kind: 'link', required: false },
    iconPosition: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['top', 'left', 'right'],
      default: { default: 'top' },
    },
    iconSize: {
      kind: 'unitValue',
      required: false,
      units: ['px', 'rem'],
      min: 8,
      max: 200,
      responsive: true,
      default: { default: { value: 40, unit: 'px' } },
    },
    iconColor: {
      kind: 'colorRef',
      required: false,
      responsive: true,
      stateful: true,
      cssProperty: 'color',
    },
    iconGap: {
      kind: 'unitValue',
      required: false,
      units: ['px', 'rem'],
      min: 0,
      max: 200,
      responsive: true,
      cssProperty: 'gap',
      default: { default: { value: 16, unit: 'px' } },
    },
    titleTypography: { kind: 'typography', required: false, responsive: true, stateful: true },
    titleColor: {
      kind: 'colorRef',
      required: false,
      responsive: true,
      stateful: true,
      cssProperty: 'color',
    },
    descriptionTypography: { kind: 'typography', required: false, responsive: true },
    descriptionColor: {
      kind: 'colorRef',
      required: false,
      responsive: true,
      cssProperty: 'color',
    },
    textAlign: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['left', 'center', 'right'],
      default: { default: 'center' },
    },
    padding: {
      kind: 'spacing',
      required: false,
      target: 'padding',
      units: ['px', '%', 'em', 'rem'],
      min: 0,
      max: 300,
      responsive: true,
    },
    margin: {
      kind: 'spacing',
      required: false,
      target: 'margin',
      units: ['px', '%', 'em', 'rem'],
      min: 0,
      max: 500,
      responsive: true,
    },
    styleBorder: { kind: 'border', required: false },
    styleRadius: { kind: 'radius', required: false, responsive: true },
    styleShadow: { kind: 'shadow', required: false },
    hideOn: { kind: 'hideOn', required: false },
    customCssClass: { kind: 'cssClassName', required: false },
    customElementId: { kind: 'htmlId', required: false },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: { label: 'Box icona', category: 'base', icon: 'box-align-top', props: { /* una voce per prop, stesse etichette del § 3.3 */ } },
};
```

**Attenzione — tre `colorRef` con lo stesso `cssProperty: 'color'`.**
`iconColor`, `titleColor` e `descriptionColor` compilerebbero tre regole
identiche sullo stesso style-id. Servono **tre style-id distinti** (uno per parte
interna), oppure un selettore discendente per parte. È la sola novità tecnica del
batch e va risolta prima di scrivere il renderer: la via più coerente con
`generateCanvasCss.ts` è emettere `[data-canvas-style-id="X"] .iconBoxTitle { … }`,
cioè permettere a un descrittore di dichiarare un **sotto-selettore**. Se questa
estensione non è accettabile in questo round, `iconBox` slitta al batch 2 e il
batch 1 spedisce quattro widget.

**Renderer.** Flex: `iconPosition: top` → `flex-direction: column`; `left`/`right`
→ `row`/`row-reverse` con `align-items: flex-start`. `iconGap` compila su `gap`.
`link`, se presente, avvolge l'intero box in `<a>` (non solo il titolo).

---

### 3.5 `htmlEmbed` — Codice HTML

Blocco di HTML arbitrario. Elementor lo chiama *HTML*. È il widget che sblocca
tutte le integrazioni di terze parti (form esterni, mappe, script di tracciamento)
senza costruire un widget per ciascuna.

**Questo widget non è un problema di UI, è una decisione di sicurezza.**
Prima di `enabled: true` serve un ADR firmato che risponda a tre domande:

1. **Chi può inserirlo.** Proposta: `minRole` al livello più privilegiato
   disponibile (solo amministratori). Il campo `minRole` esiste già in
   `BlockDefinition` ed è già valutato server-side.
2. **Cosa viene sanitizzato.** Proposta: nessuna sanitizzazione (un embed
   sanitizzato è inutile — gli script sono lo scopo), compensata dal punto 1 e
   dal punto 3. L'alternativa — allow-list di tag — va decisa ora, non dopo.
3. **Dove viene renderizzato.** Proposta: nel documento pubblico direttamente;
   **nell'editor, mai** — il canvas mostra un segnaposto con le prime righe del
   codice. Renderizzare HTML arbitrario dentro l'editor espone la sessione
   autenticata dell'autore, ed è un rischio che nessun beneficio d'anteprima
   giustifica.

```ts
export const htmlEmbedBlock: BlockDefinition = {
  type: 'htmlEmbed',
  v: 1,
  props: {
    html: { kind: 'plainText', required: true, maxLength: 20000 },
    margin: {
      kind: 'spacing',
      required: false,
      target: 'margin',
      units: ['px', '%', 'em', 'rem'],
      min: 0,
      max: 500,
      responsive: true,
    },
    hideOn: { kind: 'hideOn', required: false },
    customCssClass: { kind: 'cssClassName', required: false },
    customElementId: { kind: 'htmlId', required: false },
  },
  children: { allow: [] },
  migrations: [],
  enabled: false,          // ← fino all'ADR di sicurezza firmato
  minRole: 0,              // ← allineare al valore RBAC dell'amministratore
  meta: {
    label: 'HTML',
    category: 'struttura',
    icon: 'code',
    props: {
      html: {
        label: 'Codice HTML',
        order: 1,
        help: 'Inserito così com\'è nella pagina pubblica. Non viene eseguito nell\'editor.',
      },
      margin: { label: 'Margine', tab: 'style', order: 2 },
      hideOn: { label: 'Nascondi su breakpoint', tab: 'advanced', order: 3 },
      customCssClass: { label: 'Classe CSS personalizzata', tab: 'advanced', order: 4 },
      customElementId: { label: 'ID elemento personalizzato', tab: 'advanced', order: 5 },
    },
  },
};
```

**Controllo inspector.** `plainText` con `maxLength: 20000` renderizzerebbe un
`TextInput` a riga singola. Serve un ramo in `PropField.tsx`: `plainText` con
`maxLength > 500` → `Textarea` monospace `autosize` (min 6 righe). Regola generale
utile anche altrove, non un caso speciale per questo tipo.

---

## 4. Checklist di esecuzione

Per ciascuno dei cinque, nell'ordine:

1. `types/<tipo>.block.ts` con commento di testa che cita questa spec
2. Import + voce in `BLOCK_DEFINITIONS` + `ROOT_ALLOWED` in `block-registry.ts`
3. Test di invariante del registro: passa senza modifiche se `meta.props` è completo
4. Test validator: props valide accettate, props sconosciute respinte, `children: []` rispettato
5. Renderer `<Tipo>.tsx` + `<Tipo>.module.css` + registrazione nella mappa di rendering
6. `CATEGORY_BY_TYPE` in `WidgetPalette.tsx` + voce in `ICON_MAP`
7. Test di `generateCanvasCss` per almeno una prop `stateful` del tipo (hover)
8. `defaultPropsFor` produce un nodo valido: verificabile con un click-to-add nel test della palette

**Ordine consigliato**: `spacer` → `divider` → `icon` → `htmlEmbed` → `iconBox`.
I primi due chiudono in poche ore e validano la pipeline completa (registro →
validator → palette → renderer → CSS) su un tipo banale, prima di affrontare
`icon` (set chiuso + invariante con `ICON_MAP`) e `iconBox` (sotto-selettori CSS).

## 5. Fuori scope, ma conseguenza diretta

Con 7 tessere in "Base" la griglia a 2 colonne della palette diventa alta e
dispersiva. Due interventi, entrambi indipendenti da questa spec:

- **Griglia a 3 colonne**, tessere ~72px (`WidgetPalette.module.css`)
- **Pannello sinistro commutabile** widget ↔ ispettore, per liberare la colonna
  destra e allargare il canvas

## 6. Cosa resta dopo questo batch

Batch 2 (richiedono runtime JS o nuovi kind): `video`, `counter`, `progress`,
`rating`, `countdown`, `mappa`, `social icons`, `testimonial`, `pricing table`,
`TOC`, `breadcrumbs`, `search`. Il primo da affrontare è `video` (embed responsive,
nessuna dipendenza), l'ultimo `TOC` (richiede di leggere l'albero renderizzato).
