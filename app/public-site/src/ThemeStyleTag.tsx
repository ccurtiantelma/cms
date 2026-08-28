import {
  generateThemeCss,
  THEME_STYLE_TAG_ID,
  type ThemeConfigDto,
} from '../../frontend/src/utils/theme-css.utils';

interface ThemeStyleTagProps {
  /**
   * Tema dell'installazione (Editor tema, ADR-4) risolto da `entry-server.tsx`.
   * `null` quando il backend non ha risposto: non viene emesso alcun `<style>` e
   * i blocchi ricadono sui valori statici di `style-tokens.module.css`
   * (vedi `fetchThemeConfig`).
   */
  themeConfig: ThemeConfigDto | null;
}

/**
 * Il `<style>` che porta il tema dell'installazione dentro **ogni** documento
 * servito dal sito pubblico — Pagina, anteprima di bozza e pagine di errore.
 * Un solo componente per tutte e tre le superfici: un documento che dimentica
 * il tema è un documento che si vede diverso dal resto del sito.
 *
 * `scheme: 'auto'` — il sito pubblico non ha un selettore chiaro/scuro: i token
 * `light` sono la base e quelli `dark` intervengono su
 * `prefers-color-scheme: dark`, cioè sulla preferenza di sistema del visitatore.
 *
 * `dangerouslySetInnerHTML` è qui l'unico modo di emettere CSS non escapato in
 * `renderToStaticMarkup`, e non introduce un vettore di injection: ogni valore
 * del tema è ricontrollato uno a uno da `generateThemeCss` (colori sulla regex
 * `#rrggbb`, unità e pesi su whitelist, numeri su `Number.isFinite`) prima di
 * raggiungere il foglio di stile.
 */
export default function ThemeStyleTag({ themeConfig }: ThemeStyleTagProps) {
  if (!themeConfig) return null;
  const css = generateThemeCss(themeConfig, { selector: ':root', scheme: 'auto' });
  return <style id={THEME_STYLE_TAG_ID} dangerouslySetInnerHTML={{ __html: css }} />;
}
