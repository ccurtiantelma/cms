import {
  computeBlockRegistryToken,
  DEFAULT_BLOCK_REGISTRY,
} from '../../../src/blocks/block-registry';

/**
 * Copertura di registro (ADR-29/ADR-30, PLAN-F04c-editor-maturo.md T3):
 * l'invariante sui metadati d'editor e l'invarianza del token del registro
 * dopo l'aggiunta delle sette props di stile e dei metadati d'editor.
 */
describe('block-registry (unit) — invarianti di ADR-29/ADR-30', () => {
  // ─── Token del registro invariato (ADR-29 § 5) ─────────────────────────

  it('il token del registro riflette il bump v2 di container/heading/richText/image/button più il ventesimo tipo gallery, non un cambiamento accidentale', () => {
    // Valore ricalcolato dopo l'aggiunta di `gallery` (ventesimo tipo,
    // `PLAN-parita-elementor-pro.md` § R4, `v: 1`/`migrations.length: 0`):
    // il token dipende solo da type/v/migrations.length di ogni definizione,
    // ordinate per `type` — un nuovo tipo cambia sempre il token, atteso da
    // questo aggiornamento, non un bump accidentale.
    expect(computeBlockRegistryToken(DEFAULT_BLOCK_REGISTRY)).toBe('fc3b8a25');
  });

  it("il registro contiene esattamente venti tipi dopo l'aggiunta di gallery (PLAN-parita-elementor-pro.md § R4)", () => {
    expect(DEFAULT_BLOCK_REGISTRY.definitions.size).toBe(20);
  });

  it.each(['accordion', 'tabs', 'carousel', 'modalTrigger', 'gallery'])(
    '%s (contenitore) è ammesso in ROOT_ALLOWED (ADR-57 § Decisione punto 1, gallery da PLAN-parita-elementor-pro.md § R4)',
    (type) => {
      expect(DEFAULT_BLOCK_REGISTRY.rootAllowed).toContain(type);
    },
  );

  it.each(['accordionItem', 'tabPanel', 'carouselSlide'])(
    '%s (voce) NON è ammesso in ROOT_ALLOWED, stesso trattamento di navMenuItem (ADR-57 § Decisione punto 2)',
    (type) => {
      expect(DEFAULT_BLOCK_REGISTRY.rootAllowed).not.toContain(type);
    },
  );

  it.each([
    ['accordion', ['accordionItem']],
    ['tabs', ['tabPanel']],
    ['carousel', ['carouselSlide']],
  ] as const)('%s dichiara children.allow: %j (ADR-57 § Decisione punto 2)', (type, allow) => {
    expect(DEFAULT_BLOCK_REGISTRY.definitions.get(type)?.children.allow).toEqual(allow);
  });

  it.each(['accordionItem', 'tabPanel', 'carouselSlide', 'modalTrigger'])(
    '%s dichiara children.allow limitato a heading/richText/image/button/container, mai un altro widget interattivo (ADR-57 § Decisione punto 2)',
    (type) => {
      expect(DEFAULT_BLOCK_REGISTRY.definitions.get(type)?.children.allow).toEqual([
        'heading',
        'richText',
        'image',
        'button',
        'container',
      ]);
    },
  );

  it.each([
    'accordion',
    'accordionItem',
    'tabs',
    'tabPanel',
    'carousel',
    'carouselSlide',
    'modalTrigger',
    'gallery',
  ])(
    '%s è a v:1, enabled:true, senza minRole (ADR-57 § Decisione punto 1, gallery da PLAN-parita-elementor-pro.md § R4)',
    (type) => {
      const definition = DEFAULT_BLOCK_REGISTRY.definitions.get(type);
      expect(definition?.v).toBe(1);
      expect(definition?.enabled).toBe(true);
      expect(definition?.minRole).toBeUndefined();
    },
  );

  it("gallery dichiara children.allow: ['image'], nessun tipo-figlio dedicato (PLAN-parita-elementor-pro.md § R4)", () => {
    expect(DEFAULT_BLOCK_REGISTRY.definitions.get('gallery')?.children.allow).toEqual(['image']);
  });

  it("'gallery' è ammessa in section.children.allow, stesso trattamento di accordion/tabs/carousel/modalTrigger", () => {
    expect(DEFAULT_BLOCK_REGISTRY.definitions.get('section')?.children.allow).toEqual(
      expect.arrayContaining(['gallery']),
    );
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
