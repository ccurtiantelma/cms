import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { DEFAULT_THEME_CONFIG } from '../../frontend/src/theme';

describe('PageView', () => {
  it('inietta le variabili del tema nello style tag dedicato', () => {
    const html = renderToStaticMarkup(
      <App
        page={{
          title: 'Pagina di test',
          slug: 'pagina-di-test',
          locale: 'it-IT',
          content: { version: 1, blocks: [] },
        }}
        themeConfig={DEFAULT_THEME_CONFIG}
        cssHref="/assets/style.css"
        globalTokensCss=""
      />,
    );

    expect(html).toContain('<head>');
    expect(html).toContain('<style id="eaidos-theme-vars">');
    expect(html.indexOf('<style id="eaidos-theme-vars">')).toBeLessThan(html.indexOf('</head>'));
    expect(html).toContain('--theme-primary: #228be6;');
  });
});