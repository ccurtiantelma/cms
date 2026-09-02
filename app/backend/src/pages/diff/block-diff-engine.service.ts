import { Injectable } from '@nestjs/common';
import { BlockNode } from '../content-tree';

/**
 * Una singola variazione su un nodo modificato: `field` è `'type'`, il nome
 * di una chiave di `props`, oppure `'children'` per un riordinamento dei
 * figli (business-rules.md § Revisioni, regola 4: "blocchi aggiunti,
 * rimossi, modificati, spostati" — lo spostamento è la variazione del campo
 * `children`, non un evento a parte).
 */
export interface PropertyDiff {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Esito del confronto strutturale fra due alberi blocchi, piatto rispetto
 * alla profondità: `added`/`removed`/`modified`/`unchanged` elencano `id` di
 * nodo a qualunque livello dell'albero, non solo le radici.
 */
export interface BlockDiffResult {
  added: string[];
  removed: string[];
  modified: Record<string, PropertyDiff[]>;
  unchanged: string[];
}

interface FlatNode {
  node: BlockNode;
  childIds: string[];
}

/**
 * Motore di comparazione strutturale fra due alberi di blocchi (F07-01,
 * business-rules.md § Revisioni, regola 4). Confronta per `id` di nodo:
 * l'albero non porta un campo `label` a livello di nodo persistito (`label`
 * è metadato del registro tipi, non del contenuto — verificato su
 * `content-tree.ts`/`prop-spec.types.ts`), quindi la variazione richiesta
 * su "type, label, props" è implementata su `type` e `props`; un'eventuale
 * label editoriale, se introdotta in futuro, arriverebbe come una chiave di
 * `props` come ogni altro campo e sarebbe già coperta dal confronto per
 * chiave. Assunzione dichiarata per iscritto (CLAUDE.md § Anti-hallucination).
 */
@Injectable()
export class BlockDiffEngineService {
  /**
   * Confronta due alberi blocchi e ritorna l'esito piatto. Non muta gli
   * argomenti, sola lettura.
   */
  compareTrees(sourceTree: BlockNode[], targetTree: BlockNode[]): BlockDiffResult {
    const sourceFlat = this.flatten(sourceTree);
    const targetFlat = this.flatten(targetTree);

    const added: string[] = [];
    const removed: string[] = [];
    const modified: Record<string, PropertyDiff[]> = {};
    const unchanged: string[] = [];

    for (const id of targetFlat.keys()) {
      if (!sourceFlat.has(id)) added.push(id);
    }
    for (const id of sourceFlat.keys()) {
      if (!targetFlat.has(id)) removed.push(id);
    }

    for (const [id, sourceEntry] of sourceFlat) {
      const targetEntry = targetFlat.get(id);
      if (!targetEntry) continue;

      const diffs = this.diffNode(sourceEntry, targetEntry);
      if (diffs.length > 0) {
        modified[id] = diffs;
      } else {
        unchanged.push(id);
      }
    }

    return { added, removed, modified, unchanged };
  }

  /** Confronto per nodo: `type`, ogni chiave di `props`, ordine dei `children`. */
  private diffNode(source: FlatNode, target: FlatNode): PropertyDiff[] {
    const diffs: PropertyDiff[] = [];

    if (source.node.type !== target.node.type) {
      diffs.push({ field: 'type', before: source.node.type, after: target.node.type });
    }

    const propKeys = new Set([
      ...Object.keys(source.node.props ?? {}),
      ...Object.keys(target.node.props ?? {}),
    ]);
    for (const key of propKeys) {
      const before = source.node.props?.[key];
      const after = target.node.props?.[key];
      if (!deepEqual(before, after)) {
        diffs.push({ field: `props.${key}`, before, after });
      }
    }

    if (!arrayEqual(source.childIds, target.childIds)) {
      diffs.push({ field: 'children', before: source.childIds, after: target.childIds });
    }

    return diffs;
  }

  /** Appiattisce l'albero in `id → { node, childIds }`, ricorsivo a qualunque profondità. */
  private flatten(tree: BlockNode[]): Map<string, FlatNode> {
    const flat = new Map<string, FlatNode>();
    const visit = (nodes: BlockNode[]): void => {
      for (const node of nodes) {
        flat.set(node.id, { node, childIds: node.children.map((child) => child.id) });
        visit(node.children);
      }
    };
    visit(tree);
    return flat;
  }
}

function arrayEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const key of keys) {
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}
