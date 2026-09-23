import { Injectable } from '@nestjs/common';
import { BlockDefinition } from '../block-definition.types';
import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../block-registry';
import {
  BackgroundPropSpec,
  BorderPropSpec,
  BorderStyle,
  ColorRefPropSpec,
  CssPropSpec,
  EnumPropSpec,
  FilterPropSpec,
  FontRefPropSpec,
  LayoutPropSpec,
  LengthUnit,
  PositionPropSpec,
  PropKind,
  PropSpec,
  RESPONSIVE_BREAKPOINTS,
  ResponsiveBreakpointName,
  SHAPE_DIVIDER_STYLES,
  ShadowPropSpec,
  ShapeDividerStyle,
  SpacingPropSpec,
  TransformPropSpec,
  TypographyPropSpec,
  UnitValuePropSpec,
} from '../prop-spec.types';
import { ValidatableBlockNode } from './validatable-node.types';
import {
  BlockPropInvalidReason,
  BlockTreeValidationResult,
  BlockValidationError,
} from './validation-result.types';

/**
 * Allowlist DB-backed per `fontRef`/`typography.fontFamily` con
 * `source: 'google'|'custom'` (SPEC-PROPKIND-V2-DETAILS.md § 2 punti 3-4).
 * Assente = nessuna restrizione applicata (comportamento storico invariato,
 * S1.1): vedi nota di scelta di design sotto `BlockTreeValidationContext`.
 */
export interface FontAllowlist {
  /** Famiglie sincronizzate da `fonts.google_allowlist` (ADR-77 § "Conseguenze"). */
  google: readonly string[];
  /** `customFonts[].family` del `global_kit` corrente (`SPEC-GLOBAL-KIT.md` § 1). */
  custom: readonly string[];
}

/** Contesto opzionale passato all'interprete per la verifica di `minRole` (ADR-18: filtro aggiuntivo, non sostituisce ownership/guard). */
export interface BlockTreeValidationContext {
  /** Livello di ruolo RBAC dell'autore (valore più basso = più privilegi). Assente = nessun filtro `minRole` applicato. */
  roleLevel?: number;
  /**
   * `true` quando l'albero in validazione è il `content` di una Sezione
   * Globale (ADR-55, "Cicli chiusi per contratto"): impostato solo da
   * `GlobalSectionsService.runWriteContentPipeline`, mai da `PagesService` o
   * da qualunque altro consumer del contenuto di una Pagina. Un nodo
   * `globalRef` incontrato con questo flag attivo è respinto
   * (`BLOCK_TYPE_NOT_ALLOWED_IN_GLOBAL_SECTION`): elimina il ciclo per
   * costruzione, senza risolvere il riferimento né attraversare un grafo.
   */
  insideGlobalSection?: boolean;
  /**
   * Scelta di design S1.3 (`SPEC-PROPKIND-V2-DETAILS.md` § 2 punti 3-4): la
   * verifica di `fontRef`/`typography.fontFamily` con `source: 'google'|
   * 'custom'` contro l'allowlist sincronizzata è ora **implementata**, ma
   * **opzionale** — campo aggiunto a un contesto già opzionale con default
   * `{}`, mai una nuova firma di `validateTree`/`validateFontRefNakedValue`.
   * Scelta deliberata: `validateTree` ha oggi ~10 call site di produzione
   * (`PagesService`, `FormsService`, `GlobalSectionsService`,
   * `SiteTemplatesService`, `PublicPagesService`, i seed di `admin/seeds/`)
   * più i test; nessuno passa `fontAllowlist`, quindi nessuno di questi
   * cambia comportamento con questa modifica (stesso principio "modifica
   * meno invasiva compatibile coi chiamanti esistenti" richiesto dal task).
   * Il wiring "lettura di `global_kit.customFonts[]`/`fonts.google_allowlist`
   * prima di ogni validazione di un albero di blocchi" in
   * `PagesService`/`FormsService`/… resta **fuori scope** di questo
   * Sub-Task (S1.3 è la superficie Site Settings, non la pipeline di
   * salvataggio contenuto): richiederebbe una lettura extra di `app_settings`
   * per ogni salvataggio di Pagina/Form/Sezione Globale/Template, un cambio
   * di responsabilità che merita la propria review separata. Il meccanismo è
   * pronto e testato qui; il consumo è un follow-up esplicito, segnalato nel
   * resoconto finale di questo Sub-Task.
   */
  fontAllowlist?: FontAllowlist;
}

/** Schemi ammessi per `kind: 'url'` (SPEC-F02-blocchi.md § 3.6): assoluta http/https, `mailto:`, root-relative con una sola barra iniziale. */
const ABSOLUTE_URL_PATTERN = /^https?:\/\/.+/i;
const MAILTO_URL_PATTERN = /^mailto:.+/i;
const ROOT_RELATIVE_URL_PATTERN = /^\/(?!\/).*/;

/** Forma di un `guid`: 16 caratteri esadecimali minuscoli, coerente con `Utils.randomString` (`app/backend/src/common/utils.ts`). */
const GUID_PATTERN = /^[0-9a-f]{16}$/;

/**
 * Pattern **fisso e stretto** per `kind: 'color'` (ADR-33 § 3): solo
 * esadecimale a 3 o 6 cifre, niente `rgb()`/`hsl()`/`url()`/parole chiave
 * CSS — non un campo `pattern` generico riusabile da altre prop.
 */
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Pattern **fisso e stretto** per un singolo token di `cssClassName`/`htmlId`
 * (ADR-38 § 5): lettere/cifre/`-`/`_`, mai una cifra iniziale, ≤ 50
 * caratteri — stesso principio di `HEX_COLOR_PATTERN`, non un `pattern`
 * generico configurabile dal registro.
 */
const CSS_IDENTIFIER_TOKEN_PATTERN = /^[a-zA-Z_-][a-zA-Z0-9_-]{0,49}$/;
const CSS_CLASS_NAME_MAX_LENGTH = 100;
const CSS_CLASS_NAME_MAX_TOKENS = 3;

/** Stili ammessi per `kind: 'border'` (ADR-38 § 3). */
const BORDER_STYLES: readonly BorderStyle[] = ['solid', 'dashed', 'dotted', 'none'];
/** Intervalli fissi (unità implicita px) per `kind: 'border'` — non configurabili dalla prop (ADR-38 § 3). */
const BORDER_WIDTH_RANGE: [number, number] = [0, 12];
const BORDER_RADIUS_RANGE: [number, number] = [0, 48];

/** Intervalli fissi (unità implicita px) per `kind: 'shadow'` — non configurabili dalla prop (ADR-38 § 4). */
const SHADOW_OFFSET_RANGE: [number, number] = [-48, 48];
const SHADOW_BLUR_RANGE: [number, number] = [0, 64];
const SHADOW_SPREAD_RANGE: [number, number] = [-24, 24];

// ─── PropKind v2 (SPEC-PROPKIND-V2-DETAILS.md, ADR-74–ADR-77 round R0) ─────

/**
 * Stati ammessi per il modificatore `stateful` (ADR-75 § "Decisione" punto
 * 3): elenco **chiuso** a 4 valori, mai un quinto stato senza una firma
 * futura dedicata.
 */
const STATEFUL_STATES = ['normal', 'hover', 'focus', 'active'] as const;
type StatefulStateName = (typeof STATEFUL_STATES)[number];

/** `#RRGGBBAA` — ammesso solo quando `ColorRefPropSpec.allowAlpha` è `true` (SPEC-PROPKIND-V2-DETAILS.md § 1 punto 1). */
const HEX_COLOR_ALPHA_PATTERN = /^#[0-9a-fA-F]{8}$/;

/** I 4 id "system" di `app_settings.global_kit` (ADR-77 § 2): stabili, mai eliminabili, mai riusabili da un token custom. */
const GLOBAL_TOKEN_SYSTEM_IDS = ['primary', 'secondary', 'text', 'accent'] as const;

/** Sorgenti ammesse per `FontRefValue.source` (SPEC-PROPKIND-V2-DETAILS.md § 2). */
const FONT_FAMILY_SOURCES = ['system', 'google', 'custom'] as const;
type FontFamilySource = (typeof FONT_FAMILY_SOURCES)[number];

/** Vocabolario chiuso delle famiglie di sistema (SPEC-PROPKIND-V2-DETAILS.md § 2 punto 2, stesso elenco di `heading.block.ts` § `styleFontFamily`). */
const SYSTEM_FONT_FAMILIES = [
  'default',
  'inter',
  'roboto',
  'playfair',
  'montserrat',
  'monospace',
] as const;
type SystemFontFamily = (typeof SYSTEM_FONT_FAMILIES)[number];

/** Campi di `TypographyValue`, tutti opzionali (SPEC-PROPKIND-V2-DETAILS.md § 3). */
const TYPOGRAPHY_VALUE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'textTransform',
  'fontStyle',
  'textDecoration',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
] as const;
type TypographyFieldName = (typeof TYPOGRAPHY_VALUE_KEYS)[number];

const FONT_WEIGHT_VALUES = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  'normal',
  'bold',
] as const;
const TEXT_TRANSFORM_VALUES = ['none', 'uppercase', 'lowercase', 'capitalize'] as const;
const FONT_STYLE_VALUES = ['normal', 'italic', 'oblique'] as const;
const TEXT_DECORATION_VALUES = ['none', 'underline', 'overline', 'line-through'] as const;
const TYPOGRAPHY_FONT_SIZE_UNITS: readonly LengthUnit[] = ['px', 'em', 'rem', 'vw', '%'];
const TYPOGRAPHY_FONT_SIZE_RANGE: [number, number] = [1, 400];
const TYPOGRAPHY_LETTER_SPACING_UNITS: readonly LengthUnit[] = ['px', 'em'];
const TYPOGRAPHY_LETTER_SPACING_RANGE: [number, number] = [-20, 50];
const TYPOGRAPHY_WORD_SPACING_UNITS: readonly LengthUnit[] = ['px', 'em'];
const TYPOGRAPHY_WORD_SPACING_RANGE: [number, number] = [-20, 100];
/** `lineHeight` ha un intervallo diverso **per unità** (SPEC-PROPKIND-V2-DETAILS.md § 3): `em` 0–10, `px` 0–200. */
const TYPOGRAPHY_LINE_HEIGHT_UNITS = ['em', 'px'] as const;
const TYPOGRAPHY_LINE_HEIGHT_EM_RANGE: [number, number] = [0, 10];
const TYPOGRAPHY_LINE_HEIGHT_PX_RANGE: [number, number] = [0, 200];

/** Campi di `SpacingValue` (SPEC-PROPKIND-V2-DETAILS.md § 4): un solo `unit` per i quattro lati. */
const SPACING_SIDE_KEYS = ['top', 'right', 'bottom', 'left'] as const;
const SPACING_VALUE_KEYS = [...SPACING_SIDE_KEYS, 'unit', 'linked'] as const;

/** Intervallo e unità **fissi nel validatore** per `kind: 'radius'` (SPEC-PROPKIND-V2-DETAILS.md § 5). */
const RADIUS_CORNER_KEYS = ['tl', 'tr', 'br', 'bl'] as const;
const RADIUS_VALUE_KEYS = [...RADIUS_CORNER_KEYS, 'unit', 'linked'] as const;
const RADIUS_RANGE: [number, number] = [0, 500];
const RADIUS_UNITS = ['px', '%'] as const;

/** Forma e intervalli fissi per `kind: 'gradient'` (SPEC-PROPKIND-V2-DETAILS.md § 6). */
const GRADIENT_TYPES = ['linear', 'radial'] as const;
const GRADIENT_ANGLE_RANGE: [number, number] = [0, 360];
const GRADIENT_STOP_AT_RANGE: [number, number] = [0, 100];
const GRADIENT_STOPS_RANGE: [number, number] = [2, 6];
const GRADIENT_VALUE_KEYS = ['type', 'angle', 'position', 'stops'] as const;
const GRADIENT_STOP_KEYS = ['color', 'at'] as const;
/** Stesso vocabolario di `styleBackgroundPosition` (`section.block.ts` § ADR-50), 9 valori. */
const BG_POSITION_VALUES = [
  'top left',
  'top center',
  'top right',
  'center left',
  'center center',
  'center right',
  'bottom left',
  'bottom center',
  'bottom right',
] as const;

/** Forma e intervalli fissi per `kind: 'position'` (SPEC-PROPKIND-V2-DETAILS.md § 7). */
const POSITION_TYPES = ['default', 'relative', 'absolute', 'fixed', 'sticky'] as const;
/** `type` vietato dentro l'albero di una Sezione Globale (SPEC-PROPKIND-V2-DETAILS.md § 7 punto 4). */
const POSITION_RESTRICTED_TYPES_IN_GLOBAL_SECTION: readonly string[] = ['fixed', 'absolute'];
const POSITION_VALUE_KEYS = ['type', 'offset', 'zIndex', 'sticky'] as const;
const POSITION_OFFSET_SIDE_KEYS = ['top', 'right', 'bottom', 'left'] as const;
const POSITION_OFFSET_UNITS: readonly LengthUnit[] = ['px', '%', 'vh', 'vw'];
const POSITION_OFFSET_RANGE: [number, number] = [-1000, 1000];
const POSITION_ZINDEX_RANGE: [number, number] = [-10, 9999];
const POSITION_STICKY_EDGES = ['top', 'bottom'] as const;
const POSITION_STICKY_KEYS = ['edge', 'offset', 'onBreakpoints', 'stayInParent'] as const;

