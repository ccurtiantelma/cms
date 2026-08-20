/**
 * Dispatcher ricorsivo type → componente per l'albero di blocchi in sola
 * lettura (PLAN-F02-blocchi.md T8). Ogni nodo renderizzato è avvolto nel suo
 * proprio `BlockErrorBoundary`, non uno globale attorno all'intero albero.
 * Non rivalida le props (resta autorità del server, SPEC-F02-blocchi.md
 * § 5.3): consulta `BLOCK_TYPES` solo per sapere se un tipo è noto/abilitato
 * prima di scegliere il componente.
 */
import { BLOCK_TYPES } from '../../types/blocks.types';
import type { RenderableBlockNode } from './types';
import BlockErrorBoundary from './BlockErrorBoundary';
import Section from './blocks/Section';
import Heading from './blocks/Heading';
import RichText from './blocks/RichText';
import Image from './blocks/Image';
import Button from './blocks/Button';

const KNOWN_TYPES = new Map(BLOCK_TYPES.map((descriptor) => [descriptor.type, descriptor]));

/** `level` è già validato server-side contro l'enum del registro (`h2`-`h6`). */
function isHeadingLevel(value: unknown): value is 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  return typeof value === 'string' && ['h2', 'h3', 'h4', 'h5', 'h6'].includes(value);
}

interface BlockRendererProps {
  node: RenderableBlockNode;
}

/** Renderizza un nodo dell'albero e, ricorsivamente, i suoi figli ammessi. */
export default function BlockRenderer({ node }: BlockRendererProps) {
  const descriptor = KNOWN_TYPES.get(node.type);

  if (!descriptor || !descriptor.enabled) {
    return null;
  }

  return <BlockErrorBoundary>{renderNode(node)}</BlockErrorBoundary>;
}

function renderNode(node: RenderableBlockNode) {
  switch (node.type) {
    case 'section':
      return (
        <Section
          styleSpaceBefore={node.props.styleSpaceBefore}
          styleSpaceAfter={node.props.styleSpaceAfter}
          stylePadding={node.props.stylePadding}
          styleBackground={node.props.styleBackground}
        >
          {node.children.map((child) => (
            <BlockRenderer key={child.id} node={child} />
          ))}
        </Section>
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
        />
      );
    }
    default:
      return null;
  }
}
