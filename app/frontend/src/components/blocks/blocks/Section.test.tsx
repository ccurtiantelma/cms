import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Section from './Section';

describe('Section', () => {
  it('renderizza il colore di sfondo nell attributo style', () => {
    const html = renderToStaticMarkup(
      <Section styleBackgroundColor="#123456">Contenuto</Section>,
    );

    expect(html).toContain('style="background-color:#123456"');
  });
});