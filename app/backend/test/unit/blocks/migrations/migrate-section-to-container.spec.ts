import { migrateSectionToContainer } from '../../../../src/blocks/migrations/migrate-section-to-container';
import { MigratableBlockNode } from '../../../../src/blocks/migration/block-migration.types';

function sectionNode(
  props: Record<string, unknown>,
  children: MigratableBlockNode[] = [],
): MigratableBlockNode {
  return { id: 'sec', type: 'section', v: 1, props, children };
}

/**
 * `container` v2 dichiara `background: { stateful: true }`: la migrazione
 * avvolge sempre il valore in `{ normal: ... }` (ADR-75 § "Decisione" punto
 * 1). Estrae il ramo `normal` per confrontare solo il `BackgroundValue`.
 */
function backgroundNormal(result: MigratableBlockNode): unknown {
  return (result.props.background as Record<string, unknown>).normal;
}

/** Copertura della migrazione di identità cross-type `section` → `container` (ADR-82 § "Decisione" punto 3/4). */
describe('migrateSectionToContainer', () => {
  it('riscrive type/v: section v1 → container v2', () => {
    const result = migrateSectionToContainer(sectionNode({}));
    expect(result.type).toBe('container');
    expect(result.v).toBe(2);
  });

  it('children preservato byte-per-byte (stessa referenza, nessuna migrazione qui: compito del motore per-albero)', () => {
    const child = { id: 'child', type: 'heading', v: 1, props: {}, children: [] };
    const input = sectionNode({}, [child]);
    const result = migrateSectionToContainer(input);
    expect(result.children).toBe(input.children);
    expect(result.children[0]).toBe(child);
  });

  it('columns:"1" → layout.display:"flex"', () => {
    const result = migrateSectionToContainer(sectionNode({ columns: '1' }));
    const layout = result.props.layout as Record<string, Record<string, unknown>>;
    expect(layout.default.display).toBe('flex');
    expect(layout.default.gridTemplateColumns).toBeUndefined();
  });

  it('columns:"3" → layout.display:"grid", gridTemplateColumns preset repeat count 3 (columnRatio ignorato, columns !== "2")', () => {
    const result = migrateSectionToContainer(sectionNode({ columns: '3', columnRatio: '33-66' }));
    const layout = result.props.layout as Record<string, Record<string, unknown>>;
    expect(layout.default.display).toBe('grid');
    expect(layout.default.gridTemplateColumns).toEqual({ preset: 'repeat', count: 3 });
  });

  it('columns:"2" con columnRatio "33-66" → gridTemplateColumns esplicito a due tracce %', () => {
    const result = migrateSectionToContainer(sectionNode({ columns: '2', columnRatio: '33-66' }));
    const layout = result.props.layout as Record<string, Record<string, unknown>>;
    expect(layout.default.gridTemplateColumns).toEqual([
      { value: 33, unit: '%' },
      { value: 66, unit: '%' },
    ]);
  });

  it('alignItems (vocabolario flex) traduce a layout.alignItems (vocabolario grid)', () => {
    const result = migrateSectionToContainer(sectionNode({ alignItems: 'flex-end' }));
    const layout = result.props.layout as Record<string, Record<string, unknown>>;
    expect(layout.default.alignItems).toBe('end');
  });

  it('justifyContent passa invariato a layout.justify (stesso vocabolario)', () => {
    const result = migrateSectionToContainer(sectionNode({ justifyContent: 'space-between' }));
    const layout = result.props.layout as Record<string, Record<string, unknown>>;
    expect(layout.default.justify).toBe('space-between');
  });

  it('stylePaddingTop..Left (4 valori indipendenti) hanno priorità su stylePadding uniforme', () => {
    const result = migrateSectionToContainer(
      sectionNode({
        stylePadding: 'lg',
        stylePaddingTop: '8',
        stylePaddingRight: '8',
        stylePaddingBottom: '8',
        stylePaddingLeft: '8',
      }),
    );
    expect(result.props.padding).toEqual({
      default: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: true },
    });
  });

  it('solo stylePadding (token uniforme) mappa a un valore uniforme in px (none/sm/md/lg → 0/8/16/32)', () => {
    const result = migrateSectionToContainer(sectionNode({ stylePadding: 'md' }));
    expect(result.props.padding).toEqual({
      default: { top: 16, right: 16, bottom: 16, left: 16, unit: 'px', linked: true },
    });
  });

  it('le 9 prop ADR-50 hanno priorità sul token styleBackground quando presenti (type "color")', () => {
    const result = migrateSectionToContainer(
      sectionNode({
        styleBackground: 'accent',
        styleBackgroundType: 'color',
        styleBackgroundColor: '#123456',
      }),
    );
    expect(backgroundNormal(result)).toEqual({ type: 'color', color: '#123456' });
  });

  it('senza alcuna prop ADR-50, styleBackground token mappa a un colore letterale (subtle/accent/inverse/none)', () => {
    expect(
      backgroundNormal(migrateSectionToContainer(sectionNode({ styleBackground: 'subtle' }))),
    ).toEqual({
      type: 'color',
      color: '#f3f4f6',
    });
    expect(
      backgroundNormal(migrateSectionToContainer(sectionNode({ styleBackground: 'accent' }))),
    ).toEqual({
      type: 'color',
      color: { ref: 'accent' },
    });
    expect(
      backgroundNormal(migrateSectionToContainer(sectionNode({ styleBackground: 'inverse' }))),
    ).toEqual({
      type: 'color',
      color: '#111827',
    });
    expect(
      backgroundNormal(migrateSectionToContainer(sectionNode({ styleBackground: 'none' }))),
    ).toEqual({
      type: 'none',
    });
    expect(backgroundNormal(migrateSectionToContainer(sectionNode({})))).toEqual({ type: 'none' });
  });

  it('background gradiente: styleBackgroundType "gradient" con styleGradientStart/End', () => {
    const result = migrateSectionToContainer(
      sectionNode({
        styleBackgroundType: 'gradient',
        styleGradientStart: '#000000',
        styleGradientEnd: '#ffffff',
      }),
    );
    expect(backgroundNormal(result)).toEqual({
      type: 'gradient',
      gradient: {
        type: 'linear',
        angle: 180,
        stops: [
          { color: '#000000', at: 0 },
          { color: '#ffffff', at: 100 },
        ],
      },
    });
  });

  it('background immagine: styleBackgroundType "image" con styleBackgroundImageRef', () => {
    const result = migrateSectionToContainer(
      sectionNode({
        styleBackgroundType: 'image',
        styleBackgroundImageRef: '0123456789abcdef',
        styleBackgroundPosition: 'top left',
        styleBackgroundSize: 'contain',
      }),
    );
    expect(backgroundNormal(result)).toEqual({
      type: 'image',
      image: {
        mediaRef: '0123456789abcdef',
        position: 'top left',
        attachment: 'scroll',
        repeat: 'no-repeat',
        size: 'contain',
      },
    });
  });

  it('overlay presente aggiunge background.overlay', () => {
    const result = migrateSectionToContainer(
      sectionNode({
        styleBackgroundColor: '#000000',
        styleOverlayColor: '#ffffff',
        styleOverlayOpacity: 0.5,
      }),
    );
    expect((backgroundNormal(result) as Record<string, unknown>).overlay).toEqual({
      color: '#ffffff',
      opacity: 0.5,
    });
  });

  it('styleMarginTop..Left → margin: spacing (stessa regola enum-token di container)', () => {
    const result = migrateSectionToContainer(
      sectionNode({
        styleMarginTop: '16',
        styleMarginRight: '16',
        styleMarginBottom: '16',
        styleMarginLeft: '16',
      }),
    );
    expect(result.props.margin).toEqual({
      default: { top: 16, right: 16, bottom: 16, left: 16, unit: 'px', linked: true },
    });
  });

  it('styleLayer → position.zIndex (base/raised/overlay/top → 0/10/100/1000), position.type resta "default"', () => {
    expect(migrateSectionToContainer(sectionNode({ styleLayer: 'raised' })).props.position).toEqual(
      {
        type: 'default',
        zIndex: 10,
      },
    );
    expect(migrateSectionToContainer(sectionNode({ styleLayer: 'top' })).props.position).toEqual({
      type: 'default',
      zIndex: 1000,
    });
  });

  it('styleHideDesktop/Tablet/Mobile → hideOn', () => {
    const result = migrateSectionToContainer(sectionNode({ styleHideTablet: true }));
    expect(result.props.hideOn).toEqual(['tablet']);
  });

  it("styleBorder/styleShadow: valore invariato, avvolto nell'inviluppo stateful {normal:...} richiesto da container v2", () => {
    const border = { width: 2, style: 'solid', color: '#333', radius: 8 };
    const shadow = { x: 0, y: 2, blur: 4, spread: 0, color: '#000' };
    const result = migrateSectionToContainer(
      sectionNode({ styleBorder: border, styleShadow: shadow }),
    );
    expect(result.props.border).toEqual({ normal: border });
    expect(result.props.shadow).toEqual({ normal: shadow });
  });

  it('contentWidth/maxWidth → contentWidth/boxedWidth (boxed/full-width → boxed/full, maxWidth px table)', () => {
    expect(
      migrateSectionToContainer(sectionNode({ contentWidth: 'full-width' })).props.contentWidth,
    ).toBe('full');
    expect(
      migrateSectionToContainer(sectionNode({ contentWidth: 'boxed' })).props.contentWidth,
    ).toBe('boxed');
    expect(migrateSectionToContainer(sectionNode({ maxWidth: 'lg' })).props.boxedWidth).toEqual({
      value: 1280,
      unit: 'px',
    });
  });

  it('customCssClass/customElementId → cssClass/htmlId', () => {
    const result = migrateSectionToContainer(
      sectionNode({ customCssClass: 'hero', customElementId: 'main' }),
    );
    expect(result.props.cssClass).toBe('hero');
    expect(result.props.htmlId).toBe('main');
  });

  it("nessuna prop section sopravvive nell'output", () => {
    const result = migrateSectionToContainer(
      sectionNode({
        columns: '2',
        columnRatio: 'equal',
        stylePadding: 'md',
        styleBackground: 'accent',
        styleMarginTop: '8',
        styleLayer: 'base',
        styleHideDesktop: true,
        styleBorder: { width: 1, style: 'solid', color: '#000', radius: 0 },
        contentWidth: 'boxed',
        maxWidth: 'md',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'sm',
        customCssClass: 'x',
        customElementId: 'y',
      }),
    );
    for (const key of [
      'columns',
      'columnRatio',
      'stylePadding',
      'styleBackground',
      'styleMarginTop',
      'styleLayer',
      'styleHideDesktop',
      'styleBorder',
      'maxWidth',
      'alignItems',
      'justifyContent',
      'gap',
      'customCssClass',
      'customElementId',
    ]) {
      expect(result.props).not.toHaveProperty(key);
    }
  });

  it('props totalmente vuote producono comunque un output valido (funzione totale, ADR-21 § 3.6)', () => {
    expect(() => migrateSectionToContainer(sectionNode({}))).not.toThrow();
  });
});
