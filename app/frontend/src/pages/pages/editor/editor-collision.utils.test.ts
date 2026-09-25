import { beforeEach, describe, expect, it } from 'vitest';
import type { ClientRect, CollisionDescriptor, DroppableContainer } from '@dnd-kit/core';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import type { BlockNode } from './block-tree.utils';
import { editorCollisionDetection } from './editor-collision.utils';

function node(id: string, type: string, children: BlockNode[] = []): BlockNode {
  return { id, type, props: {}, children };
}

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function zone(id: string, parentId: string | null, index: number): DroppableContainer {
  return { id, data: { current: { parentId, index } } } as unknown as DroppableContainer;
}

interface Layout {
  rects: Map<string, ClientRect>;
  containers: DroppableContainer[];
}

/** Zone `before:`/`after:` (strisce di 10px ai bordi del blocco) di un figlio. */
function blockZones(
  layout: Layout,
  id: string,
  parentId: string | null,
  index: number,
  box: ClientRect,
): void {
  layout.containers.push(
    zone(`before:${id}`, parentId, index),
    zone(`after:${id}`, parentId, index + 1),
  );
  layout.rects.set(`before:${id}`, rect(box.left, box.top - 6, box.width, 10));
  layout.rects.set(`after:${id}`, rect(box.left, box.bottom - 4, box.width, 10));
}

function detect(
  layout: Layout,
  point: { x: number; y: number },
  active: { id: string; type: string },
): string[] {
  const collisions = editorCollisionDetection({
    active: { id: active.id, data: { current: { type: active.type } } },
    collisionRect: rect(point.x, point.y, 0, 0),
    droppableRects: layout.rects,
    droppableContainers: layout.containers,
    pointerCoordinates: point,
  } as unknown as Parameters<typeof editorCollisionDetection>[0]) as CollisionDescriptor[];
  return collisions.map((collision) => String(collision.id));
}

describe('editorCollisionDetection', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
  });

  it('sul corpo di un blocco radice risolve la fessura più vicina, non nessuna zona', () => {
    useBlockEditorStore
      .getState()
      .initTree([node('a', 'heading'), node('b', 'heading'), node('c', 'heading')]);
    const layout: Layout = { rects: new Map(), containers: [] };
    blockZones(layout, 'a', null, 0, rect(0, 0, 500, 40));
    blockZones(layout, 'b', null, 1, rect(0, 100, 500, 40));
    blockZones(layout, 'c', null, 2, rect(0, 200, 500, 40));

    // y=90: sotto il centro di `a` (20), sopra il centro di `b` (120) → prima di `b`.
    expect(detect(layout, { x: 250, y: 90 }, { id: 'new-block:heading', type: 'heading' })).toEqual(
      ['before:b'],
    );
    // Metà superiore di `c` → prima di `c`; metà inferiore → dopo `c`.
    expect(
      detect(layout, { x: 250, y: 205 }, { id: 'new-block:heading', type: 'heading' }),
    ).toEqual(['before:c']);
    expect(
      detect(layout, { x: 250, y: 236 }, { id: 'new-block:heading', type: 'heading' }),
    ).toEqual(['after:c']);
  });

  it('sotto l’ultimo blocco radice (e sopra il primo) risolve un rilascio in coda (in testa)', () => {
    useBlockEditorStore.getState().initTree([node('a', 'heading'), node('b', 'heading')]);
    const layout: Layout = { rects: new Map(), containers: [] };
    blockZones(layout, 'a', null, 0, rect(0, 100, 500, 40));
    blockZones(layout, 'b', null, 1, rect(0, 200, 500, 40));
    const heading = { id: 'new-block:heading', type: 'heading' };

    expect(detect(layout, { x: 250, y: 600 }, heading)).toEqual(['after:b']);
    expect(detect(layout, { x: 250, y: 10 }, heading)).toEqual(['before:a']);
  });

  it('una zona esplicita di inserimento in radice (inseritore di sezione) non viene scavalcata', () => {
    useBlockEditorStore.getState().initTree([node('a', 'section')]);
    const layout: Layout = { rects: new Map(), containers: [] };
    blockZones(layout, 'a', null, 0, rect(0, 0, 500, 100));
    layout.containers.push(zone('section-inserter:1', null, 1));
    layout.rects.set('section-inserter:1', rect(0, 110, 500, 20));

    expect(
      detect(layout, { x: 250, y: 120 }, { id: 'new-block:container', type: 'container' }),
    ).toEqual(['section-inserter:1']);
  });

  it('fuori dall’ingombro dei blocchi radice (es. sidebar) non risolve nessuna zona', () => {
    useBlockEditorStore.getState().initTree([node('a', 'heading')]);
    const layout: Layout = { rects: new Map(), containers: [] };
    blockZones(layout, 'a', null, 0, rect(300, 100, 500, 40));

    expect(
      detect(layout, { x: 100, y: 120 }, { id: 'new-block:heading', type: 'heading' }),
    ).toEqual([]);
  });

  it('dentro un contenitore con figli inserisce nei suoi children, alla fessura più vicina', () => {
    useBlockEditorStore
      .getState()
      .initTree([node('box', 'container', [node('x', 'heading'), node('y', 'heading')])]);
    const layout: Layout = { rects: new Map(), containers: [] };
    blockZones(layout, 'box', null, 0, rect(0, 0, 500, 300));
    layout.containers.push(zone('inside:box', 'box', 2));
    layout.rects.set('inside:box', rect(0, 0, 500, 300));
    blockZones(layout, 'x', 'box', 0, rect(10, 50, 480, 40));
    blockZones(layout, 'y', 'box', 1, rect(10, 150, 480, 40));

    expect(
      detect(layout, { x: 250, y: 120 }, { id: 'new-block:heading', type: 'heading' }),
    ).toEqual(['before:y']);
    expect(
      detect(layout, { x: 250, y: 260 }, { id: 'new-block:heading', type: 'heading' }),
    ).toEqual(['after:y']);
  });

  it('un contenitore vuoto risolve la propria zona "dentro"', () => {
    useBlockEditorStore.getState().initTree([node('box', 'container')]);
    const layout: Layout = { rects: new Map(), containers: [] };
    blockZones(layout, 'box', null, 0, rect(0, 0, 500, 100));
    layout.containers.push(zone('inside:box', 'box', 0));
    layout.rects.set('inside:box', rect(0, 0, 500, 100));

    expect(detect(layout, { x: 250, y: 50 }, { id: 'new-block:heading', type: 'heading' })).toEqual(
      ['inside:box'],
    );
  });

  it('trascinando un contenitore sopra sé stesso non resta incastrato nella propria zona', () => {
    useBlockEditorStore
      .getState()
      .initTree([node('a', 'heading'), node('box', 'container', [node('x', 'heading')])]);
    const layout: Layout = { rects: new Map(), containers: [] };
    blockZones(layout, 'a', null, 0, rect(0, 0, 500, 40));
    blockZones(layout, 'box', null, 1, rect(0, 100, 500, 200));
    layout.containers.push(zone('inside:box', 'box', 1));
    layout.rects.set('inside:box', rect(0, 100, 500, 200));
    blockZones(layout, 'x', 'box', 0, rect(10, 150, 480, 40));

    // Puntatore dentro `box` mentre si trascina `box`: `inside:box`/`x` non sono ammessi.
    const result = detect(layout, { x: 250, y: 250 }, { id: 'box', type: 'container' });
    expect(result).not.toContain('inside:box');
    expect(result).not.toContain('before:x');
    expect(result).not.toContain('after:x');
  });
});
