import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FormBlock from './FormBlock';

describe('FormBlock', () => {
  it('renderizza un elemento <form> con i figli e il formKey in data-attribute', () => {
    const html = renderToStaticMarkup(
      <FormBlock formKey="contatti-home">
        <p>Campo</p>
      </FormBlock>,
    );

    expect(html).toContain('<form');
    expect(html).toContain('data-form-key="contatti-home"');
    expect(html).toContain('<p>Campo</p>');
  });

  it('omette il data-attribute quando formKey non è una stringa valorizzata', () => {
    const html = renderToStaticMarkup(<FormBlock>{null}</FormBlock>);

    expect(html).not.toContain('data-form-key');
  });

  it('senza `submission` (Canvas admin) non inietta honeypot/firma/URL di invio', () => {
    const html = renderToStaticMarkup(
      <FormBlock formKey="contatti-home">
        <p>Campo</p>
      </FormBlock>,
    );

    expect(html).not.toContain('data-honeypot');
    expect(html).not.toContain('name="signature"');
    expect(html).not.toContain('data-submit-url');
  });

  it('con `submission` (F10-04) inietta honeypot a nome derivato, firma HMAC e URL di invio', () => {
    const html = renderToStaticMarkup(
      <FormBlock
        formKey="contatti-home"
        submission={{
          honeypotFieldName: 'a1b2c3d4e5f6',
          signature: 'deadbeef',
          submitUrl: 'https://api.example.com/api/v1/public/forms/contatti-home/submit',
        }}
      >
        <p>Campo</p>
      </FormBlock>,
    );

    expect(html).toContain('data-form-id="contatti-home"');
    expect(html).toContain(
      'data-submit-url="https://api.example.com/api/v1/public/forms/contatti-home/submit"',
    );
    expect(html).toContain('name="a1b2c3d4e5f6"');
    expect(html).toContain('data-honeypot="true"');
    expect(html).toContain('type="text"');
    expect(html).toContain('name="signature" value="deadbeef"');
    // Mai `type="hidden"` sul campo honeypot: deve restare un input reale, solo nascosto via CSS.
    const honeypotTag = html.match(/<input[^>]*data-honeypot="true"[^>]*>/)?.[0] ?? '';
    expect(honeypotTag).not.toContain('type="hidden"');
  });
});
