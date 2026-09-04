/// <reference types="vite/client" />

/**
 * Questa versione di Vite (`node_modules/vite/client.d.ts`) non dichiara la query
 * `?inline`. Serve a `critical-css.ts` per leggere il CSS dei blocchi già processato
 * (classi già hashate dai CSS Modules, stesso identico testo che finisce nel bundle
 * esterno) come stringa, da iniettare inline nel `<head>` senza alcun motore di
 * estrazione a runtime (SPEC-F03 § 3.2, ADR-53 § 2).
 */
declare module '*.css?inline' {
  const css: string;
  export default css;
}
