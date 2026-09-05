/**
 * Dispatcher ricorsivo type → componente per l'albero di blocchi in sola
 * lettura (PLAN-F02-blocchi.md T8). Ogni nodo renderizzato è avvolto nel suo
 * proprio `BlockErrorBoundary`, non uno globale attorno all'intero albero.
 * Non rivalida le props (resta autorità del server, SPEC-F02-blocchi.md
 * § 5.3): consulta `BLOCK_TYPES` solo per sapere se un tipo è noto/abilitato
 * prima di scegliere il componente.
 *
 * `editing` (PLAN-F04c-editor-maturo.md T9): pass-through opzionale verso `Heading`/
 * `RichText`/`Button`, valorizzato solo da `EditorBlockWrapper.tsx` per il nodo selezionato
 * in editing — mai dal sito pubblico, che chiama `BlockRenderer` senza questa prop (resta
 * `undefined`, i tre componenti rendono esattamente come prima). Non si propaga in
 * ricorsione dentro `Section`: `BlockRenderer` per un contenitore è montato solo dal sito
 * pubblico (l'editor usa `CONTAINER_COMPONENTS` direttamente, vedi `EditorBlockWrapper.tsx`),
 * dove l'editing non esiste.
 */
import { BLOCK_TYPES } from '../../types/blocks.types';
import type { RenderableBlockNode } from './types';
import BlockErrorBoundary from './BlockErrorBoundary';
import Section from './blocks/Section';
import Container from './blocks/Container';
import Heading from './blocks/Heading';
import RichText from './blocks/RichText';
import Image from './blocks/Image';
import Button from './blocks/Button';
import FormBlock from './blocks/FormBlock';
import FormFieldBlock from './blocks/FormFieldBlock';
import FormSubmitBlock from './blocks/FormSubmitBlock';
import NavMenuBlock from './blocks/NavMenuBlock';
import NavMenuItemBlock from './blocks/NavMenuItemBlock';
import GlobalRefBlock from './blocks/GlobalRefBlock';
import ContentPlaceholderBlock, { CONTENT_AREA_BLOCK_ID } from './blocks/ContentPlaceholderBlock';
import AccordionBlock from './blocks/AccordionBlock';
import AccordionItemBlock from './blocks/AccordionItemBlock';
import TabsBlock from './blocks/TabsBlock';
import TabPanelBlock from './blocks/TabPanelBlock';
import CarouselBlock, { resolveCarouselTransition } from './blocks/CarouselBlock';
import CarouselSlideBlock from './blocks/CarouselSlideBlock';
import ModalTriggerBlock from './blocks/ModalTriggerBlock';

const KNOWN_TYPES = new Map(BLOCK_TYPES.map((descriptor) => [descriptor.type, descriptor]));

/** `level` è già validato server-side contro l'enum del registro (`h2`-`h6`). */
function isHeadingLevel(value: unknown): value is 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  return typeof value === 'string' && ['h2', 'h3', 'h4', 'h5', 'h6'].includes(value);
}

/**
 * Editing in-place per `heading`/`richText`/`button` (solo questi tre tipi hanno testo
 * modificabile direttamente nel canvas): `onTextChange`/`onTextInput` per `heading` (prop
 * `text`), `onHtmlChange`/`onHtmlInput` per `richText` (prop `html`),
 * `onLabelChange`/`onLabelInput` per `button` (prop `label`) — mai più coppie insieme, un
 * nodo è di uno solo di questi tre tipi. `*Change` è il commit su `blur`, `*Input` la
 * notifica ad ogni tasto per il dispatch debounced (`EditorBlockWrapper.tsx`).
 */
interface BlockEditingProps {
  editable?: boolean;
  onTextChange?: (nextText: string) => void;
  onTextInput?: (nextText: string) => void;
  onHtmlChange?: (nextHtml: string) => void;
  onHtmlInput?: (nextHtml: string) => void;
  onLabelChange?: (nextLabel: string) => void;
  onLabelInput?: (nextLabel: string) => void;
}

