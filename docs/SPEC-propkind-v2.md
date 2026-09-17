# SPEC — PropKind v2 e schema blocchi per la parità Elementor Pro

> Bozza di specifica tecnica, da approvare via RFC → ADR (`CLAUDE.md` § Ask first: ogni `kind` nuovo è una firma). Estende `app/backend/src/blocks/prop-spec.types.ts` senza rompere i `kind` esistenti; nessun bump di `v` per i blocchi che aggiungono solo prop opzionali (principio ADR-47/58). Un unico interprete (`validator/`) continua a leggere tutti i descrittori.

## 1. Principi

1. **Valore sempre un letterale, mai CSS eseguibile**: ogni `kind` produce un oggetto JSON validato campo per campo; il CSS lo emette il renderer.
2. **Modificatori ortogonali al `kind`**: `responsive` (ADR-29) e il nuovo `stateful` cambiano la *forma* dell'envelope, non il `kind`. Combinabili: `{ normal: { default, tablet?, mobile? }, hover?: {...} }`.
3. **Riferimenti a token risolti a export**: `colorRef`/`fontRef`/`dynamic` non portano il valore finale; il worker `static-export` li risolve. Nessuna risoluzione a runtime pubblico.
4. **Intervalli dichiarati dal descrittore** dove ha senso per prop (`unitValue`), fissi nel validator dove esiste un solo uso sensato (`border`, `shadow`, `transform`).
5. **Migrazioni dichiarate**: quando una prop enum a scala chiusa diventa libera (padding 0–96 → `spacing`), la migrazione per nodo mappa token → valore (`'24'` → `{value:24,unit:'px'}`) con `v` bump del tipo.

## 2. Modificatori di envelope

```ts
interface BasePropSpec {
  required: boolean;
  default?: unknown;
  responsive?: boolean;   // ADR-29: { default, tablet?, mobile?, ...breakpointCustom }
  stateful?: boolean;     // NUOVO: { normal, hover?, focus?, active? }
}
```

Ordine di annidamento fisso: **stato → breakpoint → valore**. Esempio `styleBackground` su button:
```json
{ "normal": { "default": { "ref": "primary" } }, "hover": { "default": "#1b5fa8" } }
```
Stati ammessi (chiuso): `normal | hover | focus | active`. `transitionMs` è una prop separata (`kind:'number'`, 0–2000) per blocco, non per prop.

### 2.1 Breakpoint configurabili

`RESPONSIVE_BREAKPOINTS` passa da costante a **impostazione di sito** (`app_settings.breakpoints`), con default Elementor:

| chiave | tipo | default max-width | attivo default |
|---|---|---|---|
| `default` | base | — | sì |
| `widescreen` | min-width | 2400 | no |
| `laptop` | max-width | 1366 | no |
| `tabletExtra` | max-width | 1200 | no |
| `tablet` | max-width | 1024 | sì |
| `mobileExtra` | max-width | 880 | no |
| `mobile` | max-width | 767 | sì |

