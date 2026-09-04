import { MediaTransformPreset } from './dto/media-transform.dto';

/**
 * Dimensioni assolute (px) per ciascun preset nominato (ADR-49 § M6). Condivise
 * fra `MediaProcessor` (che le usa per il resize) ed `ExportProcessor` (che le
 * legge per comporre `width`/`height`/`aspect-ratio` senza richiamare `sharp`
 * su una variante già generata — SPEC-F03 § 3.3, "esposte, non ricalcolate").
 * I rapporti sono la decisione approvata; i valori pixel sono una scelta
 * implementativa rivedibile senza nuova ADR (ADR-49 § Conseguenze).
 */
export const PRESET_DIMENSIONS: Record<MediaTransformPreset, { width: number; height: number }> = {
  [MediaTransformPreset.Thumbnail]: { width: 400, height: 400 },
  [MediaTransformPreset.Card]: { width: 800, height: 450 },
  [MediaTransformPreset.Hero]: { width: 1600, height: 762 },
  [MediaTransformPreset.Og]: { width: 1200, height: 628 },
};

/** Etichetta di variante usata come prefisso di `files.originalName` per un crop esplicito (nessun preset nominato). */
export const CROP_VARIANT_LABEL = 'crop';

const NAMED_PRESETS = new Set<string>(Object.values(MediaTransformPreset));

/**
 * Compone il nome visualizzato di una variante derivata (`files.originalName`),
 * usato sia da `MediaProcessor` in scrittura sia da `ExportProcessor` in
 * lettura (`parseVariantLabel`). `originalName` non ha endpoint di rinomina
 * (nessuna `PATCH` oltre `focal-point`): il prefisso resta stabile per tutta
 * la vita della riga, motivo per cui è sicuro riusarlo come portatore
 * dell'etichetta invece di aggiungere colonne a `files` (vincolo "Nessuna
 * modifica a schema.ts", SPEC-F03 § Vincoli).
 */
export function buildDerivedFileName(
  label: MediaTransformPreset | typeof CROP_VARIANT_LABEL,
  sourceOriginalName: string,
  extension: string,
): string {
  const baseName = sourceOriginalName.replace(/\.[^./]+$/, '');
  return `${label}-${baseName}.${extension}`;
}

/**
 * Ricava l'etichetta di variante (preset nominato o `'crop'`) dal prefisso di
 * `originalName` di una riga derivata. Restituisce `null` se il prefisso non
 * corrisponde a nessuna etichetta nota (riga non derivata da questo worker).
 */
export function parseVariantLabel(
  derivedOriginalName: string,
): MediaTransformPreset | typeof CROP_VARIANT_LABEL | null {
  const separatorIndex = derivedOriginalName.indexOf('-');
  if (separatorIndex === -1) {
    return null;
  }
  const label = derivedOriginalName.slice(0, separatorIndex);
  if (label === CROP_VARIANT_LABEL) {
    return CROP_VARIANT_LABEL;
  }
  return NAMED_PRESETS.has(label) ? (label as MediaTransformPreset) : null;
}