/**
 * Dati di sottomissione di un `form` (F10-04, ADR-46 § 3/§ 4, N8): honeypot
 * a nome derivato, firma HMAC e URL di destinazione, calcolati per `formKey`
 * da chi monta `BlockRenderer` — mai qui. Pass-through opzionale come
 * `editing`: valorizzato solo da `app/public-site` (`PageView.tsx`, unico
 * punto con accesso al secret/all'origine browser-facing del backend); il
 * Canvas admin non lo passa mai, quindi il blocco `form` vi resta senza
 * honeypot/firma/azione — coerente con l'essere lì solo composizione
 * visiva, mai un invio reale.
 */
interface FormSubmissionData {
  honeypotFieldName: string;
  signature: string;
  submitUrl: string;
}

interface BlockRendererProps {
  node: RenderableBlockNode;
  /** Vedi {@link BlockEditingProps} e il commento di testa del file. */
  editing?: BlockEditingProps;
  /** Vedi {@link FormSubmissionData}. */
  formSubmission?: (formKey: string) => FormSubmissionData;
  /**
   * Risolve un `pageGuid` (`navMenuItem`, ADR-52) al percorso pubblico canonico della Pagina
   * puntata — `string` se risolto, `null` se la Pagina non è pubblicata/inesistente,
   * `undefined` se il guid non è (ancora) conosciuto. Pass-through opzionale come
   * `formSubmission`: valorizzato solo da `app/public-site` (`entry-server.tsx`, risoluzione
   * a monte del render via `GET public/pages/by-guid/:guid`, ADR-24). Il Canvas admin non lo
   * passa mai — `NavMenuItemBlock` vi risolve invece via `usePublicPageUrl` (client-side).
   */
  resolvePageUrl?: (pageGuid: string) => string | null | undefined;
}

/** Renderizza un nodo dell'albero e, ricorsivamente, i suoi figli ammessi. */
export default function BlockRenderer({ node, editing, formSubmission, resolvePageUrl }: BlockRendererProps) {
  const descriptor = KNOWN_TYPES.get(node.type);

  if (!descriptor || !descriptor.enabled) {
    return null;
  }

  return (
    <BlockErrorBoundary>{renderNode(node, editing, formSubmission, resolvePageUrl)}</BlockErrorBoundary>
  );
}

