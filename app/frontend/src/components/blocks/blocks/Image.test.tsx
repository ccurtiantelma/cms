/**
 * Component test di `Image.tsx`: nessuna suite dedicata esisteva prima di questo file. Copre
 * il segnaposto senza `mediaRef` (SPEC-F02-blocchi.md § 3.5) e le 5 prop opzionali di
 * dimensionamento (ADR-58): `styleSizePreset`/`styleWidth`/`styleHeight`/`styleObjectFit`/
 * `styleAlign`. Stesso approccio di `Container.test.tsx` (`renderToStaticMarkup`, assert sulla
 * stringa `style="..."` prodotta) più `render`/`screen` di `@testing-library/react` dove serve
 * interrogare un attributo puntuale (`GlobalRefBlock.test.tsx`).
 */
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Image from './Image';

describe('Image', () => {
  describe('segnaposto senza mediaRef (SPEC-F02-blocchi.md § 3.5)', () => {
    it('mediaRef vuoto renderizza il segnaposto tratteggiato, mai un <img>', () => {
      render(<Image mediaRef="" alt="" />);

      expect(screen.getByText("Clicca o trascina un'immagine qui")).toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(document.querySelector('[data-block-role="image-placeholder"]')).not.toBeNull();
    });
  });

  describe('styleSizePreset = "custom" (ADR-58)', () => {
    it('styleWidth/styleHeight in px producono width/height inline coerenti coi value dichiarati', () => {
      const html = renderToStaticMarkup(
        <Image
          mediaRef="0123456789abcdef"
          alt="alt"
          styleSizePreset="custom"
          styleWidth={{ value: 350, unit: 'px' }}
          styleHeight={{ value: 200, unit: 'px' }}
        />,
      );

      expect(html).toContain('width:350px');
      expect(html).toContain('height:200px');
    });

    it('senza styleWidth/styleHeight (solo styleSizePreset="custom") non emette width/height/aspect-ratio', () => {
      const html = renderToStaticMarkup(<Image mediaRef="0123456789abcdef" alt="alt" styleSizePreset="custom" />);

      expect(html).not.toContain('width:');
      expect(html).not.toContain('height:');
      expect(html).not.toContain('aspect-ratio');
    });
  });

  describe('preset nominato (ADR-58, PRESET_ASPECT_RATIO display-only)', () => {
    it('styleSizePreset="card" imposta aspect-ratio:16 / 9 e data-media-preset="card"', () => {
      render(<Image mediaRef="0123456789abcdef" alt="alt" styleSizePreset="card" />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('data-media-preset', 'card');
      expect(img.style.aspectRatio).toBe('16 / 9');
    });

    it.each([
      ['thumbnail', '1 / 1'],
      ['hero', '21 / 9'],
      ['og', '1.91 / 1'],
    ])('styleSizePreset="%s" imposta aspect-ratio:%s', (preset, aspectRatio) => {
      render(<Image mediaRef="0123456789abcdef" alt="alt" styleSizePreset={preset} />);

      const img = screen.getByRole('img');
      expect(img.style.aspectRatio).toBe(aspectRatio);
      expect(img).toHaveAttribute('data-media-preset', preset);
    });
  });

  describe('styleSizePreset = "full" (default, comportamento invariato)', () => {
    it('styleSizePreset="full" non emette alcuno stile dimensionale né data-media-preset', () => {
      render(<Image mediaRef="0123456789abcdef" alt="alt" styleSizePreset="full" />);

      const img = screen.getByRole('img');
      expect(img).not.toHaveAttribute('data-media-preset');
      expect(img.style.width).toBe('');
      expect(img.style.height).toBe('');
      expect(img.style.aspectRatio).toBe('');
    });

    it('styleSizePreset assente (default implicito) si comporta come "full"', () => {
      render(<Image mediaRef="0123456789abcdef" alt="alt" />);

      const img = screen.getByRole('img');
      expect(img).not.toHaveAttribute('data-media-preset');
      expect(img.style.aspectRatio).toBe('');
    });
  });

  describe('styleAlign (ADR-58)', () => {
    it('styleAlign="center" produce margin-left:auto e margin-right:auto', () => {
      const html = renderToStaticMarkup(
        <Image mediaRef="0123456789abcdef" alt="alt" styleAlign="center" />,
      );

      expect(html).toContain('margin-left:auto');
      expect(html).toContain('margin-right:auto');
    });

    it('styleAlign="right" produce margin-left:auto e margin-right:0', () => {
      const html = renderToStaticMarkup(
        <Image mediaRef="0123456789abcdef" alt="alt" styleAlign="right" />,
      );

      expect(html).toContain('margin-left:auto');
      expect(html).toContain('margin-right:0');
    });

    it('styleAlign="left" (default) non emette alcun margin inline', () => {
      const html = renderToStaticMarkup(
        <Image mediaRef="0123456789abcdef" alt="alt" styleAlign="left" />,
      );

      expect(html).not.toContain('margin-left');
      expect(html).not.toContain('margin-right');
    });
  });

  it('renderToStaticMarkup (percorso SSR condiviso, ADR-22) non lancia con tutte e 5 le prop ADR-58 insieme', () => {
    expect(() =>
      renderToStaticMarkup(
        <Image
          mediaRef="0123456789abcdef"
          alt="alt"
          styleSizePreset="custom"
          styleWidth={{ value: 100, unit: '%' }}
          styleHeight={{ value: 50, unit: 'vh' }}
          styleObjectFit="contain"
          styleAlign="center"
        />,
      ),
    ).not.toThrow();
  });
});