/** Forma e intervalli fissi per `kind: 'transform'` (SPEC-PROPKIND-V2-DETAILS.md § 8). */
const TRANSFORM_VALUE_KEYS = [
  'rotate',
  'scale',
  'skewX',
  'skewY',
  'translateX',
  'translateY',
  'flipH',
  'flipV',
  'origin',
] as const;
const TRANSFORM_ROTATE_RANGE: [number, number] = [-360, 360];
const TRANSFORM_SCALE_RANGE: [number, number] = [0, 3];
const TRANSFORM_SKEW_RANGE: [number, number] = [-90, 90];
const TRANSFORM_TRANSLATE_UNITS: readonly LengthUnit[] = ['px', '%'];
const TRANSFORM_ORIGIN_VALUES = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top left',
  'top right',
  'bottom left',
  'bottom right',
] as const;

/** Forma e intervalli fissi per `kind: 'filter'` (SPEC-PROPKIND-V2-DETAILS.md § 9). */
const FILTER_VALUE_KEYS = [
  'blur',
  'brightness',
  'contrast',
  'saturate',
  'hue',
  'grayscale',
  'blend',
] as const;
const FILTER_BLUR_RANGE: [number, number] = [0, 20];
const FILTER_BRIGHTNESS_RANGE: [number, number] = [0, 200];
const FILTER_CONTRAST_RANGE: [number, number] = [0, 200];
const FILTER_SATURATE_RANGE: [number, number] = [0, 200];
const FILTER_HUE_RANGE: [number, number] = [0, 360];
const FILTER_GRAYSCALE_RANGE: [number, number] = [0, 100];
/** Stesso vocabolario CSS `mix-blend-mode`/`background-blend-mode`, 12 valori chiusi. */
const FILTER_BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
] as const;

// ─── Container v2 (ADR-81/ADR-82, round R2 "parità Elementor Pro", S1.4) ──

/** Forma e vocabolario fissi per `kind: 'layout'` (`docs/SPEC-propkind-v2.md` § 4.1, ADR-82 § "Decisione" punto 1). */
const LAYOUT_VALUE_KEYS = [
  'display',
  'direction',
  'wrap',
  'justify',
  'align',
  'gap',
  'gridTemplateColumns',
  'gridTemplateRows',
  'autoFlow',
  'justifyItems',
  'alignItems',
] as const;
const LAYOUT_DISPLAY_VALUES = ['flex', 'grid'] as const;
const LAYOUT_DIRECTION_VALUES = ['row', 'row-reverse', 'column', 'column-reverse'] as const;
const LAYOUT_WRAP_VALUES = ['nowrap', 'wrap'] as const;
const LAYOUT_JUSTIFY_VALUES = [
  'flex-start',
  'flex-end',
  'center',
  'space-between',
  'space-around',
  'space-evenly',
] as const;
/** Vocabolario flex (`align`), stesso di `container` v1 `alignItems`. */
const LAYOUT_ALIGN_VALUES = ['stretch', 'flex-start', 'center', 'flex-end'] as const;
const LAYOUT_AUTO_FLOW_VALUES = ['row', 'column', 'row dense', 'column dense'] as const;
/** Vocabolario grid (`justifyItems`/`alignItems`), distinto da `align` (ADR-82 § "Decisione" punto 1). */
const LAYOUT_GRID_ALIGN_VALUES = ['start', 'end', 'center', 'stretch'] as const;
/** Unità/intervallo per `layout.gap.x`/`gap.y` — nessun valore dichiarato da ADR-82: scelta di design coerente con un solo uso sensato (stesso principio di `radius`/`border`). */
const LAYOUT_GAP_UNITS: readonly LengthUnit[] = ['px', '%', 'em', 'rem'];
const LAYOUT_GAP_RANGE: [number, number] = [0, 500];

/** Unità/intervalli fissi per `GridTrackValue` (ADR-82 § "Decisione" punto 1, terzo bullet). */
const GRID_TRACK_UNITS = ['fr', 'px', 'em', '%'] as const;
const GRID_TRACK_VALUE_RANGE: [number, number] = [0, 4000];
const GRID_TRACK_COUNT_RANGE: [number, number] = [1, 12];
const GRID_TRACK_ARRAY_LENGTH_RANGE: [number, number] = [1, 12];

/** Forma e vocabolario fissi per `kind: 'background'` (`docs/SPEC-propkind-v2.md` § 3.7). */
const BACKGROUND_VALUE_KEYS = [
  'type',
  'color',
  'gradient',
  'image',
  'video',
  'slideshow',
  'overlay',
] as const;
const BACKGROUND_TYPE_VALUES = [
  'none',
  'color',
  'gradient',
  'image',
  'video',
  'slideshow',
] as const;
const BACKGROUND_IMAGE_KEYS = [
  'mediaRef',
  'position',
  'attachment',
  'repeat',
  'size',
  'customSize',
] as const;
const BACKGROUND_IMAGE_ATTACHMENT_VALUES = ['scroll', 'fixed'] as const;
const BACKGROUND_IMAGE_REPEAT_VALUES = ['repeat', 'repeat-x', 'repeat-y', 'no-repeat'] as const;
const BACKGROUND_IMAGE_SIZE_VALUES = ['auto', 'cover', 'contain', 'custom'] as const;
/** Stesso intervallo di `styleWidth`/`styleHeight` di `container` v1 (0–4000, unità implicita px/%). */
const BACKGROUND_IMAGE_CUSTOM_SIZE_UNITS: readonly LengthUnit[] = ['px', '%'];
const BACKGROUND_IMAGE_CUSTOM_SIZE_RANGE: [number, number] = [0, 4000];
const BACKGROUND_VIDEO_KEYS = [
  'mediaRef',
  'url',
  'start',
  'end',
  'loop',
  'playOnMobile',
  'fallbackMediaRef',
] as const;
const BACKGROUND_SLIDESHOW_KEYS = ['items', 'duration', 'transition', 'kenBurns'] as const;
const BACKGROUND_SLIDESHOW_TRANSITION_VALUES = ['fade', 'slide'] as const;
const BACKGROUND_SLIDESHOW_ITEMS_RANGE: [number, number] = [1, 10];
const BACKGROUND_OVERLAY_KEYS = ['color', 'opacity', 'blend'] as const;
const BACKGROUND_OVERLAY_OPACITY_RANGE: [number, number] = [0, 1];

/** Forma fissa per `kind: 'link'` (`docs/SPEC-propkind-v2.md` § 3.12). */
const LINK_VALUE_KEYS = ['href', 'target', 'rel', 'lightbox'] as const;
const LINK_TARGET_VALUES = ['_self', '_blank'] as const;
const LINK_REL_VALUES = ['nofollow', 'noopener', 'sponsored'] as const;

/** Forma fissa per `kind: 'animation'` (`docs/SPEC-propkind-v2.md` § 3.10). Allowlist sottoinsieme di 12 nomi, vedi `AnimationValue` in `prop-spec.types.ts`. */
const ANIMATION_VALUE_KEYS = ['entrance', 'duration', 'delayMs'] as const;
const ANIMATION_ENTRANCE_VALUES = [
  'fadeIn',
  'fadeInUp',
  'fadeInDown',
  'fadeInLeft',
  'fadeInRight',
  'zoomIn',
  'zoomInUp',
  'bounceIn',
  'bounceInUp',
  'slideInUp',
  'slideInLeft',
  'slideInRight',
] as const;
const ANIMATION_DURATION_VALUES = ['slow', 'normal', 'fast'] as const;
const ANIMATION_DELAY_MS_RANGE: [number, number] = [0, 5000];

/** Forma fissa per `kind: 'motion'` (`docs/SPEC-propkind-v2.md` § 3.11), scope S1.4 ridotto (vedi `MotionValue`). */
const MOTION_VALUE_KEYS = ['scroll', 'onBreakpoints'] as const;
const MOTION_SCROLL_KEYS = ['verticalTranslate', 'opacity', 'rotate', 'scale'] as const;

/** Forma fissa per `kind: 'attributes'` (`docs/SPEC-propkind-v2.md` § 3.14). */
const ATTRIBUTES_MAX_ITEMS = 10;
const ATTRIBUTE_KEYS = ['name', 'value'] as const;
const ATTRIBUTE_NAME_PATTERN = /^(data-[a-z0-9-]{1,40}|aria-[a-z]{1,20}|title|role|lang)$/;
const ATTRIBUTE_VALUE_MAX_LENGTH = 200;

/** Forma fissa per `kind: 'shapeDivider'` (ADR-82 § "Decisione" punto 1). Unità/intervalli: scelta di design, un solo uso sensato (stesso principio di `radius`/`border`). */
const SHAPE_DIVIDER_VALUE_KEYS = [
  'style',
  'color',
  'width',
  'height',
  'flip',
  'invert',
  'aboveContent',
] as const;
const SHAPE_DIVIDER_WIDTH_UNITS: readonly LengthUnit[] = ['px', '%'];
const SHAPE_DIVIDER_WIDTH_RANGE: [number, number] = [0, 4000];
const SHAPE_DIVIDER_HEIGHT_UNITS: readonly LengthUnit[] = ['px'];
const SHAPE_DIVIDER_HEIGHT_RANGE: [number, number] = [0, 500];

/**
 * L'unico interprete che valida qualunque albero di blocchi contro il
 * registro (ADR-21 § 2, PLAN-F02 T2): nessuna classe `class-validator` per
 * tipo. Guidato interamente dai descrittori (`BlockDefinition`/`PropSpec`).
 *
 * **Ordine della pipeline (ADR-21 § 3, correzione T3)**: questo servizio
 * implementa lo stadio "validazione contro il registro" — invocato **dopo**
 * la forma dell'envelope e la migrazione, e **prima** della sanitizzazione
 * per `kind` (T3) e della persistenza. Questo stadio verifica `maxLength`
 * solo per `url`, perché la sanitizzazione non lo modifica: valore letto e
 * valore persistito coincidono. Per `richText` e `plainText` la pulizia
 * (`sanitize-html`, rimozione caratteri di controllo) può accorciare la
 * stringa, quindi il loro `maxLength` **non** si verifica qui: è
 * responsabilità di `BlockPropSanitizerService`
 * (`common/sanitizer/block-prop-sanitizer.service.ts`), dopo la pulizia, sul
 * valore che verrà effettivamente scritto.
 */
@Injectable()
export class BlockTreeValidatorService {
  /**
   * Valida un intero albero di blocchi radice. Ritorna un esito strutturato
   * (mai un'eccezione): un albero non conforme colleziona **tutti** i suoi
   * errori, con il path del nodo colpevole in ogni voce — mai il primo
   * errore soltanto, perché la persistenza è sempre integrale o nulla
   * (business-rules.md § Blocchi regola 4).
   *
   * @param blocks Nodi di radice, già passati dallo stadio forma envelope e
   *   dalla migrazione (T4). Questo servizio non li muta.
   * @param registry Registro dei tipi da usare (default: quello di
   *   produzione). Un parametro esplicito permette a T7 di iniettare un
   *   registro di test con un tipo a `v: 2`.
   * @param context Contesto opzionale (soglia di ruolo per `minRole`).
   */
  validateTree(
    blocks: ValidatableBlockNode[],
    registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY,
    context: BlockTreeValidationContext = {},
  ): BlockTreeValidationResult {
    const errors: BlockValidationError[] = [];
    blocks.forEach((node, index) => {
      this.validateNode(node, `blocks[${index}]`, null, registry, context, errors);
    });
    return { valid: errors.length === 0, errors };
  }

  /**
   * Valida un singolo nodo (tipo, annidamento, props) e ricorre sui figli.
   * Continua a scendere anche dopo un errore di annidamento, per collezionare
   * ogni nodo colpevole dell'albero in un solo esito — mai fermarsi al primo.
   */
  private validateNode(
    node: ValidatableBlockNode,
    path: string,
    parentType: string | null,
    registry: BlockRegistry,
    context: BlockTreeValidationContext,
    errors: BlockValidationError[],
  ): void {
    const definition = this.resolveDefinition(node.type, registry, context);
    if (!definition) {
      errors.push({
        code: 'BLOCK_TYPE_UNKNOWN',
        details: { path, type: node.type },
      });
      // Tipo sconosciuto: `children.allow` di questo nodo è indeterminabile,
      // non si scende oltre su questo ramo.
      return;
    }

    if (node.type === 'globalRef' && context.insideGlobalSection === true) {
      // Divieto di ciclo per contratto, non per rilevamento a grafo (ADR-55):
      // un `globalRef` non può mai comparire dentro l'albero di una Sezione
      // Globale, né verso se stessa né verso un'altra. Il tipo è noto e
      // valido altrove (in una Pagina) — qui si respinge il nodo invece di
      // validarlo normalmente; è comunque una foglia (`children.allow: []`),
      // nessun figlio da scendere.
      errors.push({
        code: 'BLOCK_TYPE_NOT_ALLOWED_IN_GLOBAL_SECTION',
        details: { path, type: node.type },
      });
      return;
    }

    const allowedHere =
      parentType === null
        ? registry.rootAllowed
        : (registry.definitions.get(parentType)?.children.allow ?? []);
    // Sentinel wildcard (ADR-39 § 4): '*' ammette qualunque tipo già risolto
    // con successo sopra (quindi filtrato per `enabled`/`minRole`) — nessun
    // controllo di appartenenza da fare, il tipo è già noto e ammesso.
    if (allowedHere !== '*' && !allowedHere.includes(node.type)) {
      errors.push({
        code: 'BLOCK_NESTING_NOT_ALLOWED',
        details: { path, type: node.type, parentType, allowed: [...allowedHere] },
      });
      // L'annidamento non è ammesso ma il tipo è noto: si continua comunque
      // a validare props e figli, per riportare tutti gli errori dell'albero.
    }

    this.validateProps(
      node,
      path,
      definition,
      errors,
      context.insideGlobalSection === true,
      context.fontAllowlist,
    );

    node.children.forEach((child, index) => {
      this.validateNode(child, `${path}.children[${index}]`, node.type, registry, context, errors);
    });
  }

