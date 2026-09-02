import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FormSubmitBlock from './FormSubmitBlock';

describe('FormSubmitBlock', () => {
  it('renderizza un pulsante di invio con il testo personalizzato', () => {
    const html = renderToStaticMarkup(<FormSubmitBlock label="Invia richiesta" />);

    expect(html).toContain('<button');
    expect(html).toContain('type="submit"');
    expect(html).toContain('Invia richiesta');
  });

  it('usa "Invia" come testo di default quando label è assente', () => {
    const html = renderToStaticMarkup(<FormSubmitBlock />);

    expect(html).toContain('Invia');
  });
});
