import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FormFieldBlock from './FormFieldBlock';

describe('FormFieldBlock', () => {
  it('renderizza un input di testo con etichetta e indicatore obbligatorio', () => {
    const html = renderToStaticMarkup(
      <FormFieldBlock fieldType="text" name="nome" label="Nome" required placeholder="Il tuo nome" />,
    );

    expect(html).toContain('<input');
    expect(html).toContain('type="text"');
    expect(html).toContain('name="nome"');
    expect(html).toContain('placeholder="Il tuo nome"');
    expect(html).toContain('Nome');
    expect(html).toContain('*');
  });

  it('renderizza un input email quando fieldType è "email"', () => {
    const html = renderToStaticMarkup(<FormFieldBlock fieldType="email" name="email" label="Email" />);

    expect(html).toContain('type="email"');
  });

  it('renderizza una textarea quando fieldType è "textarea"', () => {
    const html = renderToStaticMarkup(<FormFieldBlock fieldType="textarea" name="messaggio" label="Messaggio" />);

    expect(html).toContain('<textarea');
  });

  it('renderizza le opzioni CSV di un select', () => {
    const html = renderToStaticMarkup(
      <FormFieldBlock fieldType="select" name="area" label="Area" options="Nord,Centro,Sud" />,
    );

    expect(html).toContain('<select');
    expect(html).toContain('>Nord<');
    expect(html).toContain('>Centro<');
    expect(html).toContain('>Sud<');
  });

  it('renderizza una checkbox con la label affiancata', () => {
    const html = renderToStaticMarkup(
      <FormFieldBlock fieldType="checkbox" name="consenso" label="Accetto la privacy" required />,
    );

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('Accetto la privacy');
  });

  it('applica grid-column a 6 colonne quando colSpan.default è "6" (ADR-51)', () => {
    const html = renderToStaticMarkup(
      <FormFieldBlock fieldType="text" name="cognome" label="Cognome" colSpan={{ default: '6' }} />,
    );

    expect(html).toContain('colSpan_default_6');
    expect(html).not.toContain('colSpan_default_12');
  });

  it('ricade su 12 colonne (piena larghezza) quando colSpan è assente, comportamento identico al form pre-ADR-51', () => {
    const html = renderToStaticMarkup(
      <FormFieldBlock fieldType="text" name="cognome" label="Cognome" />,
    );

    expect(html).toContain('colSpan_default_12');
  });
});
