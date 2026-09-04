import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import SeoSerpPreview from './SeoSerpPreview';
import SeoSocialPreview from './SeoSocialPreview';
import SeoJsonLdInspector from './SeoJsonLdInspector';

describe('SeoSerpPreview', () => {
  it('mostra titolo/description entro soglia senza indicatore di superamento', () => {
    renderWithProviders(
      <SeoSerpPreview
        title="Titolo breve"
        description="Descrizione breve entro la soglia consigliata."
        url="https://example.com/pagina"
      />,
    );

    expect(screen.getByText('Titolo breve')).toBeInTheDocument();
    expect(screen.getByText('Descrizione breve entro la soglia consigliata.')).toBeInTheDocument();
    expect(screen.queryByText(/verrà troncato/)).not.toBeInTheDocument();
  });

  it('mostra titolo e description lunghi senza spostare i contatori nell’anteprima', () => {
    const longTitle = 'T'.repeat(61);
    const longDescription = 'D'.repeat(161);
    renderWithProviders(
      <SeoSerpPreview
        title={longTitle}
        description={longDescription}
        url="https://example.com/pagina"
      />,
    );

    expect(screen.getByText(longTitle)).toBeInTheDocument();
    expect(screen.getByText(longDescription)).toBeInTheDocument();
    expect(screen.queryByText(/verrà troncato/)).not.toBeInTheDocument();
  });

  it('si aggiorna quando le prop cambiano (componente controllato)', () => {
    const { rerender } = renderWithProviders(
      <SeoSerpPreview
        title="Primo titolo"
        description="Prima descrizione"
        url="https://example.com/a"
      />,
    );
    expect(screen.getByText('Primo titolo')).toBeInTheDocument();

    rerender(
      <SeoSerpPreview
        title="Secondo titolo"
        description="Seconda descrizione"
        url="https://example.com/b"
      />,
    );
    expect(screen.getByText('Secondo titolo')).toBeInTheDocument();
    expect(screen.queryByText('Primo titolo')).not.toBeInTheDocument();
  });
});

describe('SeoSocialPreview', () => {
  it('mostra il placeholder quando l’immagine è assente', () => {
    renderWithProviders(
      <SeoSocialPreview title="Titolo OG" description="Descrizione OG" domain="example.com" />,
    );

    expect(screen.getByLabelText('Nessuna immagine Open Graph')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '' })).not.toBeInTheDocument();
  });

  it('mostra dominio, titolo e description quando presenti', () => {
    renderWithProviders(
      <SeoSocialPreview
        title="Titolo OG"
        description="Descrizione OG"
        image="https://example.com/cover.jpg"
        domain="example.com"
      />,
    );

    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('Titolo OG')).toBeInTheDocument();
    expect(screen.getByText('Descrizione OG')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nessuna immagine Open Graph')).not.toBeInTheDocument();
  });
});

describe('SeoJsonLdInspector', () => {
  it('con FAQ vuota produce solo WebPage nel JSON', () => {
    renderWithProviders(
      <SeoJsonLdInspector pageTitle="Titolo pagina" description="Descrizione" faq={[]} />,
    );

    const code = screen.getByText(/"@type": "WebPage"/);
    expect(code).toBeInTheDocument();
    expect(screen.queryByText(/"@type": "FAQPage"/)).not.toBeInTheDocument();
  });

  it('con FAQ non vuota produce anche FAQPage', () => {
    renderWithProviders(
      <SeoJsonLdInspector
        pageTitle="Titolo pagina"
        description="Descrizione"
        faq={[{ question: 'Domanda?', answer: 'Risposta.' }]}
      />,
    );

    expect(screen.getByText(/"@type": "FAQPage"/)).toBeInTheDocument();
    expect(screen.getByText(/"name": "Domanda\?"/)).toBeInTheDocument();
  });

  it('manualStructuredData con chiave che collide vince sul generato', () => {
    renderWithProviders(
      <SeoJsonLdInspector
        pageTitle="Titolo pagina"
        description="Descrizione"
        faq={[]}
        manualStructuredData={{ '@context': 'https://manual.example.com' }}
      />,
    );

    expect(screen.getByText(/"@context": "https:\/\/manual\.example\.com"/)).toBeInTheDocument();
    expect(screen.queryByText(/"@context": "https:\/\/schema\.org"/)).not.toBeInTheDocument();
  });

  it('mostra il badge "Valid Schema.org" quando la struttura minima è presente', () => {
    renderWithProviders(
      <SeoJsonLdInspector pageTitle="Titolo pagina" description="Descrizione" faq={[]} />,
    );

    expect(screen.getByText('Valid Schema.org')).toBeInTheDocument();
  });
});