  /** Risolve la definizione di un tipo, rispettando `enabled` e `minRole` (SPEC-F02-blocchi.md § 4: entrambi producono `BLOCK_TYPE_UNKNOWN`). */
  private resolveDefinition(
    type: string,
    registry: BlockRegistry,
    context: BlockTreeValidationContext,
  ): BlockDefinition | undefined {
    const definition = registry.definitions.get(type);
    if (!definition || !definition.enabled) {
      return undefined;
    }
    if (
      definition.minRole !== undefined &&
      context.roleLevel !== undefined &&
      context.roleLevel > definition.minRole
    ) {
      return undefined;
    }
    return definition;
  }

  /**
   * Valida `props`: ogni chiave presente deve essere dichiarata, ogni prop dichiarata obbligatoria deve essere presente e conforme.
   *
   * @param insideGlobalSection `true` quando questo nodo appartiene all'albero
   *   di una Sezione Globale (`context.insideGlobalSection`, ADR-55): unico
   *   consumatore ad oggi è `kind: 'position'` (SPEC-PROPKIND-V2-DETAILS.md §
   *   7 punto 4, `type: 'fixed'|'absolute'` vietato in questo contesto).
   */
  private validateProps(
    node: ValidatableBlockNode,
    path: string,
    definition: BlockDefinition,
    errors: BlockValidationError[],
    insideGlobalSection: boolean,
    fontAllowlist: FontAllowlist | undefined,
  ): void {
    const declaredNames = Object.keys(definition.props);

    for (const propName of Object.keys(node.props)) {
      if (!Object.prototype.hasOwnProperty.call(definition.props, propName)) {
        errors.push({
          code: 'BLOCK_PROP_NOT_DECLARED',
          details: {
            path: `${path}.props.${propName}`,
            type: node.type,
            prop: propName,
            declared: declaredNames,
          },
        });
      }
    }

    for (const [propName, spec] of Object.entries(definition.props)) {
      const propPath = `${path}.props.${propName}`;
      const present = Object.prototype.hasOwnProperty.call(node.props, propName);

      if (!present) {
        if (spec.required) {
          errors.push({
            code: 'BLOCK_PROP_INVALID',
            details: {
              path: propPath,
              type: node.type,
              prop: propName,
              kind: spec.kind,
              reason: 'required',
            },
          });
        }
        // Prop assente e non obbligatoria: il default dichiarato si applica
        // altrove nella pipeline (migrazione/persistenza), non qui.
        continue;
      }

      this.validatePropValue(
        node.props[propName],
        propName,
        propPath,
        node.type,
        spec,
        errors,
        insideGlobalSection,
        fontAllowlist,
      );
    }
  }

