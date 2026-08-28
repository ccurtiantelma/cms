import type { BlockNode } from './block-tree.utils';

/** Payload serializzabile di un preset salvato localmente. */
export interface BlockPresetDto {
  name: string;
  node: BlockNode;
}

function cloneNode(node: BlockNode): BlockNode {
  return {
    id: node.id,
    type: node.type,
    props: structuredClone(node.props),
    children: node.children.map(cloneNode),
  };
}

function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = character === 'x' ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

/** Serializza un nodo senza mutare né condividere il suo albero originale. */
export function serializePreset(node: BlockNode, name: string): BlockPresetDto {
  return { name: name.trim(), node: cloneNode(node) };
}

/** Istanzia un preset con un nuovo UUID v4 per ogni nodo dell’albero. */
export function instantiatePreset(preset: BlockPresetDto): BlockNode {
  function instantiate(node: BlockNode): BlockNode {
    return {
      id: generateUuidV4(),
      type: node.type,
      props: structuredClone(node.props),
      children: node.children.map(instantiate),
    };
  }

  return instantiate(preset.node);
}