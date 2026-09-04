import type { components } from '@api-types';
import type { ThemeConfigDto } from '../../frontend/src/utils/theme-css.utils';
import PageView from './PageView';
import ThemeStyleTag from './ThemeStyleTag';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];

/**
 * Sottoinsieme di `PageSeoDto` (`api.types.ts`) effettivamente assemblato in
 * markup qui (SPEC-F03 § 4.1): `PublicPageDto.seo` nell'OpenAPI generato è
 * tipizzato come indice generico (`{ [key: string]: unknown }`, limite dello
 * spec-generator che non riflette la vera forma scritta da `SeoGraphService`,
 * ADR-48) — il cast a questa interfaccia più stretta non è un `any`, restringe
 * solo le chiavi lette davvero. `structuredData` è qui `Record<string,
 * unknown>` per lo stesso motivo: nell'OpenAPI risulta `Record<string,
 * never>`, che non riflette la forma reale a runtime (l'oggetto `@graph`
 * JSON-LD combinato di ADR-48).
 */
interface PageSeoData {
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  structuredData?: Record<string, unknown>;
}

/**
 * Serializza `structuredData` per l'iniezione in uno `<script
 * type="application/ld+json">`. `JSON.stringify` non escapa mai la sequenza
 * `</`: un campo GEO `plainText` (es. `faq[].answer`, mai HTML-sanitizzato per
 * ADR-21 § 4 — l'escaping è responsabilità del renderer) che contenesse
 * `</script>` chiuderebbe prematuramente questo tag e permetterebbe
 * l'iniezione di markup arbitrario subito dopo. Tecnica standard di
 * embedding JSON-LD: si neutralizza sostituendo `</` con `<\/`, innocuo per
 * `JSON.parse` (la barra inversa dentro una stringa JSON è solo un escape) ma
 * non più interpretabile da un parser HTML come chiusura di tag.
 */
function serializeStructuredData(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/<\//g, '<\\/');
}

interface AppProps {
  page: PublicPageDto;
  /** Tema dell'installazione, `null` se il backend non ha risposto (vedi `ThemeStyleTag`). */
  themeConfig: ThemeConfigDto | null;
  cssHref: string;
  /**
   * Percorso pubblico canonico della Pagina corrente, già risolto da
   * `resolvePublicPage`/`canonicalizePublicPath` a monte (ADR-24 § 4,
   * `entry-server.tsx`/`server.ts`) — mai un URL assoluto con dominio, stesso
   * principio di `cssHref`. Assente (stringa vuota) ⇒ nessun
   * `<link rel="canonical">` emesso, invece di un `href=""` inutile.
   */
  canonicalPath?: string;
  /**
   * CSS above-the-fold (design token + blocchi dei primi viewport, `critical-css.ts`)
   * da iniettare come `<style>` inline, prima di ogni `<link>` (ADR-53 § 2, SPEC-F03 §
   * 3.2): il file statico contiene già ciò che serve al primo render, senza attendere
   * il foglio esterno per il contenuto sopra la piega.
   */
  criticalCss: string;
  /** Isola JS di submit dei Form (F10-04) — iniettata da `PageView` solo se la Pagina ne ha bisogno. */
  formScriptHref?: string;
  /**
   * Sezioni Globali assegnate a `header`/`footer` (ADR-40), risolte da
   * `entry-server.tsx`. Assenti o con slot `null` ⇒ il documento contiene i soli
   * blocchi della Pagina, senza errori.
   */
  globalSections?: PublicActiveGlobalSectionsDto;
  /** Vedi `PageView.tsx` — pass-through opzionale calcolato da `entry-server.tsx` (ADR-52). */
  resolvePageUrl?: (pageGuid: string) => string | null | undefined;
}

/**
 * Documento HTML completo di una Pagina pubblicata. `seo` è ora assemblato in
 * markup (T4/PLAN-F03, SPEC-F03 § 4.1): nessuna generazione a runtime, il
 * dato è già quello scritto da `SeoGraphService` a publish-time (ADR-48) —
 * qui si serializza soltanto, coerente con ADR-53 § 6.
 *
 * Il `<style>` del tema è dichiarato **dopo** il `<link>` del foglio dei
 * blocchi: a parità di specificità (il suo `:root` contro il `:root` di
 * `style-tokens.module.css`) vince l'ultima regola dichiarata, quindi il tema
 * dell'Editor sovrascrive i valori statici di fabbrica dei token `--cms-*`.
 */
export default function App({
  page,
  themeConfig,
  cssHref,
  canonicalPath,
  criticalCss,
  formScriptHref,
  globalSections,
  resolvePageUrl,
}: AppProps) {
  // `page.seo` è tipizzato come indice generico obbligatorio dall'OpenAPI, ma
  // qualunque fixture/consumer che ne fosse privo (o desse `null`) non deve
  // abbattere il documento (stesso principio di degradazione controllata di
  // `fetchThemeConfig`/`fetchActiveGlobalSections`): niente meta OpenGraph,
  // niente canonico, niente JSON-LD, mai un `TypeError` a runtime.
  const seo = (page.seo ?? {}) as PageSeoData;
  return (
    <html lang={page.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{page.title}</title>
        {seo.ogTitle ? <meta property="og:title" content={seo.ogTitle} /> : null}
        {seo.ogDescription ? <meta property="og:description" content={seo.ogDescription} /> : null}
        {seo.ogImage ? <meta property="og:image" content={seo.ogImage} /> : null}
        {canonicalPath ? <link rel="canonical" href={canonicalPath} /> : null}
        {seo.structuredData ? (
          <script
            type="application/ld+json"
            // Unica eccezione ammessa fuori da RichText.tsx/tema/CSS critico
            // (vedi commento in escaping.spec.ts): dati già fidati lato
            // struttura (scritti da SeoGraphService), neutralizzati da
            // `serializeStructuredData` contro l'unico vettore di injection
            // possibile in questo contesto (chiusura prematura del tag).
            dangerouslySetInnerHTML={{ __html: serializeStructuredData(seo.structuredData) }}
          />
        ) : null}
        {criticalCss ? (
          <style data-critical-css dangerouslySetInnerHTML={{ __html: criticalCss }} />
        ) : null}
        <link rel="stylesheet" href={cssHref} />
        <ThemeStyleTag themeConfig={themeConfig} />
      </head>
      <body>
        <PageView
          content={page.content}
          globalSections={globalSections}
          formScriptHref={formScriptHref}
          resolvePageUrl={resolvePageUrl}
        />
      </body>
    </html>
  );
}