  /** Valida un singolo valore di prop già dichiarata e presente, secondo il suo `kind`. */
  private validatePropValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: PropSpec,
    errors: BlockValidationError[],
    insideGlobalSection: boolean,
    fontAllowlist: FontAllowlist | undefined,
  ): void {
    const invalid = (
      reason: BlockPropInvalidReason,
      extra?: { constraint?: number | string[] | [number, number]; actual?: number },
    ): void => {
      errors.push({
        code: 'BLOCK_PROP_INVALID',
        details: { path, type, prop: propName, kind: spec.kind, reason, ...extra },
      });
    };

    switch (spec.kind) {
      case 'plainText': {
        if (typeof value !== 'string') return invalid('type');
        if (spec.nonEmpty && value.trim().length === 0) return invalid('empty');
        // `maxLength` non si verifica qui: la rimozione dei caratteri di
        // controllo può accorciare la stringa. Responsabilità di
        // `BlockPropSanitizerService`, dopo la pulizia (ADR-21 § 3, correzione T3).
        return;
      }
      case 'richText': {
        if (typeof value !== 'string') return invalid('type');
        // `maxLength` non si verifica qui: `sanitize-html` può accorciare la
        // stringa. Responsabilità di `BlockPropSanitizerService`, dopo la
        // pulizia (ADR-21 § 3, correzione T3).
        return;
      }
      case 'number': {
        if (typeof value !== 'number' || Number.isNaN(value)) return invalid('type');
        // `min`/`max` opzionali (ADR-47 § "Decisione"): assenti, nessun
        // vincolo di range — comportamento invariato per ogni prop `number`
        // senza intervallo dichiarato. Dichiarati sempre insieme (unico uso
        // reale a oggi, `section.styleOverlayOpacity`, `0 ≤ x ≤ 1`).
        if (spec.min !== undefined && spec.max !== undefined) {
          if (value < spec.min || value > spec.max) {
            return invalid('range', { constraint: [spec.min, spec.max], actual: value });
          }
        }
        return;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') return invalid('type');
        return;
      }
      case 'enum': {
        if (spec.responsive) {
          this.validateResponsiveEnumValue(value, propName, path, type, spec, errors);
          return;
        }
        if (typeof value !== 'string') return invalid('type');
        if (!isEnumTokenAllowed(value, spec.values))
          return invalid('enum', { constraint: [...spec.values] });
        return;
      }
      case 'url': {
        if (typeof value !== 'string') return invalid('type');
        // `maxLength` si verifica qui, prima della sanitizzazione: `url` non
        // passa da `sanitize-html` (SPEC-F02 § 2.3.7), quindi il valore letto
        // è già quello persistito (ADR-21 § 3, correzione T3).
        if (spec.maxLength !== undefined) {
          const actual = codePointLength(value);
          if (actual > spec.maxLength)
            return invalid('maxLength', { constraint: spec.maxLength, actual });
        }
        if (!isAllowedUrl(value)) return invalid('urlScheme');
        return;
      }
      case 'mediaRef': {
        if (typeof value !== 'string') return invalid('type');
        if (!GUID_PATTERN.test(value)) return invalid('guidFormat');
        return;
      }
      case 'pageRef': {
        // Stessa validazione di forma di `mediaRef` (16 hex): nessuna
        // verifica di esistenza/pubblicazione della Pagina a scrittura, la
        // risoluzione è a valle nella pipeline SSR (ADR-52 § 3/§ 4).
        if (typeof value !== 'string') return invalid('type');
        if (!GUID_PATTERN.test(value)) return invalid('guidFormat');
        return;
      }
      case 'globalSectionRef': {
        // Stessa validazione di forma di `pageRef`/`mediaRef` (16 hex):
        // nessuna verifica di esistenza della Sezione Globale a scrittura, la
        // risoluzione è a valle nel job di export (ADR-55 § 1, stesso
        // principio di `pageRef`, ADR-52 § 4).
        if (typeof value !== 'string') return invalid('type');
        if (!GUID_PATTERN.test(value)) return invalid('guidFormat');
        return;
      }
      case 'color': {
        if (typeof value !== 'string') return invalid('type');
        if (!HEX_COLOR_PATTERN.test(value)) return invalid('format');
        return;
      }
      case 'cssClassName': {
        if (typeof value !== 'string') return invalid('type');
        if (!isValidCssClassName(value)) return invalid('format');
        return;
      }
      case 'htmlId': {
        if (typeof value !== 'string') return invalid('type');
        if (!CSS_IDENTIFIER_TOKEN_PATTERN.test(value)) return invalid('format');
        return;
      }
      case 'unitValue': {
        this.validateUnitValue(value, propName, path, type, spec, errors);
        return;
      }
      case 'border': {
        this.validateBorderProp(value, propName, path, type, spec, errors);
        return;
      }
      case 'shadow': {
        this.validateShadowProp(value, propName, path, type, spec, errors);
        return;
      }
      case 'colorRef': {
        this.validateColorRef(value, propName, path, type, spec, errors);
        return;
      }
      case 'fontRef': {
        this.validateFontRef(value, propName, path, type, spec, errors, fontAllowlist);
        return;
      }
      case 'typography': {
        this.validateTypography(value, propName, path, type, spec, errors, fontAllowlist);
        return;
      }
      case 'spacing': {
        this.validateSpacing(value, propName, path, type, spec, errors);
        return;
      }
      case 'radius': {
        this.validateRadius(value, propName, path, type, errors);
        return;
      }
      case 'gradient': {
        this.validateGradient(value, propName, path, type, errors);
        return;
      }
      case 'position': {
        this.validatePosition(value, propName, path, type, spec, errors, insideGlobalSection);
        return;
      }
      case 'transform': {
        this.validateTransform(value, propName, path, type, spec, errors);
        return;
      }
      case 'filter': {
        this.validateFilter(value, propName, path, type, spec, errors);
        return;
      }
      case 'layout': {
        this.validateLayout(value, propName, path, type, spec, errors);
        return;
      }
      case 'background': {
        this.validateBackground(value, propName, path, type, spec, errors);
        return;
      }
      case 'link': {
        this.validateLinkValue(value, propName, path, type, errors);
        return;
      }
      case 'animation': {
        this.validateAnimationValue(value, propName, path, type, errors);
        return;
      }
      case 'motion': {
        this.validateMotionValue(value, propName, path, type, errors);
        return;
      }
      case 'attributes': {
        this.validateAttributesValue(value, propName, path, type, errors);
        return;
      }
      case 'css': {
        this.validateCssValue(value, propName, path, type, spec, errors);
        return;
      }
      case 'hideOn': {
        this.validateHideOnValue(value, propName, path, type, errors);
        return;
      }
      case 'shapeDivider': {
        this.validateShapeDividerValue(value, propName, path, type, errors);
        return;
      }
      /* istanbul ignore next -- `PropKind` è un'unione chiusa: nessun altro caso possibile a compile time. */
      default: {
        // Exhaustiveness check: se un `kind` nuovo viene aggiunto a PropSpec
        // senza aggiornare questo switch, il progetto non compila più qui.
        const exhaustive: never = spec;
        return exhaustive;
      }
    }
  }

  /**
   * Valida il ramo per-breakpoint di un `EnumPropSpec` con `responsive: true`
   * (ADR-29 § 2/§ 4). Nessun `reason` nuovo: l'envelope malformato (valore non
   * oggetto, `default` mancante, chiave fuori dall'elenco chiuso) produce
   * `reason: 'type'` sul path della prop; un token fuori da `spec.values` su
   * una singola voce produce `reason: 'enum'` sul path **della voce**
   * (`…props.styleSpaceBefore.tablet`). La verifica del token è condivisa con
   * il ramo scalare tramite `isEnumTokenAllowed`.
   */
  private validateResponsiveEnumValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: EnumPropSpec,
    errors: BlockValidationError[],
  ): void {
    const isEnvelopeShapeValid =
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, 'default') &&
      Object.keys(value).every((key) =>
        RESPONSIVE_BREAKPOINTS.includes(key as ResponsiveBreakpointName),
      );

    if (!isEnvelopeShapeValid) {
      errors.push({
        code: 'BLOCK_PROP_INVALID',
        details: { path, type, prop: propName, kind: spec.kind, reason: 'type' },
      });
      return;
    }

    const envelope = value as Record<ResponsiveBreakpointName, unknown>;
    for (const breakpoint of RESPONSIVE_BREAKPOINTS) {
      if (!Object.prototype.hasOwnProperty.call(envelope, breakpoint)) continue;
      if (!isEnumTokenAllowed(envelope[breakpoint], spec.values)) {
        errors.push({
          code: 'BLOCK_PROP_INVALID',
          details: {
            path: `${path}.${breakpoint}`,
            type,
            prop: propName,
            kind: spec.kind,
            reason: 'enum',
            constraint: [...spec.values],
          },
        });
      }
    }
  }

  // ─── PropKind v2 — composizione ortogonale stateful/responsive (ADR-75) ──

  /**
   * Risolve e valida l'inviluppo `stateful`/`responsive` di un valore
   * (ADR-75 § "Decisione" punto 1/5): nell'ordine fisso **stato → breakpoint
   * → valore**, invocando `validateNakedValue` una volta per ogni
   * combinazione stato×breakpoint presente — mai una funzione riscritta per
   * ogni combinazione. Un inviluppo `stateful` malformato (non oggetto,
   * `normal` mancante, chiave fuori dai 4 stati chiusi) produce
   * `reason: 'type'` sul path della prop, come da ADR-75 § "Decisione" punto 5.
   */
  private validateStatefulResponsiveValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    kind: PropKind,
    modifiers: { stateful: boolean; responsive: boolean },
    errors: BlockValidationError[],
    validateNakedValue: (nakedValue: unknown, nakedPath: string) => void,
  ): void {
    if (modifiers.stateful) {
      if (
        !isPlainObject(value) ||
        !Object.prototype.hasOwnProperty.call(value, 'normal') ||
        !Object.keys(value).every((key) => STATEFUL_STATES.includes(key as StatefulStateName))
      ) {
        this.pushPropInvalid(errors, path, type, propName, kind, 'type');
        return;
      }
      const envelope = value as Record<StatefulStateName, unknown>;
      for (const state of STATEFUL_STATES) {
        if (!Object.prototype.hasOwnProperty.call(envelope, state)) continue;
        const branchPath = `${path}.${state}`;
        if (modifiers.responsive) {
          this.validateBreakpointEnvelope(
            envelope[state],
            branchPath,
            type,
            propName,
            kind,
            errors,
            validateNakedValue,
          );
        } else {
          validateNakedValue(envelope[state], branchPath);
        }
      }
      return;
    }
    if (modifiers.responsive) {
      this.validateBreakpointEnvelope(
        value,
        path,
        type,
        propName,
        kind,
        errors,
        validateNakedValue,
      );
      return;
    }
    validateNakedValue(value, path);
  }

  /**
   * Inviluppo responsive (ADR-29 § 2), generalizzato a un validatore di
   * valore nudo qualunque — stessa funzione riusata dal ramo `stateful` sopra
   * e da ogni `kind` v2 che dichiara `responsive` sull'intero oggetto (ADR-75
   * § "Decisione" punto 5).
   */
  private validateBreakpointEnvelope(
    value: unknown,
    path: string,
    type: string,
    propName: string,
    kind: PropKind,
    errors: BlockValidationError[],
    validateNakedValue: (nakedValue: unknown, nakedPath: string) => void,
  ): void {
    const isEnvelopeShapeValid =
      isPlainObject(value) &&
      Object.prototype.hasOwnProperty.call(value, 'default') &&
      Object.keys(value).every((key) =>
        RESPONSIVE_BREAKPOINTS.includes(key as ResponsiveBreakpointName),
      );

    if (!isEnvelopeShapeValid) {
      this.pushPropInvalid(errors, path, type, propName, kind, 'type');
      return;
    }

    const envelope = value as Record<ResponsiveBreakpointName, unknown>;
    for (const breakpoint of RESPONSIVE_BREAKPOINTS) {
      if (!Object.prototype.hasOwnProperty.call(envelope, breakpoint)) continue;
      validateNakedValue(envelope[breakpoint], `${path}.${breakpoint}`);
    }
  }

  /**
   * Valida un `UnitValue` annidato dentro un `kind` composito v2
   * (SPEC-PROPKIND-V2-DETAILS.md): stessa forma di `kind: 'unitValue'`
   * (ADR-38 § 2) ma con intervallo/unità dichiarati dalla chiamata, non dal
   * descrittore di prop di primo livello. `range: null` = nessun vincolo di
   * intervallo verificato (usato solo dove né `SPEC-propkind-v2.md` né
   * `SPEC-PROPKIND-V2-DETAILS.md` dichiarano un numero concreto, es.
   * `transform.translateX/translateY` — vedi nota nel resoconto finale).
   */
  private validateEmbeddedUnitValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    kind: PropKind,
    units: readonly string[],
    range: readonly [number, number] | null,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['value', 'unit'])) {
      this.pushPropInvalid(errors, path, type, propName, kind, 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    const numericValue = record.value;
    if (typeof numericValue !== 'number' || Number.isNaN(numericValue)) {
      this.pushPropInvalid(errors, `${path}.value`, type, propName, kind, 'type');
    } else if (range !== null && (numericValue < range[0] || numericValue > range[1])) {
      this.pushPropInvalid(errors, `${path}.value`, type, propName, kind, 'range', {
        constraint: [range[0], range[1]],
        actual: numericValue,
      });
    }
    const unit = record.unit;
    if (typeof unit !== 'string' || !units.includes(unit)) {
      this.pushPropInvalid(errors, `${path}.unit`, type, propName, kind, 'enum', {
        constraint: [...units],
      });
    }
  }

  /** Valida un campo scalare contro un elenco chiuso di stringhe — condiviso da ogni campo enum dei `kind` compositi v2. */
  private validateClosedEnumField(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    kind: PropKind,
    allowed: readonly string[],
    errors: BlockValidationError[],
  ): void {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      this.pushPropInvalid(errors, path, type, propName, kind, 'enum', {
        constraint: [...allowed],
      });
    }
  }

  /** Valida un campo numerico opzionale contro un intervallo fisso — condiviso da `transform`/`filter`. */
  private validateOptionalRangedNumber(
    record: Record<string, unknown>,
    field: string,
    path: string,
    propName: string,
    type: string,
    kind: PropKind,
    range: readonly [number, number],
    errors: BlockValidationError[],
  ): void {
    if (!Object.prototype.hasOwnProperty.call(record, field)) return;
    const fieldValue = record[field];
    const fieldPath = `${path}.${field}`;
    if (typeof fieldValue !== 'number' || Number.isNaN(fieldValue)) {
      this.pushPropInvalid(errors, fieldPath, type, propName, kind, 'type');
      return;
    }
    if (fieldValue < range[0] || fieldValue > range[1]) {
      this.pushPropInvalid(errors, fieldPath, type, propName, kind, 'range', {
        constraint: [range[0], range[1]],
        actual: fieldValue,
      });
    }
  }

  // ─── `colorRef` (SPEC-PROPKIND-V2-DETAILS.md § 1) ────────────────────────

  private validateColorRef(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: ColorRefPropSpec,
    errors: BlockValidationError[],
  ): void {
    const validateNakedValue = (naked: unknown, nakedPath: string): void => {
      this.validateColorRefNakedValue(
        naked,
        propName,
        nakedPath,
        type,
        'colorRef',
        spec.allowAlpha === true,
        errors,
      );
    };
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'colorRef',
      { stateful: spec.stateful === true, responsive: spec.responsive === true },
      errors,
      validateNakedValue,
    );
  }

  /**
   * Valida il "valore nudo" di `colorRef` (SPEC-PROPKIND-V2-DETAILS.md § 1
   * punti 1-3): stringa hex o `{ ref }`. Riusata anche da `gradient` (stop di
   * colore, `allowAlpha` sempre `false`) e con `kind` parametrizzato perché
   * l'errore deve riportare il `kind` della prop che ospita il valore, non
   * sempre `'colorRef'`.
   */
  private validateColorRefNakedValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    kind: PropKind,
    allowAlpha: boolean,
    errors: BlockValidationError[],
  ): void {
    if (typeof value === 'string' && isValidColorRefHexString(value, allowAlpha)) {
      return;
    }
    if (isPlainObject(value) && hasOnlyKeys(value, ['ref']) && isValidGlobalTokenRef(value.ref)) {
      return;
    }
    // Un valore che non è né stringa-pattern né oggetto-`ref` produce sempre
    // `reason: 'format'` (SPEC-PROPKIND-V2-DETAILS.md § 1 punto 3), anche se
    // il tipo JS è del tutto estraneo (numero, array, …).
    this.pushPropInvalid(errors, path, type, propName, kind, 'format');
  }

  // ─── `fontRef` (SPEC-PROPKIND-V2-DETAILS.md § 2) ─────────────────────────

  private validateFontRef(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: FontRefPropSpec,
    errors: BlockValidationError[],
    fontAllowlist: FontAllowlist | undefined,
  ): void {
    const validateNakedValue = (naked: unknown, nakedPath: string): void => {
      this.validateFontRefNakedValue(
        naked,
        propName,
        nakedPath,
        type,
        'fontRef',
        errors,
        fontAllowlist,
      );
    };
    // `fontRef` non dichiara mai `stateful` (ADR-75 § "Decisione" punto 6): un
    // eventuale flag impostato per errore nel registro è ignorato qui, solo
    // `responsive` (raro, dichiarato dal blocco ospite) è onorato.
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'fontRef',
      { stateful: false, responsive: spec.responsive === true },
      errors,
      validateNakedValue,
    );
  }

  /**
   * Valida il "valore nudo" di `fontRef` (SPEC-PROPKIND-V2-DETAILS.md § 2):
   * `{ ref }` oppure `{ family, source }`. Riusata anche dal campo
   * `typography.fontFamily` con `kind: 'typography'`.
   */
  private validateFontRefNakedValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    kind: PropKind,
    errors: BlockValidationError[],
    fontAllowlist: FontAllowlist | undefined,
  ): void {
    if (isPlainObject(value) && hasOnlyKeys(value, ['ref'])) {
      if (isValidGlobalTokenRef(value.ref)) return;
      this.pushPropInvalid(errors, path, type, propName, kind, 'format');
      return;
    }
    if (isPlainObject(value) && hasOnlyKeys(value, ['family', 'source'])) {
      const { family, source } = value;
      if (typeof source !== 'string' || !FONT_FAMILY_SOURCES.includes(source as FontFamilySource)) {
        this.pushPropInvalid(errors, `${path}.source`, type, propName, kind, 'enum', {
          constraint: [...FONT_FAMILY_SOURCES],
        });
        return;
      }
      if (typeof family !== 'string') {
        this.pushPropInvalid(errors, `${path}.family`, type, propName, kind, 'type');
        return;
      }
      if (source === 'system' && !SYSTEM_FONT_FAMILIES.includes(family as SystemFontFamily)) {
        this.pushPropInvalid(errors, `${path}.family`, type, propName, kind, 'enum', {
          constraint: [...SYSTEM_FONT_FAMILIES],
        });
        return;
      }
      // 'google'/'custom': verifica contro l'allowlist sincronizzata
      // (`fonts.google_allowlist`/`customFonts[]`, SPEC-PROPKIND-V2-DETAILS.md
      // § 2 punti 3-4), implementata in S1.3 come controllo **opzionale**
      // (`fontAllowlist` assente = nessuna restrizione, comportamento
      // storico di S1.1 invariato — vedi `FontAllowlist` in
      // `BlockTreeValidationContext` per la scelta di design completa: nessun
      // call site di produzione di `validateTree` passa oggi questo campo).
      if (fontAllowlist) {
        const list = source === 'google' ? fontAllowlist.google : fontAllowlist.custom;
        if (!list.includes(family)) {
          this.pushPropInvalid(errors, `${path}.family`, type, propName, kind, 'enum', {
            constraint: [...list],
          });
        }
      }
      return;
    }
    this.pushPropInvalid(errors, path, type, propName, kind, 'format');
  }

  // ─── `typography` (SPEC-PROPKIND-V2-DETAILS.md § 3) ──────────────────────

  private validateTypography(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: TypographyPropSpec,
    errors: BlockValidationError[],
    fontAllowlist: FontAllowlist | undefined,
  ): void {
    const validateNakedObject = (naked: unknown, nakedPath: string): void => {
      this.validateTypographyValue(naked, propName, nakedPath, type, spec, errors, fontAllowlist);
    };
    // Il breakpoint di `typography` vive **dentro** ogni campo (punto 3), mai
    // sull'intero oggetto: qui si attraversa solo l'asse `stateful`.
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'typography',
      { stateful: spec.stateful === true, responsive: false },
      errors,
      validateNakedObject,
    );
  }

  private validateTypographyValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: TypographyPropSpec,
    errors: BlockValidationError[],
    fontAllowlist: FontAllowlist | undefined,
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, TYPOGRAPHY_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'typography', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    for (const field of TYPOGRAPHY_VALUE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
      const fieldPath = `${path}.${field}`;
      const fieldValue = record[field];
      const validateNakedField = (naked: unknown, nakedPath: string): void => {
        this.validateTypographyFieldNakedValue(
          field,
          naked,
          propName,
          nakedPath,
          type,
          errors,
          fontAllowlist,
        );
      };
      if (spec.responsive) {
        this.validateBreakpointEnvelope(
          fieldValue,
          fieldPath,
          type,
          propName,
          'typography',
          errors,
          validateNakedField,
        );
      } else {
        validateNakedField(fieldValue, fieldPath);
      }
    }
  }

  private validateTypographyFieldNakedValue(
    field: TypographyFieldName,
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
    fontAllowlist: FontAllowlist | undefined,
  ): void {
    switch (field) {
      case 'fontFamily': {
        this.validateFontRefNakedValue(
          value,
          propName,
          path,
          type,
          'typography',
          errors,
          fontAllowlist,
        );
        return;
      }
      case 'fontSize': {
        this.validateEmbeddedUnitValue(
          value,
          propName,
          path,
          type,
          'typography',
          TYPOGRAPHY_FONT_SIZE_UNITS,
          TYPOGRAPHY_FONT_SIZE_RANGE,
          errors,
        );
        return;
      }
      case 'fontWeight': {
        this.validateClosedEnumField(
          value,
          propName,
          path,
          type,
          'typography',
          FONT_WEIGHT_VALUES,
          errors,
        );
        return;
      }
      case 'textTransform': {
        this.validateClosedEnumField(
          value,
          propName,
          path,
          type,
          'typography',
          TEXT_TRANSFORM_VALUES,
          errors,
        );
        return;
      }
      case 'fontStyle': {
        this.validateClosedEnumField(
          value,
          propName,
          path,
          type,
          'typography',
          FONT_STYLE_VALUES,
          errors,
        );
        return;
      }
      case 'textDecoration': {
        this.validateClosedEnumField(
          value,
          propName,
          path,
          type,
          'typography',
          TEXT_DECORATION_VALUES,
          errors,
        );
        return;
      }
      case 'lineHeight': {
        this.validateTypographyLineHeight(value, propName, path, type, errors);
        return;
      }
      case 'letterSpacing': {
        this.validateEmbeddedUnitValue(
          value,
          propName,
          path,
          type,
          'typography',
          TYPOGRAPHY_LETTER_SPACING_UNITS,
          TYPOGRAPHY_LETTER_SPACING_RANGE,
          errors,
        );
        return;
      }
      case 'wordSpacing': {
        this.validateEmbeddedUnitValue(
          value,
          propName,
          path,
          type,
          'typography',
          TYPOGRAPHY_WORD_SPACING_UNITS,
          TYPOGRAPHY_WORD_SPACING_RANGE,
          errors,
        );
        return;
      }
      /* istanbul ignore next -- `TypographyFieldName` è un'unione chiusa a 9 nomi. */
      default: {
        const exhaustive: never = field;
        return exhaustive;
      }
    }
  }

  /** `lineHeight` ha un intervallo diverso per unità (`em` 0–10, `px` 0–200): non riusa `validateEmbeddedUnitValue`. */
  private validateTypographyLineHeight(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['value', 'unit'])) {
      this.pushPropInvalid(errors, path, type, propName, 'typography', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    const numericValue = record.value;
    const unit = record.unit;
    const isNumericValueValid = typeof numericValue === 'number' && !Number.isNaN(numericValue);
    if (!isNumericValueValid) {
      this.pushPropInvalid(errors, `${path}.value`, type, propName, 'typography', 'type');
    }
    if (
      typeof unit !== 'string' ||
      !TYPOGRAPHY_LINE_HEIGHT_UNITS.includes(unit as (typeof TYPOGRAPHY_LINE_HEIGHT_UNITS)[number])
    ) {
      this.pushPropInvalid(errors, `${path}.unit`, type, propName, 'typography', 'enum', {
        constraint: [...TYPOGRAPHY_LINE_HEIGHT_UNITS],
      });
      return;
    }
    if (isNumericValueValid) {
      const range =
        unit === 'em' ? TYPOGRAPHY_LINE_HEIGHT_EM_RANGE : TYPOGRAPHY_LINE_HEIGHT_PX_RANGE;
      const numeric = numericValue as number;
      if (numeric < range[0] || numeric > range[1]) {
        this.pushPropInvalid(errors, `${path}.value`, type, propName, 'typography', 'range', {
          constraint: range,
          actual: numeric,
        });
      }
    }
  }

  // ─── `spacing` (SPEC-PROPKIND-V2-DETAILS.md § 4) ─────────────────────────

  private validateSpacing(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: SpacingPropSpec,
    errors: BlockValidationError[],
  ): void {
    const validateNakedValue = (naked: unknown, nakedPath: string): void => {
      this.validateSpacingValue(naked, propName, nakedPath, type, spec, errors);
    };
    // `spacing` non è mai `stateful` (ADR-75 § "Decisione" punto 6).
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'spacing',
      { stateful: false, responsive: spec.responsive === true },
      errors,
      validateNakedValue,
    );
  }

  private validateSpacingValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: SpacingPropSpec,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, SPACING_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'spacing', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    const unit = record.unit;
    if (typeof unit !== 'string' || !spec.units.includes(unit as LengthUnit)) {
      this.pushPropInvalid(errors, `${path}.unit`, type, propName, 'spacing', 'enum', {
        constraint: [...spec.units],
      });
    }
    for (const side of SPACING_SIDE_KEYS) {
      const sideValue = record[side];
      if (typeof sideValue !== 'number' || Number.isNaN(sideValue)) {
        this.pushPropInvalid(errors, `${path}.${side}`, type, propName, 'spacing', 'type');
      } else if (sideValue < spec.min || sideValue > spec.max) {
        this.pushPropInvalid(errors, `${path}.${side}`, type, propName, 'spacing', 'range', {
          constraint: [spec.min, spec.max],
          actual: sideValue,
        });
      }
    }
    if (typeof record.linked !== 'boolean') {
      // `linked` è presentazione, non validazione (SPEC-PROPKIND-V2-DETAILS.md
      // § 4 punto 2): si verifica solo che sia un booleano, mai la coerenza
      // con i valori dei lati.
      this.pushPropInvalid(errors, `${path}.linked`, type, propName, 'spacing', 'type');
    }
  }

  // ─── `radius` (SPEC-PROPKIND-V2-DETAILS.md § 5) — mai stateful/responsive ─

  private validateRadius(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, RADIUS_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'radius', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    for (const corner of RADIUS_CORNER_KEYS) {
      const cornerValue = record[corner];
      if (typeof cornerValue !== 'number' || Number.isNaN(cornerValue)) {
        this.pushPropInvalid(errors, `${path}.${corner}`, type, propName, 'radius', 'type');
      } else if (cornerValue < RADIUS_RANGE[0] || cornerValue > RADIUS_RANGE[1]) {
        this.pushPropInvalid(errors, `${path}.${corner}`, type, propName, 'radius', 'range', {
          constraint: RADIUS_RANGE,
          actual: cornerValue,
        });
      }
    }
    const unit = record.unit;
    if (typeof unit !== 'string' || !RADIUS_UNITS.includes(unit as (typeof RADIUS_UNITS)[number])) {
      this.pushPropInvalid(errors, `${path}.unit`, type, propName, 'radius', 'enum', {
        constraint: [...RADIUS_UNITS],
      });
    }
    if (typeof record.linked !== 'boolean') {
      this.pushPropInvalid(errors, `${path}.linked`, type, propName, 'radius', 'type');
    }
  }

  // ─── `gradient` (SPEC-PROPKIND-V2-DETAILS.md § 6) — mai stateful/responsive ─

  private validateGradient(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, GRADIENT_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'gradient', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    const gradientType = record.type;
    if (
      typeof gradientType !== 'string' ||
      !GRADIENT_TYPES.includes(gradientType as (typeof GRADIENT_TYPES)[number])
    ) {
      this.pushPropInvalid(errors, `${path}.type`, type, propName, 'gradient', 'enum', {
        constraint: [...GRADIENT_TYPES],
      });
    }

    if (Object.prototype.hasOwnProperty.call(record, 'angle')) {
      const angle = record.angle;
      if (typeof angle !== 'number' || Number.isNaN(angle)) {
        this.pushPropInvalid(errors, `${path}.angle`, type, propName, 'gradient', 'type');
      } else if (angle < GRADIENT_ANGLE_RANGE[0] || angle > GRADIENT_ANGLE_RANGE[1]) {
        this.pushPropInvalid(errors, `${path}.angle`, type, propName, 'gradient', 'range', {
          constraint: GRADIENT_ANGLE_RANGE,
          actual: angle,
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(record, 'position')) {
      const position = record.position;
      if (
        typeof position !== 'string' ||
        !BG_POSITION_VALUES.includes(position as (typeof BG_POSITION_VALUES)[number])
      ) {
        this.pushPropInvalid(errors, `${path}.position`, type, propName, 'gradient', 'enum', {
          constraint: [...BG_POSITION_VALUES],
        });
      }
      // Ammesso anche con `type: 'linear'`: nessuna logica cross-campo nel
      // validatore (SPEC-PROPKIND-V2-DETAILS.md § 6 punto 3).
    }

    const stops = record.stops;
    if (!Array.isArray(stops)) {
      this.pushPropInvalid(errors, `${path}.stops`, type, propName, 'gradient', 'type');
      return;
    }
    if (stops.length < GRADIENT_STOPS_RANGE[0] || stops.length > GRADIENT_STOPS_RANGE[1]) {
      this.pushPropInvalid(errors, `${path}.stops`, type, propName, 'gradient', 'range', {
        constraint: GRADIENT_STOPS_RANGE,
        actual: stops.length,
      });
    }
    stops.forEach((stop: unknown, index: number) => {
      const stopPath = `${path}.stops[${index}]`;
      if (!isPlainObject(stop) || !hasOnlyKeys(stop, GRADIENT_STOP_KEYS)) {
        this.pushPropInvalid(errors, stopPath, type, propName, 'gradient', 'type');
        return;
      }
      const stopRecord = stop as Record<string, unknown>;
      // Nessun `allowAlpha` implicito nei color stop di un gradiente
      // (SPEC-PROPKIND-V2-DETAILS.md § 6 punto 1).
      this.validateColorRefNakedValue(
        stopRecord.color,
        propName,
        `${stopPath}.color`,
        type,
        'gradient',
        false,
        errors,
      );
      const at = stopRecord.at;
      if (typeof at !== 'number' || Number.isNaN(at)) {
        this.pushPropInvalid(errors, `${stopPath}.at`, type, propName, 'gradient', 'type');
      } else if (at < GRADIENT_STOP_AT_RANGE[0] || at > GRADIENT_STOP_AT_RANGE[1]) {
        this.pushPropInvalid(errors, `${stopPath}.at`, type, propName, 'gradient', 'range', {
          constraint: GRADIENT_STOP_AT_RANGE,
          actual: at,
        });
      }
    });
  }

  // ─── `position` (SPEC-PROPKIND-V2-DETAILS.md § 7) ────────────────────────

  private validatePosition(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: PositionPropSpec,
    errors: BlockValidationError[],
    insideGlobalSection: boolean,
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, POSITION_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'position', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    const positionType = record.type;
    const isValidPositionType =
      typeof positionType === 'string' &&
      POSITION_TYPES.includes(positionType as (typeof POSITION_TYPES)[number]);
    if (!isValidPositionType) {
      this.pushPropInvalid(errors, `${path}.type`, type, propName, 'position', 'enum', {
        constraint: [...POSITION_TYPES],
      });
    } else if (
      insideGlobalSection &&
      POSITION_RESTRICTED_TYPES_IN_GLOBAL_SECTION.includes(positionType as string)
    ) {
      // Vincolo del validatore, non del `kind` (SPEC-PROPKIND-V2-DETAILS.md §
      // 7 punto 4): `fixed`/`absolute` non ammessi dentro l'albero di una
      // Sezione Globale — stesso meccanismo di `insideGlobalSection` già
      // usato per il divieto di ciclo di ADR-55.
      this.pushPropInvalid(errors, `${path}.type`, type, propName, 'position', 'enum', {
        constraint: POSITION_TYPES.filter(
          (candidate) => !POSITION_RESTRICTED_TYPES_IN_GLOBAL_SECTION.includes(candidate),
        ),
      });
    }

    if (Object.prototype.hasOwnProperty.call(record, 'offset')) {
      const offsetPath = `${path}.offset`;
      const validateNakedOffset = (naked: unknown, nakedPath: string): void => {
        this.validatePositionOffsetValue(naked, propName, nakedPath, type, errors);
      };
      if (spec.responsive) {
        this.validateBreakpointEnvelope(
          record.offset,
          offsetPath,
          type,
          propName,
          'position',
          errors,
          validateNakedOffset,
        );
      } else {
        validateNakedOffset(record.offset, offsetPath);
      }
    }

    if (Object.prototype.hasOwnProperty.call(record, 'zIndex')) {
      this.validateOptionalRangedNumber(
        record,
        'zIndex',
        path,
        propName,
        type,
        'position',
        POSITION_ZINDEX_RANGE,
        errors,
      );
    }

    if (Object.prototype.hasOwnProperty.call(record, 'sticky')) {
      this.validatePositionSticky(record.sticky, propName, `${path}.sticky`, type, errors);
    }
  }

  private validatePositionOffsetValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, POSITION_OFFSET_SIDE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'position', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    for (const side of POSITION_OFFSET_SIDE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(record, side)) continue;
      this.validateEmbeddedUnitValue(
        record[side],
        propName,
        `${path}.${side}`,
        type,
        'position',
        POSITION_OFFSET_UNITS,
        POSITION_OFFSET_RANGE,
        errors,
      );
    }
  }

  private validatePositionSticky(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, POSITION_STICKY_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'position', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    const edge = record.edge;
    if (
      typeof edge !== 'string' ||
      !POSITION_STICKY_EDGES.includes(edge as (typeof POSITION_STICKY_EDGES)[number])
    ) {
      this.pushPropInvalid(errors, `${path}.edge`, type, propName, 'position', 'enum', {
        constraint: [...POSITION_STICKY_EDGES],
      });
    }

    this.validateEmbeddedUnitValue(
      record.offset,
      propName,
      `${path}.offset`,
      type,
      'position',
      POSITION_OFFSET_UNITS,
      POSITION_OFFSET_RANGE,
      errors,
    );

    const onBreakpoints = record.onBreakpoints;
    if (!Array.isArray(onBreakpoints)) {
      this.pushPropInvalid(errors, `${path}.onBreakpoints`, type, propName, 'position', 'type');
    } else {
      // NOTA scope S1.1: verificato contro l'elenco chiuso attuale di
      // `RESPONSIVE_BREAKPOINTS` (3 nomi) — l'ampliamento a 7 chiavi
      // configurabili per sito (ADR-76, `resolveActiveBreakpoints()`) è un
      // sub-task distinto, vedi nota di scope nel resoconto finale.
      onBreakpoints.forEach((breakpoint: unknown, index: number) => {
        if (
          typeof breakpoint !== 'string' ||
          !RESPONSIVE_BREAKPOINTS.includes(breakpoint as ResponsiveBreakpointName)
        ) {
          this.pushPropInvalid(
            errors,
            `${path}.onBreakpoints[${index}]`,
            type,
            propName,
            'position',
            'enum',
            {
              constraint: [...RESPONSIVE_BREAKPOINTS],
            },
          );
        }
      });
    }

    if (typeof record.stayInParent !== 'boolean') {
      this.pushPropInvalid(errors, `${path}.stayInParent`, type, propName, 'position', 'type');
    }
  }

  // ─── `transform` (SPEC-PROPKIND-V2-DETAILS.md § 8) ───────────────────────

  private validateTransform(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: TransformPropSpec,
    errors: BlockValidationError[],
  ): void {
    const validateNakedValue = (naked: unknown, nakedPath: string): void => {
      this.validateTransformValue(naked, propName, nakedPath, type, errors);
    };
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'transform',
      { stateful: spec.stateful === true, responsive: spec.responsive === true },
      errors,
      validateNakedValue,
    );
  }

  private validateTransformValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, TRANSFORM_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'transform', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    this.validateOptionalRangedNumber(
      record,
      'rotate',
      path,
      propName,
      type,
      'transform',
      TRANSFORM_ROTATE_RANGE,
      errors,
    );
    this.validateOptionalRangedNumber(
      record,
      'scale',
      path,
      propName,
      type,
      'transform',
      TRANSFORM_SCALE_RANGE,
      errors,
    );
    this.validateOptionalRangedNumber(
      record,
      'skewX',
      path,
      propName,
      type,
      'transform',
      TRANSFORM_SKEW_RANGE,
      errors,
    );
    this.validateOptionalRangedNumber(
      record,
      'skewY',
      path,
      propName,
      type,
      'transform',
      TRANSFORM_SKEW_RANGE,
      errors,
    );

    if (Object.prototype.hasOwnProperty.call(record, 'translateX')) {
      // Nessun intervallo numerico dichiarato per `translateX`/`translateY` né
      // in `SPEC-propkind-v2.md` § 3.9 né in `SPEC-PROPKIND-V2-DETAILS.md` § 8
      // (solo `unit: px|%`): `range: null` per non inventare un vincolo
      // assente dai documenti — vedi nota di scope nel resoconto finale.
      this.validateEmbeddedUnitValue(
        record.translateX,
        propName,
        `${path}.translateX`,
        type,
        'transform',
        TRANSFORM_TRANSLATE_UNITS,
        null,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'translateY')) {
      this.validateEmbeddedUnitValue(
        record.translateY,
        propName,
        `${path}.translateY`,
        type,
        'transform',
        TRANSFORM_TRANSLATE_UNITS,
        null,
        errors,
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(record, 'flipH') &&
      typeof record.flipH !== 'boolean'
    ) {
      this.pushPropInvalid(errors, `${path}.flipH`, type, propName, 'transform', 'type');
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'flipV') &&
      typeof record.flipV !== 'boolean'
    ) {
      this.pushPropInvalid(errors, `${path}.flipV`, type, propName, 'transform', 'type');
    }

    if (Object.prototype.hasOwnProperty.call(record, 'origin')) {
      const origin = record.origin;
      if (
        typeof origin !== 'string' ||
        !TRANSFORM_ORIGIN_VALUES.includes(origin as (typeof TRANSFORM_ORIGIN_VALUES)[number])
      ) {
        this.pushPropInvalid(errors, `${path}.origin`, type, propName, 'transform', 'enum', {
          constraint: [...TRANSFORM_ORIGIN_VALUES],
        });
      }
    }
  }

  // ─── `filter` (SPEC-PROPKIND-V2-DETAILS.md § 9) ──────────────────────────

  private validateFilter(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: FilterPropSpec,
    errors: BlockValidationError[],
  ): void {
    const validateNakedValue = (naked: unknown, nakedPath: string): void => {
      this.validateFilterValue(naked, propName, nakedPath, type, errors);
    };
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'filter',
      { stateful: spec.stateful === true, responsive: spec.responsive === true },
      errors,
      validateNakedValue,
    );
  }

  private validateFilterValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, FILTER_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'filter', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    this.validateOptionalRangedNumber(
      record,
      'blur',
      path,
      propName,
      type,
      'filter',
      FILTER_BLUR_RANGE,
      errors,
    );
    this.validateOptionalRangedNumber(
      record,
      'brightness',
      path,
      propName,
      type,
      'filter',
      FILTER_BRIGHTNESS_RANGE,
      errors,
    );
    this.validateOptionalRangedNumber(
      record,
      'contrast',
      path,
      propName,
      type,
      'filter',
      FILTER_CONTRAST_RANGE,
      errors,
    );
    this.validateOptionalRangedNumber(
      record,
      'saturate',
      path,
      propName,
      type,
      'filter',
      FILTER_SATURATE_RANGE,
      errors,
    );
    this.validateOptionalRangedNumber(
      record,
      'hue',
      path,
      propName,
      type,
      'filter',
      FILTER_HUE_RANGE,
      errors,
    );
    this.validateOptionalRangedNumber(
      record,
      'grayscale',
      path,
      propName,
      type,
      'filter',
      FILTER_GRAYSCALE_RANGE,
      errors,
    );

    if (Object.prototype.hasOwnProperty.call(record, 'blend')) {
      const blend = record.blend;
      if (
        typeof blend !== 'string' ||
        !FILTER_BLEND_MODES.includes(blend as (typeof FILTER_BLEND_MODES)[number])
      ) {
        this.pushPropInvalid(errors, `${path}.blend`, type, propName, 'filter', 'enum', {
          constraint: [...FILTER_BLEND_MODES],
        });
      }
    }
  }

  // ─── `layout` (ADR-82 § "Decisione" punto 1) ──────────────────────────────

  private validateLayout(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: LayoutPropSpec,
    errors: BlockValidationError[],
  ): void {
    const validateNakedValue = (naked: unknown, nakedPath: string): void => {
      this.validateLayoutValue(naked, propName, nakedPath, type, errors);
    };
    // `layout` non è mai `stateful` (ADR-82 § "Decisione" punto 1): l'intero
    // oggetto è responsive, mai i singoli campi.
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'layout',
      { stateful: false, responsive: spec.responsive === true },
      errors,
      validateNakedValue,
    );
  }

  private validateLayoutValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, LAYOUT_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'layout', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(record, 'display')) {
      this.validateClosedEnumField(
        record.display,
        propName,
        `${path}.display`,
        type,
        'layout',
        LAYOUT_DISPLAY_VALUES,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'direction')) {
      this.validateClosedEnumField(
        record.direction,
        propName,
        `${path}.direction`,
        type,
        'layout',
        LAYOUT_DIRECTION_VALUES,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'wrap')) {
      this.validateClosedEnumField(
        record.wrap,
        propName,
        `${path}.wrap`,
        type,
        'layout',
        LAYOUT_WRAP_VALUES,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'justify')) {
      this.validateClosedEnumField(
        record.justify,
        propName,
        `${path}.justify`,
        type,
        'layout',
        LAYOUT_JUSTIFY_VALUES,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'align')) {
      this.validateClosedEnumField(
        record.align,
        propName,
        `${path}.align`,
        type,
        'layout',
        LAYOUT_ALIGN_VALUES,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'autoFlow')) {
      this.validateClosedEnumField(
        record.autoFlow,
        propName,
        `${path}.autoFlow`,
        type,
        'layout',
        LAYOUT_AUTO_FLOW_VALUES,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'justifyItems')) {
      this.validateClosedEnumField(
        record.justifyItems,
        propName,
        `${path}.justifyItems`,
        type,
        'layout',
        LAYOUT_GRID_ALIGN_VALUES,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'alignItems')) {
      this.validateClosedEnumField(
        record.alignItems,
        propName,
        `${path}.alignItems`,
        type,
        'layout',
        LAYOUT_GRID_ALIGN_VALUES,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'gap')) {
      this.validateLayoutGap(record.gap, propName, `${path}.gap`, type, errors);
    }
    if (Object.prototype.hasOwnProperty.call(record, 'gridTemplateColumns')) {
      this.validateGridTemplateValue(
        record.gridTemplateColumns,
        propName,
        `${path}.gridTemplateColumns`,
        type,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'gridTemplateRows')) {
      this.validateGridTemplateValue(
        record.gridTemplateRows,
        propName,
        `${path}.gridTemplateRows`,
        type,
        errors,
      );
    }
  }

  private validateLayoutGap(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['x', 'y'])) {
      this.pushPropInvalid(errors, path, type, propName, 'layout', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    this.validateEmbeddedUnitValue(
      record.x,
      propName,
      `${path}.x`,
      type,
      'layout',
      LAYOUT_GAP_UNITS,
      LAYOUT_GAP_RANGE,
      errors,
    );
    this.validateEmbeddedUnitValue(
      record.y,
      propName,
      `${path}.y`,
      type,
      'layout',
      LAYOUT_GAP_UNITS,
      LAYOUT_GAP_RANGE,
      errors,
    );
  }

  /**
   * Valida `GridTemplateValue` (ADR-82 § "Decisione" punto 1, terzo bullet):
   * `{preset:'repeat', count}` oppure array di 1–12 `GridTrackValue`. Nessuna
   * forma stringa libera non è mai valida (`reason: 'type'`, ADR-82 §
   * "Alternative valutate", ultima riga).
   */
  private validateGridTemplateValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (isPlainObject(value)) {
      if (!hasOnlyKeys(value, ['preset', 'count'])) {
        this.pushPropInvalid(errors, path, type, propName, 'layout', 'type');
        return;
      }
      const record = value as Record<string, unknown>;
      if (record.preset !== 'repeat') {
        this.pushPropInvalid(errors, `${path}.preset`, type, propName, 'layout', 'enum', {
          constraint: ['repeat'],
        });
      }
      const count = record.count;
      if (typeof count !== 'number' || Number.isNaN(count)) {
        this.pushPropInvalid(errors, `${path}.count`, type, propName, 'layout', 'type');
      } else if (count < GRID_TRACK_COUNT_RANGE[0] || count > GRID_TRACK_COUNT_RANGE[1]) {
        this.pushPropInvalid(errors, `${path}.count`, type, propName, 'layout', 'range', {
          constraint: GRID_TRACK_COUNT_RANGE,
          actual: count,
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      if (
        value.length < GRID_TRACK_ARRAY_LENGTH_RANGE[0] ||
        value.length > GRID_TRACK_ARRAY_LENGTH_RANGE[1]
      ) {
        this.pushPropInvalid(errors, path, type, propName, 'layout', 'range', {
          constraint: GRID_TRACK_ARRAY_LENGTH_RANGE,
          actual: value.length,
        });
      }
      value.forEach((track: unknown, index: number) => {
        this.validateGridTrackValue(track, propName, `${path}[${index}]`, type, errors);
      });
      return;
    }
    // Nessuna forma stringa libera (es. `"1fr 1fr"`) è mai valida.
    this.pushPropInvalid(errors, path, type, propName, 'layout', 'type');
  }

  private validateGridTrackValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (value === 'auto') return;
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['value', 'unit'])) {
      this.pushPropInvalid(errors, path, type, propName, 'layout', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    const numericValue = record.value;
    if (typeof numericValue !== 'number' || Number.isNaN(numericValue)) {
      this.pushPropInvalid(errors, `${path}.value`, type, propName, 'layout', 'type');
    } else if (
      numericValue < GRID_TRACK_VALUE_RANGE[0] ||
      numericValue > GRID_TRACK_VALUE_RANGE[1]
    ) {
      this.pushPropInvalid(errors, `${path}.value`, type, propName, 'layout', 'range', {
        constraint: GRID_TRACK_VALUE_RANGE,
        actual: numericValue,
      });
    }
    const unit = record.unit;
    if (
      typeof unit !== 'string' ||
      !GRID_TRACK_UNITS.includes(unit as (typeof GRID_TRACK_UNITS)[number])
    ) {
      this.pushPropInvalid(errors, `${path}.unit`, type, propName, 'layout', 'enum', {
        constraint: [...GRID_TRACK_UNITS],
      });
    }
  }

  // ─── `background` (`docs/SPEC-propkind-v2.md` § 3.7) ──────────────────────

  private validateBackground(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: BackgroundPropSpec,
    errors: BlockValidationError[],
  ): void {
    const validateNakedValue = (naked: unknown, nakedPath: string): void => {
      this.validateBackgroundValue(naked, propName, nakedPath, type, errors);
    };
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'background',
      { stateful: spec.stateful === true, responsive: false },
      errors,
      validateNakedValue,
    );
  }

  private validateBackgroundValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, BACKGROUND_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'background', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    const bgType = record.type;
    if (
      typeof bgType !== 'string' ||
      !BACKGROUND_TYPE_VALUES.includes(bgType as (typeof BACKGROUND_TYPE_VALUES)[number])
    ) {
      this.pushPropInvalid(errors, `${path}.type`, type, propName, 'background', 'enum', {
        constraint: [...BACKGROUND_TYPE_VALUES],
      });
    }

    if (Object.prototype.hasOwnProperty.call(record, 'color')) {
      // Riusa la validazione di `colorRef` (`kind` riportato: 'background',
      // stesso principio di composizione di `gradient`/`transform`).
      this.validateColorRefNakedValue(
        record.color,
        propName,
        `${path}.color`,
        type,
        'background',
        false,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'gradient')) {
      // Riusa `validateGradient` così com'è (task S1.4: "riusali"): gli errori
      // interni riportano `kind: 'gradient'`, non `'background'` — stesso
      // principio già in vigore per i color stop di un gradiente.
      this.validateGradient(record.gradient, propName, `${path}.gradient`, type, errors);
    }
    if (Object.prototype.hasOwnProperty.call(record, 'image')) {
      this.validateBackgroundImage(record.image, propName, `${path}.image`, type, errors);
    }
    if (Object.prototype.hasOwnProperty.call(record, 'video')) {
      this.validateBackgroundVideo(record.video, propName, `${path}.video`, type, errors);
    }
    if (Object.prototype.hasOwnProperty.call(record, 'slideshow')) {
      this.validateBackgroundSlideshow(
        record.slideshow,
        propName,
        `${path}.slideshow`,
        type,
        errors,
      );
    }
    if (Object.prototype.hasOwnProperty.call(record, 'overlay')) {
      this.validateBackgroundOverlay(record.overlay, propName, `${path}.overlay`, type, errors);
    }
  }

  private validateBackgroundImage(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, BACKGROUND_IMAGE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'background', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    const mediaRef = record.mediaRef;
    if (typeof mediaRef !== 'string' || !GUID_PATTERN.test(mediaRef)) {
      this.pushPropInvalid(errors, `${path}.mediaRef`, type, propName, 'background', 'guidFormat');
    }
    const position = record.position;
    if (
      typeof position !== 'string' ||
      !BG_POSITION_VALUES.includes(position as (typeof BG_POSITION_VALUES)[number])
    ) {
      this.pushPropInvalid(errors, `${path}.position`, type, propName, 'background', 'enum', {
        constraint: [...BG_POSITION_VALUES],
      });
    }
    const attachment = record.attachment;
    if (
      typeof attachment !== 'string' ||
      !BACKGROUND_IMAGE_ATTACHMENT_VALUES.includes(
        attachment as (typeof BACKGROUND_IMAGE_ATTACHMENT_VALUES)[number],
      )
    ) {
      this.pushPropInvalid(errors, `${path}.attachment`, type, propName, 'background', 'enum', {
        constraint: [...BACKGROUND_IMAGE_ATTACHMENT_VALUES],
      });
    }
    const repeat = record.repeat;
    if (
      typeof repeat !== 'string' ||
      !BACKGROUND_IMAGE_REPEAT_VALUES.includes(
        repeat as (typeof BACKGROUND_IMAGE_REPEAT_VALUES)[number],
      )
    ) {
      this.pushPropInvalid(errors, `${path}.repeat`, type, propName, 'background', 'enum', {
        constraint: [...BACKGROUND_IMAGE_REPEAT_VALUES],
      });
    }
    const size = record.size;
    if (
      typeof size !== 'string' ||
      !BACKGROUND_IMAGE_SIZE_VALUES.includes(size as (typeof BACKGROUND_IMAGE_SIZE_VALUES)[number])
    ) {
      this.pushPropInvalid(errors, `${path}.size`, type, propName, 'background', 'enum', {
        constraint: [...BACKGROUND_IMAGE_SIZE_VALUES],
      });
    }
    if (Object.prototype.hasOwnProperty.call(record, 'customSize')) {
      this.validateEmbeddedUnitValue(
        record.customSize,
        propName,
        `${path}.customSize`,
        type,
        'background',
        BACKGROUND_IMAGE_CUSTOM_SIZE_UNITS,
        BACKGROUND_IMAGE_CUSTOM_SIZE_RANGE,
        errors,
      );
    }
  }

  /** Forma minimale (ADR-82 § "Conseguenze", "debito dichiarato": nessun renderer onora `video` in questo round). */
  private validateBackgroundVideo(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, BACKGROUND_VIDEO_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'background', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, 'mediaRef')) {
      const mediaRef = record.mediaRef;
      if (typeof mediaRef !== 'string' || !GUID_PATTERN.test(mediaRef)) {
        this.pushPropInvalid(
          errors,
          `${path}.mediaRef`,
          type,
          propName,
          'background',
          'guidFormat',
        );
      }
    }
    if (Object.prototype.hasOwnProperty.call(record, 'url')) {
      const url = record.url;
      if (typeof url !== 'string' || !isAllowedUrl(url)) {
        this.pushPropInvalid(errors, `${path}.url`, type, propName, 'background', 'urlScheme');
      }
    }
    // `start`/`end`: nessun intervallo dichiarato dai documenti — solo
    // verifica di tipo, stesso principio di `transform.translateX` (S1.1).
    for (const field of ['start', 'end'] as const) {
      if (
        Object.prototype.hasOwnProperty.call(record, field) &&
        typeof record[field] !== 'number'
      ) {
        this.pushPropInvalid(errors, `${path}.${field}`, type, propName, 'background', 'type');
      }
    }
    for (const field of ['loop', 'playOnMobile'] as const) {
      if (
        Object.prototype.hasOwnProperty.call(record, field) &&
        typeof record[field] !== 'boolean'
      ) {
        this.pushPropInvalid(errors, `${path}.${field}`, type, propName, 'background', 'type');
      }
    }
    if (Object.prototype.hasOwnProperty.call(record, 'fallbackMediaRef')) {
      const fallbackMediaRef = record.fallbackMediaRef;
      if (typeof fallbackMediaRef !== 'string' || !GUID_PATTERN.test(fallbackMediaRef)) {
        this.pushPropInvalid(
          errors,
          `${path}.fallbackMediaRef`,
          type,
          propName,
          'background',
          'guidFormat',
        );
      }
    }
  }

  /** Forma minimale (ADR-82 § "Conseguenze", "debito dichiarato": nessun renderer onora `slideshow` in questo round). */
  private validateBackgroundSlideshow(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, BACKGROUND_SLIDESHOW_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'background', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    const items = record.items;
    if (!Array.isArray(items)) {
      this.pushPropInvalid(errors, `${path}.items`, type, propName, 'background', 'type');
    } else {
      if (
        items.length < BACKGROUND_SLIDESHOW_ITEMS_RANGE[0] ||
        items.length > BACKGROUND_SLIDESHOW_ITEMS_RANGE[1]
      ) {
        this.pushPropInvalid(errors, `${path}.items`, type, propName, 'background', 'range', {
          constraint: BACKGROUND_SLIDESHOW_ITEMS_RANGE,
          actual: items.length,
        });
      }
      items.forEach((item: unknown, index: number) => {
        if (typeof item !== 'string' || !GUID_PATTERN.test(item)) {
          this.pushPropInvalid(
            errors,
            `${path}.items[${index}]`,
            type,
            propName,
            'background',
            'guidFormat',
          );
        }
      });
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'duration') &&
      typeof record.duration !== 'number'
    ) {
      this.pushPropInvalid(errors, `${path}.duration`, type, propName, 'background', 'type');
    }
    if (Object.prototype.hasOwnProperty.call(record, 'transition')) {
      const transition = record.transition;
      if (
        typeof transition !== 'string' ||
        !BACKGROUND_SLIDESHOW_TRANSITION_VALUES.includes(
          transition as (typeof BACKGROUND_SLIDESHOW_TRANSITION_VALUES)[number],
        )
      ) {
        this.pushPropInvalid(errors, `${path}.transition`, type, propName, 'background', 'enum', {
          constraint: [...BACKGROUND_SLIDESHOW_TRANSITION_VALUES],
        });
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'kenBurns') &&
      typeof record.kenBurns !== 'boolean'
    ) {
      this.pushPropInvalid(errors, `${path}.kenBurns`, type, propName, 'background', 'type');
    }
  }

  private validateBackgroundOverlay(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, BACKGROUND_OVERLAY_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'background', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, 'color')) {
      // Scope S1.4: solo la forma `colorRef` (SPEC-propkind-v2.md § 3.7 ammette
      // anche `GradientValue`, non validato qui — vedi resoconto finale).
      this.validateColorRefNakedValue(
        record.color,
        propName,
        `${path}.color`,
        type,
        'background',
        false,
        errors,
      );
    }
    const opacity = record.opacity;
    if (typeof opacity !== 'number' || Number.isNaN(opacity)) {
      this.pushPropInvalid(errors, `${path}.opacity`, type, propName, 'background', 'type');
    } else if (
      opacity < BACKGROUND_OVERLAY_OPACITY_RANGE[0] ||
      opacity > BACKGROUND_OVERLAY_OPACITY_RANGE[1]
    ) {
      this.pushPropInvalid(errors, `${path}.opacity`, type, propName, 'background', 'range', {
        constraint: BACKGROUND_OVERLAY_OPACITY_RANGE,
        actual: opacity,
      });
    }
    if (Object.prototype.hasOwnProperty.call(record, 'blend')) {
      const blend = record.blend;
      if (
        typeof blend !== 'string' ||
        !FILTER_BLEND_MODES.includes(blend as (typeof FILTER_BLEND_MODES)[number])
      ) {
        this.pushPropInvalid(errors, `${path}.blend`, type, propName, 'background', 'enum', {
          constraint: [...FILTER_BLEND_MODES],
        });
      }
    }
  }

  // ─── `link` (`docs/SPEC-propkind-v2.md` § 3.12) — mai stateful/responsive ─

  private validateLinkValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, LINK_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'link', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    this.validateLinkHref(record.href, propName, `${path}.href`, type, errors);

    const target = record.target;
    if (
      typeof target !== 'string' ||
      !LINK_TARGET_VALUES.includes(target as (typeof LINK_TARGET_VALUES)[number])
    ) {
      this.pushPropInvalid(errors, `${path}.target`, type, propName, 'link', 'enum', {
        constraint: [...LINK_TARGET_VALUES],
      });
    }

    const rel = record.rel;
    if (!Array.isArray(rel)) {
      this.pushPropInvalid(errors, `${path}.rel`, type, propName, 'link', 'type');
    } else {
      rel.forEach((token: unknown, index: number) => {
        if (
          typeof token !== 'string' ||
          !LINK_REL_VALUES.includes(token as (typeof LINK_REL_VALUES)[number])
        ) {
          this.pushPropInvalid(errors, `${path}.rel[${index}]`, type, propName, 'link', 'enum', {
            constraint: [...LINK_REL_VALUES],
          });
        }
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(record, 'lightbox') &&
      typeof record.lightbox !== 'boolean'
    ) {
      this.pushPropInvalid(errors, `${path}.lightbox`, type, propName, 'link', 'type');
    }
  }

  private validateLinkHref(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (typeof value === 'string') {
      if (!isAllowedUrl(value)) {
        this.pushPropInvalid(errors, path, type, propName, 'link', 'urlScheme');
      }
      return;
    }
    if (isPlainObject(value) && hasOnlyKeys(value, ['pageRef'])) {
      if (typeof value.pageRef !== 'string' || !GUID_PATTERN.test(value.pageRef)) {
        this.pushPropInvalid(errors, `${path}.pageRef`, type, propName, 'link', 'guidFormat');
      }
      return;
    }
    if (isPlainObject(value) && hasOnlyKeys(value, ['mediaRef'])) {
      if (typeof value.mediaRef !== 'string' || !GUID_PATTERN.test(value.mediaRef)) {
        this.pushPropInvalid(errors, `${path}.mediaRef`, type, propName, 'link', 'guidFormat');
      }
      return;
    }
    this.pushPropInvalid(errors, path, type, propName, 'link', 'type');
  }

  // ─── `animation` (`docs/SPEC-propkind-v2.md` § 3.10) — mai stateful/responsive ─

  private validateAnimationValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ANIMATION_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'animation', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(record, 'entrance')) {
      this.validateClosedEnumField(
        record.entrance,
        propName,
        `${path}.entrance`,
        type,
        'animation',
        ANIMATION_ENTRANCE_VALUES,
        errors,
      );
    }
    const duration = record.duration;
    if (
      typeof duration !== 'string' ||
      !ANIMATION_DURATION_VALUES.includes(duration as (typeof ANIMATION_DURATION_VALUES)[number])
    ) {
      this.pushPropInvalid(errors, `${path}.duration`, type, propName, 'animation', 'enum', {
        constraint: [...ANIMATION_DURATION_VALUES],
      });
    }
    const delayMs = record.delayMs;
    if (typeof delayMs !== 'number' || Number.isNaN(delayMs)) {
      this.pushPropInvalid(errors, `${path}.delayMs`, type, propName, 'animation', 'type');
    } else if (delayMs < ANIMATION_DELAY_MS_RANGE[0] || delayMs > ANIMATION_DELAY_MS_RANGE[1]) {
      this.pushPropInvalid(errors, `${path}.delayMs`, type, propName, 'animation', 'range', {
        constraint: ANIMATION_DELAY_MS_RANGE,
        actual: delayMs,
      });
    }
  }

  // ─── `motion` (`docs/SPEC-propkind-v2.md` § 3.11) — mai stateful/responsive ─

  private validateMotionValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, MOTION_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'motion', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(record, 'scroll')) {
      this.validateMotionScroll(record.scroll, propName, `${path}.scroll`, type, errors);
    }
    if (Object.prototype.hasOwnProperty.call(record, 'onBreakpoints')) {
      const onBreakpoints = record.onBreakpoints;
      if (!Array.isArray(onBreakpoints)) {
        this.pushPropInvalid(errors, `${path}.onBreakpoints`, type, propName, 'motion', 'type');
      } else {
        onBreakpoints.forEach((breakpoint: unknown, index: number) => {
          if (
            typeof breakpoint !== 'string' ||
            !RESPONSIVE_BREAKPOINTS.includes(breakpoint as ResponsiveBreakpointName)
          ) {
            this.pushPropInvalid(
              errors,
              `${path}.onBreakpoints[${index}]`,
              type,
              propName,
              'motion',
              'enum',
              {
                constraint: [...RESPONSIVE_BREAKPOINTS],
              },
            );
          }
        });
      }
    }
  }

  /** Nessun intervallo dichiarato dai documenti per i campi di `scroll` — solo verifica di tipo (stesso principio di `transform.translateX`, S1.1). */
  private validateMotionScroll(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, MOTION_SCROLL_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'motion', 'type');
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(record, 'verticalTranslate') &&
      typeof record.verticalTranslate !== 'number'
    ) {
      this.pushPropInvalid(errors, `${path}.verticalTranslate`, type, propName, 'motion', 'type');
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'opacity') &&
      typeof record.opacity !== 'boolean'
    ) {
      this.pushPropInvalid(errors, `${path}.opacity`, type, propName, 'motion', 'type');
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'rotate') &&
      typeof record.rotate !== 'number'
    ) {
      this.pushPropInvalid(errors, `${path}.rotate`, type, propName, 'motion', 'type');
    }
    if (Object.prototype.hasOwnProperty.call(record, 'scale') && typeof record.scale !== 'number') {
      this.pushPropInvalid(errors, `${path}.scale`, type, propName, 'motion', 'type');
    }
  }

  // ─── `attributes` (`docs/SPEC-propkind-v2.md` § 3.14) — mai stateful/responsive ─

  private validateAttributesValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!Array.isArray(value)) {
      this.pushPropInvalid(errors, path, type, propName, 'attributes', 'type');
      return;
    }
    if (value.length > ATTRIBUTES_MAX_ITEMS) {
      this.pushPropInvalid(errors, path, type, propName, 'attributes', 'range', {
        constraint: [0, ATTRIBUTES_MAX_ITEMS],
        actual: value.length,
      });
    }
    value.forEach((item: unknown, index: number) => {
      const itemPath = `${path}[${index}]`;
      if (!isPlainObject(item) || !hasOnlyKeys(item, ATTRIBUTE_KEYS)) {
        this.pushPropInvalid(errors, itemPath, type, propName, 'attributes', 'type');
        return;
      }
      const record = item as Record<string, unknown>;
      const name = record.name;
      if (typeof name !== 'string' || !ATTRIBUTE_NAME_PATTERN.test(name)) {
        this.pushPropInvalid(errors, `${itemPath}.name`, type, propName, 'attributes', 'format');
      }
      const attrValue = record.value;
      if (typeof attrValue !== 'string') {
        this.pushPropInvalid(errors, `${itemPath}.value`, type, propName, 'attributes', 'type');
      } else if (codePointLength(attrValue) > ATTRIBUTE_VALUE_MAX_LENGTH) {
        this.pushPropInvalid(
          errors,
          `${itemPath}.value`,
          type,
          propName,
          'attributes',
          'maxLength',
          {
            constraint: ATTRIBUTE_VALUE_MAX_LENGTH,
            actual: codePointLength(attrValue),
          },
        );
      }
    });
  }

  // ─── `css` (`docs/SPEC-propkind-v2.md` § 3.15) — scope ridotto, sanitizzazione a valle ─

  /**
   * Scope volutamente ridotto a tipo/lunghezza (vedi `CssPropSpec` in
   * `prop-spec.types.ts`): il parsing AST, l'auto-scoping e l'allowlist di
   * proprietà sono implementati in `CssTreeSanitizerService`
   * (`app/backend/src/common/sanitizer/css-tree-sanitizer.service.ts`),
   * invocato dopo questo validator nella pipeline (ADR-21 § 3.7), governato
   * da `docs/ai/adr/ADR-78-sanitizzazione-css-e-sandbox-html.md` — approvata
   * 2026-09-18.
   */
  private validateCssValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: CssPropSpec,
    errors: BlockValidationError[],
  ): void {
    if (typeof value !== 'string') {
      this.pushPropInvalid(errors, path, type, propName, 'css', 'type');
      return;
    }
    const actual = codePointLength(value);
    if (actual > spec.maxLength) {
      this.pushPropInvalid(errors, path, type, propName, 'css', 'maxLength', {
        constraint: spec.maxLength,
        actual,
      });
    }
  }

  // ─── `hideOn` (ADR-81/ADR-82) — mai stateful/responsive ───────────────────

  private validateHideOnValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!Array.isArray(value)) {
      this.pushPropInvalid(errors, path, type, propName, 'hideOn', 'type');
      return;
    }
    if (value.length > RESPONSIVE_BREAKPOINTS.length) {
      this.pushPropInvalid(errors, path, type, propName, 'hideOn', 'range', {
        constraint: [0, RESPONSIVE_BREAKPOINTS.length],
        actual: value.length,
      });
    }
    const seen = new Set<string>();
    value.forEach((breakpoint: unknown, index: number) => {
      if (
        typeof breakpoint !== 'string' ||
        !RESPONSIVE_BREAKPOINTS.includes(breakpoint as ResponsiveBreakpointName)
      ) {
        this.pushPropInvalid(errors, `${path}[${index}]`, type, propName, 'hideOn', 'enum', {
          constraint: [...RESPONSIVE_BREAKPOINTS],
        });
        return;
      }
      // Nessun duplicato (ADR-81/ADR-82): nessun `reason` dedicato nell'insieme
      // chiuso per "duplicato" — `format` è il più vicino (valore comunque
      // fuori forma per il contratto della prop), scelta di design segnalata
      // nel resoconto finale.
      if (seen.has(breakpoint)) {
        this.pushPropInvalid(errors, `${path}[${index}]`, type, propName, 'hideOn', 'format');
      }
      seen.add(breakpoint);
    });
  }

  // ─── `shapeDivider` (ADR-82 § "Decisione" punto 1) — mai stateful/responsive ─

  private validateShapeDividerValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, SHAPE_DIVIDER_VALUE_KEYS)) {
      this.pushPropInvalid(errors, path, type, propName, 'shapeDivider', 'type');
      return;
    }
    const record = value as Record<string, unknown>;

    const style = record.style;
    if (typeof style !== 'string' || !SHAPE_DIVIDER_STYLES.includes(style as ShapeDividerStyle)) {
      this.pushPropInvalid(errors, `${path}.style`, type, propName, 'shapeDivider', 'enum', {
        constraint: [...SHAPE_DIVIDER_STYLES],
      });
    }

    this.validateColorRefNakedValue(
      record.color,
      propName,
      `${path}.color`,
      type,
      'shapeDivider',
      false,
      errors,
    );

    this.validateEmbeddedUnitValue(
      record.width,
      propName,
      `${path}.width`,
      type,
      'shapeDivider',
      SHAPE_DIVIDER_WIDTH_UNITS,
      SHAPE_DIVIDER_WIDTH_RANGE,
      errors,
    );
    this.validateEmbeddedUnitValue(
      record.height,
      propName,
      `${path}.height`,
      type,
      'shapeDivider',
      SHAPE_DIVIDER_HEIGHT_UNITS,
      SHAPE_DIVIDER_HEIGHT_RANGE,
      errors,
    );

    for (const field of ['flip', 'invert', 'aboveContent'] as const) {
      if (typeof record[field] !== 'boolean') {
        this.pushPropInvalid(errors, `${path}.${field}`, type, propName, 'shapeDivider', 'type');
      }
    }
  }

  // ─── `border`/`shadow` con inviluppo `stateful` opzionale (ADR-82 § "Conseguenze") ─

  private validateBorderProp(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: BorderPropSpec,
    errors: BlockValidationError[],
  ): void {
    const validateNakedValue = (naked: unknown, nakedPath: string): void => {
      this.validateBorder(naked, propName, nakedPath, type, errors);
    };
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'border',
      { stateful: spec.stateful === true, responsive: false },
      errors,
      validateNakedValue,
    );
  }

  private validateShadowProp(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: ShadowPropSpec,
    errors: BlockValidationError[],
  ): void {
    const validateNakedValue = (naked: unknown, nakedPath: string): void => {
      this.validateShadow(naked, propName, nakedPath, type, errors);
    };
    this.validateStatefulResponsiveValue(
      value,
      propName,
      path,
      type,
      'shadow',
      { stateful: spec.stateful === true, responsive: false },
      errors,
      validateNakedValue,
    );
  }

  /** Spinge un errore `BLOCK_PROP_INVALID` con `path` esplicito — usato dai `kind` a valore oggetto per puntare al campo interno colpevole (ADR-38). */
  private pushPropInvalid(
    errors: BlockValidationError[],
    path: string,
    type: string,
    prop: string,
    kind: PropKind,
    reason: BlockPropInvalidReason,
    extra?: { constraint?: number | string[] | [number, number]; actual?: number },
  ): void {
    errors.push({
      code: 'BLOCK_PROP_INVALID',
      details: { path, type, prop, kind, reason, ...extra },
    });
  }

  /**
   * Valida `kind: 'unitValue'` (ADR-38 § 2): oggetto `{value, unit}`, mai
   * libero — `value` dentro `[spec.min, spec.max]`, `unit` dentro
   * `spec.units`. Forma diversa da `{value,unit}` → `reason: 'type'` sul
   * path della prop, non sui sotto-campi.
   */
  private validateUnitValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: UnitValuePropSpec,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['value', 'unit'])) {
      this.pushPropInvalid(errors, path, type, propName, 'unitValue', 'type');
      return;
    }

    const numericValue = value.value;
    if (typeof numericValue !== 'number' || Number.isNaN(numericValue)) {
      this.pushPropInvalid(errors, `${path}.value`, type, propName, 'unitValue', 'type');
    } else if (numericValue < spec.min || numericValue > spec.max) {
      this.pushPropInvalid(errors, `${path}.value`, type, propName, 'unitValue', 'range', {
        constraint: [spec.min, spec.max],
        actual: numericValue,
      });
    }

    const unit = value.unit;
    if (typeof unit !== 'string' || !spec.units.includes(unit as LengthUnit)) {
      this.pushPropInvalid(errors, `${path}.unit`, type, propName, 'unitValue', 'enum', {
        constraint: [...spec.units],
      });
    }
  }

  /** Valida `kind: 'border'` (ADR-38 § 3): oggetto a 4 campi fissi, ogni campo vincolato. */
  private validateBorder(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['width', 'style', 'color', 'radius'])) {
      this.pushPropInvalid(errors, path, type, propName, 'border', 'type');
      return;
    }

    const { width, style, color, radius } = value;

    if (typeof width !== 'number' || Number.isNaN(width)) {
      this.pushPropInvalid(errors, `${path}.width`, type, propName, 'border', 'type');
    } else if (width < BORDER_WIDTH_RANGE[0] || width > BORDER_WIDTH_RANGE[1]) {
      this.pushPropInvalid(errors, `${path}.width`, type, propName, 'border', 'range', {
        constraint: BORDER_WIDTH_RANGE,
        actual: width,
      });
    }

    if (typeof style !== 'string' || !BORDER_STYLES.includes(style as BorderStyle)) {
      this.pushPropInvalid(errors, `${path}.style`, type, propName, 'border', 'enum', {
        constraint: [...BORDER_STYLES],
      });
    }

    if (typeof color !== 'string' || !HEX_COLOR_PATTERN.test(color)) {
      this.pushPropInvalid(errors, `${path}.color`, type, propName, 'border', 'format');
    }

    if (typeof radius !== 'number' || Number.isNaN(radius)) {
      this.pushPropInvalid(errors, `${path}.radius`, type, propName, 'border', 'type');
    } else if (radius < BORDER_RADIUS_RANGE[0] || radius > BORDER_RADIUS_RANGE[1]) {
      this.pushPropInvalid(errors, `${path}.radius`, type, propName, 'border', 'range', {
        constraint: BORDER_RADIUS_RANGE,
        actual: radius,
      });
    }
  }

  /** Valida `kind: 'shadow'` (ADR-38 § 4): oggetto a 5 campi fissi, ogni campo numerico vincolato da un intervallo fisso. */
  private validateShadow(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['x', 'y', 'blur', 'spread', 'color'])) {
      this.pushPropInvalid(errors, path, type, propName, 'shadow', 'type');
      return;
    }

    const { x, y, blur, spread, color } = value;
    const numericFields: Array<[string, unknown, [number, number]]> = [
      ['x', x, SHADOW_OFFSET_RANGE],
      ['y', y, SHADOW_OFFSET_RANGE],
      ['blur', blur, SHADOW_BLUR_RANGE],
      ['spread', spread, SHADOW_SPREAD_RANGE],
    ];
    for (const [field, fieldValue, range] of numericFields) {
      if (typeof fieldValue !== 'number' || Number.isNaN(fieldValue)) {
        this.pushPropInvalid(errors, `${path}.${field}`, type, propName, 'shadow', 'type');
      } else if (fieldValue < range[0] || fieldValue > range[1]) {
        this.pushPropInvalid(errors, `${path}.${field}`, type, propName, 'shadow', 'range', {
          constraint: range,
          actual: fieldValue,
        });
      }
    }

    if (typeof color !== 'string' || !HEX_COLOR_PATTERN.test(color)) {
      this.pushPropInvalid(errors, `${path}.color`, type, propName, 'shadow', 'format');
    }
  }
}