Il validator accetta solo chiavi attive; disattivare un breakpoint con valori salvati richiede conferma (l'export ignora la chiave, il dato resta). Cascata: dal più largo al più stretto, `widescreen` è min-width e non partecipa alla cascata verso il basso.

## 3. Nuovi PropKind

### 3.1 `colorRef`
```ts
{ kind: 'colorRef'; allowAlpha?: boolean }
// valore: string hex (#RGB|#RRGGBB|#RRGGBBAA se allowAlpha) | { ref: GlobalColorId }
```
`GlobalColorId` = id di `global_tokens.colors[]` (vedi § 5). Sostituisce progressivamente `kind:'color'` (che resta valido; `colorRef` accetta il superset).

### 3.2 `fontRef`
```ts
{ kind: 'fontRef' }
// valore: { ref: GlobalFontId } | { family: string; source: 'system'|'google'|'custom' }
```
`family` per `google` deve appartenere all'elenco `fonts.google_allowlist` sincronizzato in DB (no fetch runtime). `custom` referenzia `fonts` table (upload woff2).

### 3.3 `typography`
```ts
{ kind: 'typography' }
// valore (tutti opzionali):
{
  fontFamily?: FontRefValue,
  fontSize?: UnitValue,            // units px|em|rem|vw|%  1–400
  fontWeight?: '100'|'200'|...|'900'|'normal'|'bold',
  textTransform?: 'none'|'uppercase'|'lowercase'|'capitalize',
  fontStyle?: 'normal'|'italic'|'oblique',
  textDecoration?: 'none'|'underline'|'overline'|'line-through',
  lineHeight?: UnitValue,          // units em|px  0–10 / 0–200
  letterSpacing?: UnitValue,       // px|em  -20–50
  wordSpacing?: UnitValue          // px|em  -20–100
}
```
`responsive` opera **per campo** (ogni campo ha il proprio envelope), come Elementor.

### 3.4 `spacing`
```ts
{ kind: 'spacing'; units: LengthUnit[]; min: number; max: number; allowNegative?: boolean }
// valore: { top, right, bottom, left: number; unit: LengthUnit; linked: boolean }
```
Sostituisce le 8 prop enum `stylePadding*/styleMargin*` con due prop `stylePadding`/`styleMargin` (migrazione § 6).

### 3.5 `radius`
```ts
{ kind: 'radius' } // { tl, tr, br, bl: number(0–500); unit: 'px'|'%'; linked: boolean }
```
`border.radius` scalare resta accettato e migrato a 4 angoli uguali.

### 3.6 `gradient`
```ts
{ kind: 'gradient' }
// { type: 'linear'|'radial'; angle?: 0–360; position?: BgPosition; stops: [{ color: ColorRefValue; at: 0–100 }] (2–6) }
```

### 3.7 `background`
```ts
{ kind: 'background'; allowVideo?: boolean; allowSlideshow?: boolean }
// { type: 'none'|'color'|'gradient'|'image'|'video'|'slideshow',
//   color?: ColorRefValue, gradient?: GradientValue,
//   image?: { mediaRef, position, attachment:'scroll'|'fixed', repeat, size:'auto'|'cover'|'contain'|'custom', customSize?: UnitValue },
//   video?: { mediaRef|url(youtube/vimeo allowlist), start?, end?, loop, playOnMobile, fallbackMediaRef },
//   slideshow?: { items: mediaRef[] (1–10), duration, transition:'fade'|'slide', kenBurns },
//   overlay?: { color?: ColorRefValue|GradientValue; opacity: 0–1; blend?: BlendMode } }
```
Unifica le 9 prop di sfondo di `section` (ADR-50) in una sola, `stateful`.

### 3.8 `position`
```ts
{ kind: 'position' }
// { type: 'default'|'relative'|'absolute'|'fixed'|'sticky',
//   offset?: { top?, right?, bottom?, left?: UnitValue },  // px|%|vh|vw  -1000–1000
//   zIndex?: -10–9999,
//   sticky?: { edge:'top'|'bottom'; offset: UnitValue; onBreakpoints: BreakpointKey[]; stayInParent: boolean } }
```
Sostituisce `styleLayer`. `fixed`/`absolute` non ammessi su nodi figli di `globalRef` (regola del validator).

### 3.9 `transform`, `filter`, `opacity`
```ts
{ kind: 'transform' } // { rotate?: -360–360; scale?: 0–3; skewX?/skewY?: -90–90; translateX?/translateY?: UnitValue; flipH?/flipV?: boolean; origin?: 'center'|... }
{ kind: 'filter' }    // { blur?: 0–20; brightness?: 0–200; contrast?: 0–200; saturate?: 0–200; hue?: 0–360; grayscale?: 0–100; blend?: BlendMode }
// opacity: kind:'number' min 0 max 1 (già esistente)
```
Entrambi `stateful` per gli effetti hover.

### 3.10 `animation`
```ts
{ kind: 'animation' }
// { entrance?: AnimationPreset (allowlist ~40 nomi: fadeIn, fadeInUp, zoomIn, bounceIn…); duration: 'slow'|'normal'|'fast'; delayMs: 0–5000 }
```
Emette classi CSS da un foglio statico; richiede la **isola JS** `observer` (IntersectionObserver) — vedi PLAN R5.

### 3.11 `motion`
```ts
{ kind: 'motion' }
// { scroll?: { verticalTranslate?, horizontalTranslate?, opacity?, blur?, rotate?, scale?: Range{ speed, viewportFrom, viewportTo } },
//   mouse?: { track?: { direction: 'opposite'|'direct'; speed }, tilt?: {...} },
//   onBreakpoints: BreakpointKey[] }
```
Solo JS pubblico; disattivato con `prefers-reduced-motion`.

### 3.12 `link`
```ts
{ kind: 'link' }
// { href: UrlValue | { pageRef } | { mediaRef } | { dynamic }, target: '_self'|'_blank', rel: ('nofollow'|'noopener'|'sponsored')[], lightbox?: boolean, attributes?: AttributesValue }
```
Sostituisce `button.href`, aggiunge link a heading/image/container.

### 3.13 `icon`
```ts
{ kind: 'icon' }
// { set: 'tabler'|'custom'; name: string (allowlist per set); svgMediaRef?: mediaRef (solo set custom, SVG sanitizzato con DOMPurify profile 'svg-strict') }
```
Render pubblico: SVG inline nel file statico (nessun font icone).

### 3.14 `attributes`
```ts
{ kind: 'attributes' } // [{ name: /^(data-[a-z0-9-]{1,40}|aria-[a-z]{1,20}|title|role|lang)$/, value: string ≤200 }] max 10
```
Mai `on*`, `href`, `src`, `style`, `class`, `id` (già coperti da kind dedicati).

### 3.15 `css`
```ts
{ kind: 'css'; maxLength: 5000 }
```
Valore: stringa CSS. Sanitizzazione server (`css-tree` parse → allowlist): solo dichiarazioni e regole annidate sotto `selector` (auto-scoping `[data-block="<id>"]`), proprietà da allowlist (esclusi `behavior`, `expression`, `-moz-binding`), **nessun `url()`** salvo `public/media/<guid>`, nessun `@import/@font-face/@namespace`. Rifiuto → 400 con path.

### 3.16 `html`
```ts
{ kind: 'html'; profile: 'embed' }
```
Widget HTML/embed: profilo `sanitize-html` che ammette `<iframe>` solo da allowlist di host (YouTube, Vimeo, Google Maps, Spotify…) con `sandbox`, nessuno `<script>`. Per HTML arbitrario: render in `<iframe srcdoc sandbox="">` a export.

### 3.17 `dynamic` (wrapper)
Qualunque prop `plainText|richText|url|mediaRef|number|colorRef|link` può dichiarare `dynamic: true`. Valore alternativo: `{ $tag: DynamicTagId; args?: {}; fallback?: <valore del kind>; before?: string; after?: string }`.
Tag di primo rilascio (chiusi): `page.title`, `page.excerpt`, `page.featuredImage`, `page.url`, `page.publishedAt`, `page.author.name`, `page.field.<key>`, `site.name`, `site.logo`, `site.url`, `site.tagline`, `nav.parentTitle`, `date.now(format)`, `loop.item.<key>` (solo dentro `loop`). Risolti nel worker di export con il contesto pagina; `fallback` obbligatorio per prop `required`.

### 3.18 `query` (Loop Builder)
```ts
{ kind: 'query' }
// { source: 'pages'|'collection:<id>'|'manual', filters: [{field, op, value}] ≤ 8, orderBy, order, limit 1–48, offset, excludeCurrent, pagination: 'none'|'numbers'|'loadMore'|'infinite' }
```
`loadMore`/`infinite` richiedono isola JS + pagine statiche pre-generate `?page=N`.

### 3.19 `conditions` (Theme/Popup)
```ts
{ kind: 'conditions' }
// [{ effect: 'include'|'exclude'; scope: 'site'|'pages'|'page'|'collection'|'collectionItem'|'locale'|'notFound'|'search'; ref?: guid|id }]
```

### 3.20 `trigger` (Popup)
```ts
{ kind: 'trigger' }
// { onLoad?: {delayS}, onScroll?: {direction, percent}, onScrollToElement?: {htmlId}, onClick?: {count}, onInactivity?: {s}, onExitIntent?: boolean,
//   frequency: { showUpTo: n; perSession|perDays: n; hideAfterClose: boolean }, devices: BreakpointKey[], schedule?: {from,to,tz} }
```

## 4. Schema dei blocchi — modifiche

### 4.1 Contenitore unico
`section` e `container` → un solo tipo **`container`** `v: 2` (`section` resta leggibile, migrato con `contentWidth`/`columns`/`columnRatio` → `display:flex|grid` + `gridTemplateColumns`). Prop:
```
tag: enum div|section|header|footer|article|aside|nav|main
layout: { display: flex|grid, direction, wrap, justify, align, gap: {x,y}, gridTemplateColumns: UnitValue[]|'repeat(n,1fr)', gridTemplateRows, autoFlow, justifyItems, alignItems }   (responsive)
contentWidth: boxed|full ; boxedWidth: UnitValue ; minHeight: UnitValue ; overflow: visible|hidden|auto
background: background (stateful) ; border (stateful) ; radius ; shadow (stateful)
padding/margin: spacing ; position ; transform (stateful) ; opacity ; filter
link ; animation ; motion ; shapeDividerTop/Bottom: { style (allowlist 20), color, width, height, flip, invert, aboveContent }
htmlId, cssClass, attributes, css, hideOn: BreakpointKey[]
```
Nesting: `children.allow: '*'`, `MAX_DEPTH` 5 → 8, `MAX_NODES` 500 → 1500.

### 4.2 Prop "Avanzato" comuni a ogni widget (mixin)
`margin, padding (spacing) · position · zIndex · hideOn · animation · motion · transform · filter · opacity · border/radius/shadow (stateful) · background (stateful) · htmlId · cssClass · attributes · css`. Dichiarate una volta in `advanced.mixin.ts` e sparse in ogni `BlockDefinition` (il registro resta esplicito per tipo: nessun override implicito).

### 4.3 Widget nuovi — prop essenziali (Contenuto)
| tipo | prop principali |
|---|---|
| `divider` | style, weight, width, align, color, element:none|text|icon, gap |
| `spacer` | height (responsive unitValue) |
| `icon` | icon, link, view: default|stacked|framed, shape, size, color/bg (stateful), rotate |
| `iconList` | items[{icon, text, link}], layout, spaceBetween, divider, iconAlign |
| `iconBox` | icon, title, titleTag, description, link, position, iconSpacing |
| `imageBox` | image, title, description, link, position |
| `video` | source: youtube|vimeo|hosted, url/mediaRef, start/end, autoplay/mute/loop/controls, poster, lightbox, aspectRatio |
| `gallery` | items[mediaRef] ≤ 100, layout grid|masonry|justified, columns (responsive), gap, aspectRatio, lightbox, captions, filters (tags) |
| `html` | code (kind html) |
| `alert` | type, title, description, dismissible |
| `testimonial` | content, image, name, title, align, imagePosition |
| `testimonialCarousel` | items[], slidesToShow, autoplay, speed, arrows, dots, skin |
| `counter` | start, end, duration, prefix, suffix, separator, title |
| `progress` | title, percent, displayPercent, innerText |
| `starRating` | rating 0–10, scale 5|10, icon, unmarkedStyle |
| `socialIcons` | items[{network(allowlist), url}], shape, columns, align |
| `shareButtons` | networks[], view, skin, label |
| `map` | provider: osm|google-embed, lat/lng or address, zoom, height, markers[] |
| `pricingTable` | title, subtitle, currency, price, period, features[{text, icon, included}], button(link), ribbon |
| `countdown` | type: fixed|evergreen, dueDate|hours+minutes, show days/h/m/s, labels, onExpire: hide|redirect|message |
| `tableOfContents` | title, headingLevels[], hierarchical, collapsible, minimizeOnMobile |
| `breadcrumbs` | separator, showHome, homeLabel |
| `search` | placeholder, skin: classic|minimal|fullscreen, buttonType |
| `cta` | image, title, description, button, ribbon, hoverEffect |
| `flipBox` | front{...}, back{...}, effect, direction, height |
| `animatedHeadline` | before, animatedWords[], after, style: highlight|rotate, animation |
| `loop` | query, itemTemplate (template ref), columns, gap, pagination, emptyText |

## 5. Global Site Settings (schema `app_settings.global_kit`)
```ts
{
  colors: [{ id, label, value: hex|hexA }],           // system: primary, secondary, text, accent (non eliminabili) + custom ≤ 30
  fonts:  [{ id, label, typography: TypographyValue }],// system: primary, secondary, text, accent + custom ≤ 20
  themeStyle: { body: {typography, color, background}, h1..h6: {typography, color}, link: {color stateful}, button: {...stateful}, image: {border, radius, shadow stateful}, formFields: {...} },
  layout: { contentWidth, widgetSpace, pageTitleSelector, defaultContainerPadding },
  breakpoints: (§ 2.1),
  lightbox: { enabled, bgColor, uiColor, showTitle, showDescription, zoom, share },
  customFonts: [{ id, family, files: { woff2: mediaRef }[] , weights }],
  customIcons: [{ id, svgMediaRef, label }],
  customCode: [{ id, location: 'head'|'bodyStart'|'bodyEnd', priority, code, conditions }]  // Admin+
}
```

## 6. Migrazioni
| Tipo | v | Migrazione |
|---|---|---|
| `section` → `container` | 1→2 | `columns`/`columnRatio` → `layout.display:'grid'`, `gridTemplateColumns` da ratio; `stylePadding*` (enum px) → `padding` spacing; 9 prop sfondo → `background`; `styleLayer` → `position.zIndex` (base 0, raised 10, overlay 100, top 1000) |
| `heading/richText/image/button` | 1→2 | `styleTextColor` enum → `color: {ref:<token mappato>}`; `styleFontSize/Weight/Family` → `typography`; `styleMargin*` unitValue → `margin` spacing; `styleHide*` → `hideOn[]` |
| `button` | 2 | `href` → `link.href` |
| envelope | 1→2 | `breakpoints` attivi registrati nell'envelope (`meta.breakpoints`) per validare chiavi custom |

Le migrazioni sono difensive (ADR-21): valore non mappabile → default + warning in `MigrationResult`, mai 500.

## 7. Renderer e export
- Ogni `kind` ha una funzione `toCss(kind, value, ctx)` **unica**, condivisa admin/public (alias di build già esistente), che emette dichiarazioni per selettore `[data-block=<id>]`, per stato (`:hover`) e per breakpoint (`@media`). Il CSS va nel **CSS critico inline** del file statico (ADR-53); soglia 60 KB → split in `<link>` esterno.
- I riferimenti (`colorRef`/`fontRef`) diventano `var(--gk-color-<id>)` con `:root` compilato dai token: cambiare un Global Color rigenera solo il blocco `:root`, non le pagine (ri-export incrementale).
- **Isole JS** (unico bundle `public-runtime.js`, ESM, ≤ 30 KB gzip, moduli: `observer`, `motion`, `countdown`, `carousel`, `lightbox`, `popup`, `formSteps`, `loopPagination`, `search`, `toc`): incluso solo se l'albero contiene un blocco che lo dichiara in `meta.runtime[]`. CSP: `script-src 'self' 'nonce-…'`. Ogni modulo rispetta `prefers-reduced-motion`.

## 8. Vincoli invariati
- Sanitizzazione server-side pre-persistenza per ogni `kind` (ADR-20/21).
- Validazione albero integrale con path → 400.
- `plainText` verbatim, escape a render.
- Lock ottimistico `version` → 409.
- Nessuna esecuzione di codice utente lato server; `css`/`html`/`customCode` sono l'unica superficie nuova e restano Admin+ (customCode) o sanitizzati (css/html).
