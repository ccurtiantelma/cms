#!/usr/bin/env node
/**
 * check-exported-images.js
 * Gate di CI di ADR-53 § 3 (CLS = 0) e § Conformità: «Ogni `<img>` nel markup
 * prodotto porta `width`, `height`... un'immagine senza dimensioni intrinseche
 * fa fallire il gate di CI». `PLAN-F03` T3 — l'export **già** emette
 * `width`/`height`/`aspect-ratio` (`ExportProcessor.augmentImgTag`): qui manca
 * solo il controllo che renda rossa la build quando non lo fa.
 *
 * Il controllo gira sull'HTML **realmente scritto** dal job di export, non sul
 * componente React (stesso spostamento di verifica imposto da ADR-53 § 7 per
 * l'escaping): un `<img>` esce senza dimensioni quando `resolveMediaResources`
 * restituisce `null` e il tag resta invariato — condizione di dato, invisibile
 * a un test sul renderer.
 *
 * Uso: node check-exported-images.js <directory> [<directory>...]
 * In CI: sulle directory di artefatti prodotte dalla suite di export
 * (`STATIC_EXPORT_ARTIFACT_DIR`), vedi `.github/workflows/ci.yml`.
 *
 * Esce `1` (build rossa) se almeno un `<img>` è privo di `width`/`height`
 * interi positivi, **o** se nessun file `.html` è stato trovato: un gate che
 * non ha ispezionato nulla non è un gate verde, è un gate che non ha girato.
 */

const fs = require('fs');
const path = require('path');

/** Ogni tag `<img>`, aperto o autochiuso, attributi su più righe compresi. */
const IMG_TAG_PATTERN = /<img\b[^>]*>/gi;

/** `width`/`height` sono validi solo come intero positivo: `width=""` o `width="auto"` non azzerano il layout shift. */
function hasPositiveIntegerAttribute(tag, attribute) {
  const match = tag.match(new RegExp(`\\s${attribute}="(\\d+)"`, 'i'));
  return match !== null && Number(match[1]) > 0;
}

/** Elenco ricorsivo dei file `.html` sotto `dir`. */
function collectHtmlFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectHtmlFiles(entryPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      found.push(entryPath);
    }
  }
  return found;
}

/** Violazioni (`{file, tag}`) di un singolo documento esportato. */
function violationsOf(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8');
  const tags = html.match(IMG_TAG_PATTERN) ?? [];
  return tags
    .filter(
      (tag) =>
        !hasPositiveIntegerAttribute(tag, 'width') || !hasPositiveIntegerAttribute(tag, 'height'),
    )
    .map((tag) => ({ file: filePath, tag }));
}

function main() {
  const directories = process.argv.slice(2);
  if (directories.length === 0) {
    console.error('Uso: node check-exported-images.js <directory> [<directory>...]');
    process.exit(1);
  }

  const htmlFiles = [];
  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      console.error(
        `::error::La directory di export "${dir}" non esiste: il gate immagini di ADR-53 non ha potuto ispezionare nulla.`,
      );
      process.exit(1);
    }
    htmlFiles.push(...collectHtmlFiles(dir));
  }

  if (htmlFiles.length === 0) {
    console.error(
      `::error::Nessun file .html trovato in ${directories.join(', ')}: il gate immagini di ADR-53 non ha potuto ispezionare nulla.`,
    );
    process.exit(1);
  }

  const violations = htmlFiles.flatMap(violationsOf);
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`::error file=${violation.file}::<img> senza width/height: ${violation.tag}`);
    }
    console.error(
      `::error::${violations.length} tag <img> esportati senza dimensioni intrinseche su ${htmlFiles.length} documenti ispezionati (ADR-53 § 3, CLS = 0).`,
    );
    process.exit(1);
  }

  console.log(
    `Gate immagini ADR-53: ${htmlFiles.length} documenti esportati ispezionati, ogni <img> porta width/height.`,
  );
}

main();