/** Vero se `value` è un oggetto semplice (mai `null`, mai un array) — guardia comune ai `kind` a valore oggetto (ADR-38). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Vero se le chiavi di `value` sono un sottoinsieme esatto di `keys` — nessuna chiave estranea ammessa in un `kind` a forma fissa (ADR-38). */
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/**
 * Verifica `kind: 'cssClassName'` (ADR-38 § 5): 1–3 token spazio-separati,
 * ciascuno conforme a `CSS_IDENTIFIER_TOKEN_PATTERN`, somma ≤ 100 caratteri.
 * Spazi multipli o ai bordi producono token vuoti, che il pattern respinge.
 */
function isValidCssClassName(value: string): boolean {
  if (value.length === 0 || value.length > CSS_CLASS_NAME_MAX_LENGTH) return false;
  const tokens = value.split(' ');
  if (tokens.length > CSS_CLASS_NAME_MAX_TOKENS) return false;
  return tokens.every((token) => CSS_IDENTIFIER_TOKEN_PATTERN.test(token));
}

/**
 * Verifica se `value` è un token ammesso della lista `values` di un
 * `EnumPropSpec` — condivisa fra il ramo scalare e il ramo per breakpoint di
 * `case 'enum'` (ADR-29 § 4: "la verifica del token in una funzione sola
 * usata da entrambi i percorsi").
 */
