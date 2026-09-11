import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Section from './Section';

/**
 * Lettura diretta da filesystem, non `import … from './Section.module.css?raw'`: sotto
 * Vitest (`vitest.config.ts`, `test.css: false`) qualunque import che termina in
 * `.module.css` risolve al Proxy di classi hashate a prescindere dalla query string — lo
 * stesso limite documentato in `style-tokens.test.ts`, non aggirabile con `?raw`.
 * `process.cwd()`, non `import.meta.url`: sotto `environment: 'jsdom'` quest'ultimo risolve
 * a un'origine fittizia del browser (`http://…`), non a un percorso `file://` reale.
 */
const sectionCss = readFileSync(
  resolve(process.cwd(), 'src/components/blocks/blocks/Section.module.css'),
  'utf-8',
);
const tokenCss = readFileSync(
  resolve(process.cwd(), 'src/components/blocks/style-tokens.module.css'),
  'utf-8',
);

/**
 * Collassa spazi/interruzioni di riga in un singolo spazio, cosi le asserzioni su CSS letto
 * da filesystem verificano le dichiarazioni, non la formattazione: `npm run format` (prettier)
 * puo espandere una regola da riga singola a multi-riga senza cambiarne il significato (vedi
 * commit 5d0af8e), e un'asserzione `toContain` su una stringa esatta multi-riga si romperebbe
 * comunque.
 */
const normalizeCss = (css: string): string => css.replace(/\s+/g, ' ').trim();

