import { computeBlockRegistryToken, DEFAULT_BLOCK_REGISTRY } from '../../../src/blocks/block-registry';

/**
 * Copertura di registro (ADR-29/ADR-30, PLAN-F04c-editor-maturo.md T3):
 * l'invariante sui metadati d'editor e l'invarianza del token del registro
 * dopo l'aggiunta delle sette props di stile e dei metadati d'editor.
 */
describe('block-registry (unit) — invarianti di ADR-29/ADR-30', () => {
  // ─── Token del registro invariato (ADR-29 § 5) ─────────────────────────

  it('il token del registro resta invariato rispetto al valore pre-round: nessun "v" o "migrations" toccato dalle sette props di stile', () => {
    // Valore ricalcolato dopo ADR-39 (aggiunta di `container:1:0` al registro,
    // sesto tipo — dipende solo da type/v/migrations.length, MAI dalle props):
    // un cambiamento qui segnalerebbe un `v` incrementato per errore, non
    // l'aggiunta di un tipo intero (attesa e coperta da questo aggiornamento).
    expect(computeBlockRegistryToken(DEFAULT_BLOCK_REGISTRY)).toBe('808b3fb7');
  });

  // ─── Invariante metadati d'editor (ADR-30 § 4) ─────────────────────────

  it('ogni prop dichiarata da ogni BlockDefinition ha una voce corrispondente in meta.props (ADR-30 § 4: assenza = difetto, non default)', () => {
    const missing: Array<{ type: string; prop: string }> = [];

    for (const definition of DEFAULT_BLOCK_REGISTRY.definitions.values()) {
      const declaredProps = Object.keys(definition.props);
      const metaProps = definition.meta?.props ?? {};

      for (const propName of declaredProps) {
        if (!Object.prototype.hasOwnProperty.call(metaProps, propName)) {
          missing.push({ type: definition.type, prop: propName });
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('ogni voce di meta.props dichiara almeno una label non vuota', () => {
    const withoutLabel: Array<{ type: string; prop: string }> = [];

    for (const definition of DEFAULT_BLOCK_REGISTRY.definitions.values()) {
      const metaProps = definition.meta?.props ?? {};
      for (const [propName, propMeta] of Object.entries(metaProps)) {
        if (!propMeta.label || propMeta.label.trim().length === 0) {
          withoutLabel.push({ type: definition.type, prop: propName });
        }
      }
    }

    expect(withoutLabel).toEqual([]);
  });
});