function isEnumTokenAllowed(value: unknown, values: readonly string[]): value is string {
  return typeof value === 'string' && values.includes(value);
}

/** Lunghezza in code point Unicode (non byte, non unità UTF-16) — SPEC-F02-blocchi.md § 1.4. */
function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** Forme ammesse per `kind: 'url'` (SPEC-F02-blocchi.md § 3.6). Nessun protocol-relative, nessuna relativa senza barra iniziale, nessuno schema fuori dall'elenco. */
function isAllowedUrl(value: string): boolean {
  return (
    ABSOLUTE_URL_PATTERN.test(value) ||
    MAILTO_URL_PATTERN.test(value) ||
    ROOT_RELATIVE_URL_PATTERN.test(value)
  );
}

/**
 * Verifica una stringa hex per `kind: 'colorRef'` (SPEC-PROPKIND-V2-DETAILS.md
 * § 1 punto 1): 3/6 cifre sempre ammesse, 8 cifre (`#RRGGBBAA`) solo se
 * `allowAlpha` è `true`.
 */
function isValidColorRefHexString(value: string, allowAlpha: boolean): boolean {
  if (HEX_COLOR_PATTERN.test(value)) return true;
  return allowAlpha && HEX_COLOR_ALPHA_PATTERN.test(value);
}

/**
 * Verifica un `GlobalColorId`/`GlobalFontId` (ADR-77 § 2): uno dei 4 id
 * "system" riservati (`primary|secondary|text|accent`) o un guid 16 hex
 * minuscolo — nessuna verifica di esistenza a scrittura (stesso principio di
 * `mediaRef`/`pageRef`, ADR-52 § 3/§ 4).
 */
function isValidGlobalTokenRef(ref: unknown): ref is string {
  return (
    typeof ref === 'string' &&
    (GLOBAL_TOKEN_SYSTEM_IDS.includes(ref as (typeof GLOBAL_TOKEN_SYSTEM_IDS)[number]) ||
      GUID_PATTERN.test(ref))
  );
}