function renderNode(
  node: RenderableBlockNode,
  editing: BlockEditingProps | undefined,
  formSubmission: ((formKey: string) => FormSubmissionData) | undefined,
  resolvePageUrl: ((pageGuid: string) => string | null | undefined) | undefined,
) {
  switch (node.type) {
    case 'section':
      return (
        <Section
          styleSpaceBefore={node.props.styleSpaceBefore}
          styleSpaceAfter={node.props.styleSpaceAfter}
          stylePadding={node.props.stylePadding}
          styleBackground={node.props.styleBackground}
          columns={node.props.columns}
          gap={node.props.gap}
          alignItems={node.props.alignItems}
          contentWidth={node.props.contentWidth}
          maxWidth={node.props.maxWidth}
          columnRatio={node.props.columnRatio}
          styleBackgroundColor={node.props.styleBackgroundColor}
          styleColor={node.props.styleColor}
          stylePaddingTop={node.props.stylePaddingTop}
          stylePaddingRight={node.props.stylePaddingRight}
          stylePaddingBottom={node.props.stylePaddingBottom}
          stylePaddingLeft={node.props.stylePaddingLeft}
          styleMarginTop={node.props.styleMarginTop}
          styleMarginRight={node.props.styleMarginRight}
          styleMarginBottom={node.props.styleMarginBottom}
          styleMarginLeft={node.props.styleMarginLeft}
          styleLayer={node.props.styleLayer}
          styleHideDesktop={node.props.styleHideDesktop}
          styleHideTablet={node.props.styleHideTablet}
          styleHideMobile={node.props.styleHideMobile}
          styleBackgroundImageRef={node.props.styleBackgroundImageRef}
          styleOverlayColor={node.props.styleOverlayColor}
          styleOverlayOpacity={node.props.styleOverlayOpacity}
        >
          {node.children.map((child) => (
            <BlockRenderer
              key={child.id}
              node={child}
              formSubmission={formSubmission}
              resolvePageUrl={resolvePageUrl}
            />
          ))}
        </Section>
      );
    case 'container':
      // Segnaposto "Area Contenuto Pagina" del Template Editor (Site Templates): un
      // `container` reale e già valido nello schema, riconosciuto solo dalla sua prop
      // `customElementId` (mai un settimo tipo di blocco, mai l'`id` strutturale del nodo —
      // vedi il commento di testa di `ContentPlaceholderBlock.tsx`). Early-check additivo,
      // nessun'altra modifica a questo dispatcher.
      if (node.props.customElementId === CONTENT_AREA_BLOCK_ID) {
        return (
          <ContentPlaceholderBlock>
            {node.children.map((child) => (
              <BlockRenderer
                key={child.id}
                node={child}
                formSubmission={formSubmission}
                resolvePageUrl={resolvePageUrl}
              />
            ))}
          </ContentPlaceholderBlock>
        );
      }
      return (
        <Container
          display={node.props.display}
          flexDirection={node.props.flexDirection}
          justifyContent={node.props.justifyContent}
          alignItems={node.props.alignItems}
          wrap={node.props.wrap}
          gap={node.props.gap}
          styleFlexBasis={node.props.styleFlexBasis}
          styleBackgroundColor={node.props.styleBackgroundColor}
          styleColor={node.props.styleColor}
          customCssClass={node.props.customCssClass}
          customElementId={node.props.customElementId}
        >
          {node.children.map((child) => (
            <BlockRenderer
              key={child.id}
              node={child}
              formSubmission={formSubmission}
              resolvePageUrl={resolvePageUrl}
            />
          ))}
        </Container>
      );
    case 'heading': {
      const level = node.props.level;
      const text = node.props.text;
      return (
        <Heading
          level={isHeadingLevel(level) ? level : 'h2'}
          text={typeof text === 'string' ? text : ''}
          styleSpaceBefore={node.props.styleSpaceBefore}
          styleSpaceAfter={node.props.styleSpaceAfter}
          styleTextColor={node.props.styleTextColor}
          styleTextColorCustom={node.props.styleTextColorCustom}
          styleFontSize={node.props.styleFontSize}
          styleFontWeight={node.props.styleFontWeight}
          styleFontFamily={node.props.styleFontFamily}
          styleLayer={node.props.styleLayer}
          styleHideDesktop={node.props.styleHideDesktop}
          styleHideTablet={node.props.styleHideTablet}
          styleHideMobile={node.props.styleHideMobile}
          styleTextAlign={node.props.styleTextAlign}
          editable={editing?.editable}
          onTextChange={editing?.onTextChange}
          onTextInput={editing?.onTextInput}
        />
      );
    }
    case 'richText': {
      const html = node.props.html;
      return (
        <RichText
          html={typeof html === 'string' ? html : ''}
          styleSpaceBefore={node.props.styleSpaceBefore}
          styleSpaceAfter={node.props.styleSpaceAfter}
          styleTextColor={node.props.styleTextColor}
          styleFontSize={node.props.styleFontSize}
          styleFontWeight={node.props.styleFontWeight}
          styleFontFamily={node.props.styleFontFamily}
          styleLayer={node.props.styleLayer}
          styleHideDesktop={node.props.styleHideDesktop}
          styleHideTablet={node.props.styleHideTablet}
          styleHideMobile={node.props.styleHideMobile}
          editable={editing?.editable}
          onHtmlChange={editing?.onHtmlChange}
          onHtmlInput={editing?.onHtmlInput}
        />
      );
    }
    case 'image': {
      const mediaRef = node.props.mediaRef;
      const alt = node.props.alt;
      return (
        <Image
          mediaRef={typeof mediaRef === 'string' ? mediaRef : ''}
          alt={typeof alt === 'string' ? alt : ''}
          styleSpaceBefore={node.props.styleSpaceBefore}
          styleSpaceAfter={node.props.styleSpaceAfter}
          styleLayer={node.props.styleLayer}
          styleHideDesktop={node.props.styleHideDesktop}
          styleHideTablet={node.props.styleHideTablet}
          styleHideMobile={node.props.styleHideMobile}
          styleSizePreset={node.props.styleSizePreset}
          styleWidth={node.props.styleWidth}
          styleHeight={node.props.styleHeight}
          styleObjectFit={node.props.styleObjectFit}
          styleAlign={node.props.styleAlign}
        />
      );
    }
    case 'button': {
      const label = node.props.label;
      const href = node.props.href;
      return (
        <Button
          label={typeof label === 'string' ? label : ''}
          href={typeof href === 'string' ? href : ''}
          styleSpaceBefore={node.props.styleSpaceBefore}
          styleSpaceAfter={node.props.styleSpaceAfter}
          styleTextColor={node.props.styleTextColor}
          styleFontSize={node.props.styleFontSize}
          styleFontWeight={node.props.styleFontWeight}
          styleFontFamily={node.props.styleFontFamily}
          styleLayer={node.props.styleLayer}
          styleHideDesktop={node.props.styleHideDesktop}
          styleHideTablet={node.props.styleHideTablet}
          styleHideMobile={node.props.styleHideMobile}
          editable={editing?.editable}
          onLabelChange={editing?.onLabelChange}
          onLabelInput={editing?.onLabelInput}
        />
      );
    }
    case 'form': {
      const formKey = node.props.formKey;
      const submission =
        typeof formKey === 'string' && formKey ? formSubmission?.(formKey) : undefined;
      return (
        <FormBlock formKey={formKey} submission={submission}>
          {node.children.map((child) => (
            <BlockRenderer key={child.id} node={child} />
          ))}
        </FormBlock>
      );
    }
    case 'form-field':
      return (
        <FormFieldBlock
          fieldType={node.props.fieldType}
          name={node.props.name}
          label={node.props.label}
          required={node.props.required}
          placeholder={node.props.placeholder}
          options={node.props.options}
          colSpan={node.props.colSpan}
        />
      );
    case 'form-submit':
      return (
        <FormSubmitBlock
          label={node.props.label}
          styleBackgroundColor={node.props.styleBackgroundColor}
          styleTextColor={node.props.styleTextColor}
        />
      );
    case 'navMenu':
      return (
        <NavMenuBlock>
          {node.children.map((child) => (
            <BlockRenderer
              key={child.id}
              node={child}
              resolvePageUrl={resolvePageUrl}
            />
          ))}
        </NavMenuBlock>
      );
    case 'navMenuItem': {
      const label = node.props.label;
      const pageGuid = node.props.pageGuid;
      const url = node.props.url;
      const target = node.props.target;
      const hasPageGuid = typeof pageGuid === 'string' && pageGuid.length > 0;
      return (
        <NavMenuItemBlock
          label={typeof label === 'string' ? label : ''}
          pageGuid={hasPageGuid ? pageGuid : undefined}
          url={typeof url === 'string' ? url : undefined}
          target={target === '_blank' ? '_blank' : '_self'}
          resolvedUrl={hasPageGuid ? resolvePageUrl?.(pageGuid) : undefined}
        />
      );
    }
    case 'globalRef': {
      // Foglia (ADR-55, `children.allow: []`): nessuna ricorsione sui figli, a differenza
      // di ogni altro `case` sopra che ne ha. La risoluzione nel contenuto vero della riga
      // `global_sections` referenziata è del job di export lato server — mai qui.
      const globalSectionGuid = node.props.globalSectionGuid;
      return (
        <GlobalRefBlock
          globalSectionGuid={typeof globalSectionGuid === 'string' ? globalSectionGuid : ''}
        />
      );
    }
    case 'accordion': {
      // Composizione a `children` (ADR-57 § 2): a differenza di ogni altro contenitore sopra,
      // i figli `accordionItem` non sono ricorsi genericamente via `<BlockRenderer>` — devono
      // ricevere `groupName` (l'attributo HTML `name` condiviso, presente solo quando
      // `exclusive:true`), che solo questo case, proprietario dell'intero gruppo di fratelli,
      // può calcolare. Ogni voce riceve comunque il proprio `BlockErrorBoundary` dedicato
      // (mai un unico boundary per l'intero accordion), stesso principio di ogni altro nodo
      // dell'albero.
      const exclusive = node.props.exclusive === true;
      const groupName = exclusive ? `accordion-${node.id}` : undefined;
      return (
        <AccordionBlock>
          {node.children.map((child) => (
            <BlockErrorBoundary key={child.id}>
              <AccordionItemBlock
                title={typeof child.props.title === 'string' ? child.props.title : ''}
                groupName={groupName}
              >
                {child.children.map((grandChild) => (
                  <BlockRenderer key={grandChild.id} node={grandChild} />
                ))}
              </AccordionItemBlock>
            </BlockErrorBoundary>
          ))}
        </AccordionBlock>
      );
    }
    case 'accordionItem':
      // Difensivo: un `accordionItem` valido nell'albero è sempre figlio di un `accordion`,
      // già gestito interamente dal case sopra — questo ramo copre solo un contenuto
      // malformato/legacy che lo porti fuori da quel contesto (mai un errore che abbatte la
      // pagina). Nessun genitore noto qui: nessun `groupName`, mai un'esclusività inventata.
      return (
        <AccordionItemBlock title={typeof node.props.title === 'string' ? node.props.title : ''}>
          {node.children.map((child) => (
            <BlockRenderer key={child.id} node={child} />
          ))}
        </AccordionItemBlock>
      );
    case 'tabs': {
      // Stesso principio di `case 'accordion'`: i figli `tabPanel` condividono un unico
      // `groupName` (l'attributo `name` dei radio del hack CSS) e solo il primo riceve
      // `defaultChecked` — entrambe informazioni note solo a chi possiede l'intero gruppo di
      // fratelli, mai al singolo figlio.
      const groupName = `tabs-${node.id}`;
      return (
        <TabsBlock>
          {node.children.map((child, index) => (
            <BlockErrorBoundary key={child.id}>
              <TabPanelBlock
                label={typeof child.props.label === 'string' ? child.props.label : ''}
                groupName={groupName}
                defaultChecked={index === 0}
              >
                {child.children.map((grandChild) => (
                  <BlockRenderer key={grandChild.id} node={grandChild} />
                ))}
              </TabPanelBlock>
            </BlockErrorBoundary>
          ))}
        </TabsBlock>
      );
    }
    case 'tabPanel':
      // Difensivo, stesso principio di `case 'accordionItem'`: un `tabPanel` fuori da un
      // `tabs` padre riceve un `groupName` tutto suo (nessun fratello con cui condividerlo)
      // e resta sempre aperto (`defaultChecked`), il comportamento meno sorprendente per un
      // pannello isolato.
      return (
        <TabPanelBlock
          label={typeof node.props.label === 'string' ? node.props.label : ''}
          groupName={`tabpanel-${node.id}`}
          defaultChecked
        >
          {node.children.map((child) => (
            <BlockRenderer key={child.id} node={child} />
          ))}
        </TabPanelBlock>
      );
    case 'carousel': {
      // `resolveCarouselTransition` (CarouselBlock.tsx): unico punto di calcolo della
      // transizione effettiva, riusata identica sia dal contenitore sia da ogni slide (mai
      // ricalcolata due volte, mai una divergenza fra le due).
      const transition = resolveCarouselTransition(node.props.autoplay, node.props.transition);
      const slideCount = node.children.length;
      return (
        <CarouselBlock transition={transition}>
          {node.children.map((child, index) => (
            <BlockErrorBoundary key={child.id}>
              <CarouselSlideBlock
                slideId={child.id}
                transition={transition}
                index={index}
                count={slideCount}
              >
                {child.children.map((grandChild) => (
                  <BlockRenderer key={grandChild.id} node={grandChild} />
                ))}
              </CarouselSlideBlock>
            </BlockErrorBoundary>
          ))}
        </CarouselBlock>
      );
    }
    case 'carouselSlide':
      // Difensivo, stesso principio di `case 'accordionItem'`/`case 'tabPanel'`: una slide
      // isolata non ha fratelli di cui conoscere il conteggio, quindi mai un'animazione di
      // loop (serve `index`/`count` del gruppo, noti solo al genitore) — resa come singola
      // slide statica.
      return (
        <CarouselSlideBlock slideId={node.id} transition="manual-scroll" index={0} count={1}>
          {node.children.map((child) => (
            <BlockRenderer key={child.id} node={child} />
          ))}
        </CarouselSlideBlock>
      );
    case 'modalTrigger': {
      const triggerLabel = node.props.triggerLabel;
      const animation = node.props.animation;
      return (
        <ModalTriggerBlock
          nodeId={node.id}
          triggerLabel={typeof triggerLabel === 'string' ? triggerLabel : ''}
          animation={animation === 'none' || animation === 'slide-down' ? animation : 'fade'}
        >
          {node.children.map((child) => (
            <BlockRenderer key={child.id} node={child} />
          ))}
        </ModalTriggerBlock>
      );
    }
    default:
      return null;
  }
}