describe('Section', () => {
  it('renderizza il colore di sfondo nell attributo style', () => {
    const html = renderToStaticMarkup(<Section styleBackgroundColor="#123456">Contenuto</Section>);

    expect(html).toContain('style="background-color:#123456"');
  });

  /**
   * T8 (SPEC-F04-grid-responsive-engine.md § 6): il renderer deve emettere **una classe per
   * ogni breakpoint presente nel valore salvato**, mai solo `default` — vincolo esplicito di
   * ADR-29 Conseguenza / ADR-31 Conseguenza. Un renderer che ignora `tablet`/`mobile` perde
   * silenziosamente contenuto già salvato in bozze precedenti.
   */
  describe('props di layout a colonne responsive (ADR-31, T8)', () => {
    it('columns con tutti e tre i breakpoint produce le tre classi corrispondenti, non solo default', () => {
      const html = renderToStaticMarkup(
        <Section columns={{ default: '2', tablet: '3', mobile: '1' }}>Contenuto</Section>,
      );

      expect(html).toContain('columns_default_2');
      expect(html).toContain('columns_tablet_3');
      expect(html).toContain('columns_mobile_1');
    });

    it('gap con tutti e tre i breakpoint produce le tre classi corrispondenti, non solo default', () => {
      const html = renderToStaticMarkup(
        <Section gap={{ default: 'lg', tablet: 'md', mobile: 'sm' }}>Contenuto</Section>,
      );

      expect(html).toContain('gap_default_lg');
      expect(html).toContain('gap_tablet_md');
      expect(html).toContain('gap_mobile_sm');
    });

    it('alignItems con tutti e tre i breakpoint produce le tre classi corrispondenti, non solo default', () => {
      const html = renderToStaticMarkup(
        <Section alignItems={{ default: 'center', tablet: 'flex-start', mobile: 'flex-end' }}>
          Contenuto
        </Section>,
      );

      expect(html).toContain('alignItems_default_center');
      expect(html).toContain('alignItems_tablet_flex-start');
      expect(html).toContain('alignItems_mobile_flex-end');
    });

    it('solo `default` presente → solo la classe default, mai tablet/mobile inventate', () => {
      const html = renderToStaticMarkup(<Section columns={{ default: '4' }}>Contenuto</Section>);

      expect(html).toContain('columns_default_4');
      expect(html).not.toContain('columns_tablet_');
      expect(html).not.toContain('columns_mobile_');
    });
  });

  /** ADR-50: `styleBackgroundType` sceglie la sorgente di sfondo, mai due sorgenti insieme. */
  describe('ADR-50 — styleBackgroundType, posizione/dimensione sfondo, gradiente', () => {
    it('overlay: colore e opacità applicati come proprietà separate, mai un rgba() composto', () => {
      const html = renderToStaticMarkup(
        <Section styleOverlayColor="#000000" styleOverlayOpacity={0.4}>
          Contenuto
        </Section>,
      );

      expect(html).toContain('background-color:#000000');
      expect(html).toContain('opacity:0.4');
      expect(html).not.toContain('rgba(');
    });

    it('type "image": bgImage/bgPosition/bgSize configurabili, non più fissi a center/cover', () => {
      const html = renderToStaticMarkup(
        <Section
          styleBackgroundType="image"
          styleBackgroundImageRef="a1b2c3d4e5f6a1b2"
          styleBackgroundPosition="top left"
          styleBackgroundSize="contain"
        >
          Contenuto
        </Section>,
      );

      expect(html).toContain('background-image:url(');
      expect(html).toContain('a1b2c3d4e5f6a1b2');
      expect(html).toContain('background-position:top left');
      expect(html).toContain('background-size:contain');
    });

    it('type "image" assente ma bgImage presente (contenuto pre-ADR-50): l\'immagine resta visibile', () => {
      const html = renderToStaticMarkup(
        <Section styleBackgroundImageRef="a1b2c3d4e5f6a1b2">Contenuto</Section>,
      );

      expect(html).toContain('background-image:url(');
      expect(html).toContain('background-position:center center');
      expect(html).toContain('background-size:cover');
    });

    it('type "color" esplicito: bgImage dichiarato ma ignorato dal renderer', () => {
      const html = renderToStaticMarkup(
        <Section styleBackgroundType="color" styleBackgroundImageRef="a1b2c3d4e5f6a1b2">
          Contenuto
        </Section>,
      );

      expect(html).not.toContain('background-image');
    });

    it('type "gradient": linear-gradient applicato solo con entrambi gli stop presenti', () => {
      const html = renderToStaticMarkup(
        <Section
          styleBackgroundType="gradient"
          styleGradientStart="#111111"
          styleGradientEnd="#eeeeee"
        >
          Contenuto
        </Section>,
      );

      expect(html).toContain('background-image:linear-gradient(135deg, #111111, #eeeeee)');
    });

    it('type "gradient" con un solo stop: nessun gradiente emesso', () => {
      const html = renderToStaticMarkup(
        <Section styleBackgroundType="gradient" styleGradientStart="#111111">
          Contenuto
        </Section>,
      );

      expect(html).not.toContain('background-image');
    });
  });

  /** Le otto prop di spaziatura per lato e `contentWidth` restano invariate (ADR-33), qui solo
   *  a riprova che l'estensione ADR-50 non le ha toccate. */
  describe('spaziatura verticale e larghezza contenuto (ADR-33, invariate)', () => {
    it('stylePaddingTop/stylePaddingBottom producono le classi token corrispondenti', () => {
      const html = renderToStaticMarkup(
        <Section stylePaddingTop={{ default: '48' }} stylePaddingBottom={{ default: '96' }}>
          Contenuto
        </Section>,
      );

      expect(html).toContain('paddingTop_default_48');
      expect(html).toContain('paddingBottom_default_96');
    });

    it('contentWidth "boxed" produce la classe contentWidth corrispondente', () => {
      const html = renderToStaticMarkup(<Section contentWidth="boxed">Contenuto</Section>);

      expect(html).toContain('contentWidth_boxed');
    });
  });

  /**
   * Test di regressione RFC-58 T6 (Punto 3, prima metà): `ADR-33 § 1` dichiara
   * "`maxWidth` è ignorato dal renderer quando `contentWidth = full-width`" — comportamento
   * verificato corretto in `Section.tsx` riga 176 (`isFullWidth ? '' :
   * resolveScalarClassName(...)`), finora privo di un'asserzione esplicita. Questo componente
   * è l'unico file sorgente sia per l'editor (`EditorBlockWrapper.tsx` lo importa direttamente,
   * `CONTAINER_COMPONENTS`) sia per il consumer SSR pubblico (`app/public-site`, alias `@blocks`
   * su `entry-server.tsx` → `App.tsx` → `PageView.tsx` → `BlockRenderer.tsx`): un test qui
   * copre entrambe le superfici. Vedi anche
   * `app/public-site/test/section-container-layout-regression.spec.tsx` per l'asserzione
   * equivalente sull'HTML SSR reale (classi hashate dai CSS Modules, pipeline diversa da questa).
   */
  describe('ADR-33 § 1 — maxWidth ignorato quando contentWidth è full-width (RFC-58 T6)', () => {
    it('contentWidth "full-width" con maxWidth valorizzato: nessuna classe maxWidth_* emessa', () => {
      const html = renderToStaticMarkup(
        <Section contentWidth="full-width" maxWidth="lg">
          Contenuto
        </Section>,
      );

      expect(html).toContain('contentWidth_full-width');
      expect(html).not.toContain('maxWidth_lg');
      expect(html).not.toMatch(/maxWidth_/);
    });

    /**
     * Controllo di sensibilità: senza questo secondo caso, il test sopra passerebbe anche se
     * `resolveScalarClassName` per `maxWidth` fosse rotto in generale (es. mai emesso, in
     * qualunque combinazione) — non solo nel caso `full-width` che ADR-33 § 1 prescrive.
     */
    it('la stessa maxWidth "lg" produce la classe corrispondente quando contentWidth è "boxed"', () => {
      const html = renderToStaticMarkup(
        <Section contentWidth="boxed" maxWidth="lg">
          Contenuto
        </Section>,
      );

      expect(html).toContain('maxWidth_lg');
    });
  });

  /**
   * Regressione overflow orizzontale (footer pubblico a 4 colonne): asserzioni sul CSS
   * sorgente via import `?raw`, non su HTML reso — sotto Vitest (`vitest.config.ts`,
   * `test.css: false`) le regole delle classi CSS Modules non sono osservabili dall'HTML
   * prodotto da `renderToStaticMarkup` (nessun `<style>` iniettato, nessun layout jsdom
   * reale). È lo stesso limite già documentato in `style-tokens.test.ts` per il mock di
   * `resolveResponsiveClassNames`.
   */
  describe('anti-overflow orizzontale — griglia a colonne e testo lungo', () => {
    it('ogni traccia di columns_* usa minmax(0, 1fr), mai 1fr da solo', () => {
      const normalized = normalizeCss(tokenCss);
      expect(normalized).not.toMatch(/grid-template-columns:\s*repeat\(\d,\s*1fr\)/);
      expect(normalized).toContain('repeat(2, minmax(0, 1fr))');
      expect(normalized).toContain('repeat(3, minmax(0, 1fr))');
      expect(normalized).toContain('repeat(4, minmax(0, 1fr))');
    });

    it('ogni columnRatio_* asimmetrico usa minmax(0, Nfr) su entrambe le tracce', () => {
      const normalized = normalizeCss(tokenCss);
      expect(normalized).toContain(
        '.columnRatio_33-66 { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }',
      );
      expect(normalized).toContain(
        '.columnRatio_66-33 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }',
      );
      expect(normalized).toContain(
        '.columnRatio_30-70 { grid-template-columns: minmax(0, 3fr) minmax(0, 7fr); }',
      );
      expect(normalized).toContain(
        '.columnRatio_70-30 { grid-template-columns: minmax(0, 7fr) minmax(0, 3fr); }',
      );
    });

    it('.section azzera il proprio min-width e spezza il testo troppo lungo per la propria colonna', () => {
      const normalized = normalizeCss(sectionCss);
      expect(normalized).toMatch(/\.section\s*{[^}]*min-width:\s*0;/);
      expect(normalized).toMatch(/\.section\s*{[^}]*overflow-wrap:\s*anywhere;/);
      expect(normalized).toMatch(/\.section\s*{[^}]*word-break:\s*break-word;/);
    });
  });
});
