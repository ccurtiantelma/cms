/**
 * Round-trip di `static-section-presets.json` contro il registro corrente (ADR-34 §
 * Conseguenza): `resolvePresetSubtree` non valida i valori delle prop, solo la loro
 * presenza per tipo noto — un preset con un `value` enum non più ammesso, una prop
 * obbligatoria dimenticata, o un figlio non ammesso dal `childrenAllow` del genitore
 * supererebbe comunque i controlli client di `insertSubtreeAction` (che verificano solo
 * containment del nodo radice e conteggio nodi) e fallirebbe solo al salvataggio
 * server-side. Questo file è la rete che intercetta un preset disallineato dal registro
 * (dopo una futura evoluzione dello schema blocchi, ADR-21) prima che arrivi a un utente.
 */
import { describe, it, expect } from 'vitest';
import { canContainType, resolvePresetSubtree, type SectionPreset } from './block-registry.utils';
import { BLOCK_TYPES, ROOT_ALLOWED } from '../../../types/blocks.types';
import rawPresets from './static-section-presets.json';

const PRESETS = rawPresets as SectionPreset[];

/** Percorre un sottoalbero di preset applicando `visit` a ogni nodo, genitore incluso. */
function walk(
  node: SectionPreset['subtree'],
  parentType: string | undefined,
  visit: (node: SectionPreset['subtree'], parentType: string | undefined) => void,
): void {
  visit(node, parentType);
  for (const child of node.children) walk(child, node.type, visit);
}

describe('static-section-presets.json — round-trip contro BLOCK_TYPES', () => {
  it('ogni preset esiste ed espone una radice e un\'etichetta', () => {
    expect(PRESETS.length).toBeGreaterThan(0);
    for (const preset of PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.subtree).toBeDefined();
    }
  });

  it('la radice di ogni preset è un tipo ammesso in ROOT_ALLOWED', () => {
    for (const preset of PRESETS) {
      expect(ROOT_ALLOWED as readonly string[]).toContain(preset.subtree.type);
    }
  });

  it('resolvePresetSubtree risolve ogni preset senza eccezioni (nessun tipo fuori registro)', () => {
    for (const preset of PRESETS) {
      expect(() => resolvePresetSubtree(preset.subtree)).not.toThrow();
    }
  });

  it('ogni figlio dichiarato è ammesso dal childrenAllow del proprio genitore (mai section dentro section)', () => {
    for (const preset of PRESETS) {
      walk(preset.subtree, undefined, (node, parentType) => {
        if (parentType !== undefined) {
          expect(canContainType(parentType, node.type)).toBe(true);
        }
      });
    }
  });

  it('ogni prop obbligatoria senza default è valorizzata esplicitamente dal preset', () => {
    for (const preset of PRESETS) {
      walk(preset.subtree, undefined, (node) => {
        const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
        expect(descriptor).toBeDefined();
        for (const prop of descriptor!.props) {
          if (prop.required && prop.default === undefined) {
            expect(node.props).toHaveProperty(prop.name);
            expect(node.props[prop.name]).not.toBe('');
          }
        }
      });
    }
  });

  it('ogni valore di prop enum dichiarato è fra i values ammessi dal descrittore corrente', () => {
    for (const preset of PRESETS) {
      walk(preset.subtree, undefined, (node) => {
        const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
        for (const [propName, value] of Object.entries(node.props)) {
          const propDescriptor = descriptor?.props.find((entry) => entry.name === propName);
          if (propDescriptor?.kind === 'enum' && propDescriptor.values) {
            const values = propDescriptor.responsive && value && typeof value === 'object'
              ? Object.values(value)
              : [value];
            for (const token of values) expect(propDescriptor.values).toContain(token);
          }
        }
      });
    }
  });
});
