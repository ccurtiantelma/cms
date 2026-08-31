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
import ContentPlaceholderBlock, { CONTENT_AREA_BLOCK_ID } from './blocks/ContentPlaceholderBlock';

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

interface BlockRendererProps {
  node: RenderableBlockNode;
  /** Vedi {@link BlockEditingProps} e il commento di testa del file. */
  editing?: BlockEditingProps;
}

/** Renderizza un nodo dell'albero e, ricorsivamente, i suoi figli ammessi. */
export default function BlockRenderer({ node, editing }: BlockRendererProps) {
  const descriptor = KNOWN_TYPES.get(node.type);

  if (!descriptor || !descriptor.enabled) {
    return null;
  }

  return <BlockErrorBoundary>{renderNode(node, editing)}</BlockErrorBoundary>;
}

function renderNode(node: RenderableBlockNode, editing: BlockEditingProps | undefined) {
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
        >
          {node.children.map((child) => (
            <BlockRenderer key={child.id} node={child} />
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
              <BlockRenderer key={child.id} node={child} />
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
            <BlockRenderer key={child.id} node={child} />
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
          styleFontSize={node.props.styleFontSize}
          styleFontWeight={node.props.styleFontWeight}
          styleFontFamily={node.props.styleFontFamily}
          styleLayer={node.props.styleLayer}
          styleHideDesktop={node.props.styleHideDesktop}
          styleHideTablet={node.props.styleHideTablet}
          styleHideMobile={node.props.styleHideMobile}
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
    default:
      return null;
  }
}
