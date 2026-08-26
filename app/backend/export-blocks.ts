/**
 * export-blocks.ts
 * Genera app/backend/blocks-registry.json dal registro dei tipi di blocco
 * (`src/blocks/block-registry.ts`), senza avviare il server HTTP né Nest
 * (dato puro, nessuna dipendenza da DB/Redis — a differenza di
 * `export-openapi.ts`). Lanciare dalla root del backend con:
 *   npm run blocks:export
 *
 * L'artefatto è la sorgente per `blocks:types` (script root, PLAN-F02 T6),
 * che lo trasforma in `app/frontend/src/types/blocks.types.ts`. Contiene
 * SOLO ciò che SPEC-F02-blocchi.md § 5.1 elenca — identificativi, versione
 * corrente per tipo, descrittori delle props, regole di annidamento,
 * `ROOT_ALLOWED`, limiti dell'envelope — mai un contratto di rendering
 * (ADR-21 § 2, decisione aperta sul consumer HTML).
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { DEFAULT_BLOCK_REGISTRY } from './src/blocks/block-registry';
import { ENVELOPE_VERSION } from './src/blocks/migration/envelope-migration.engine';
import { MAX_DEPTH, MAX_NODES, MAX_PAYLOAD_BYTES } from './src/pages/content-tree';

interface ExportedPropDescriptor {
  name: string;
  kind: string;
  required: boolean;
  default?: unknown;
  maxLength?: number;
  values?: readonly string[];
  profile?: string;
  nonEmpty?: boolean;
  responsive?: boolean;
  /** Solo `kind: 'unitValue'` (ADR-38 § 2): elenco chiuso di unità ammesse per questa prop. */
  units?: readonly string[];
  /** Solo `kind: 'unitValue'` (ADR-38 § 2): intervallo numerico ammesso, dichiarato dalla prop. */
  min?: number;
  max?: number;
}

interface ExportedBlockEditorPropMeta {
  label: string;
  tab?: 'content' | 'style' | 'advanced';
  order?: number;
  help?: string;
}

interface ExportedBlockType {
  type: string;
  v: number;
  enabled: boolean;
  deprecated?: boolean;
  minRole?: number;
  childrenAllow: readonly string[];
  props: ExportedPropDescriptor[];
  meta?: {
    label: string;
    icon?: string;
    category?: string;
    props?: Record<string, ExportedBlockEditorPropMeta>;
  };
}

interface BlocksExportArtifact {
  envelopeVersion: number;
  rootAllowed: readonly string[];
  limits: { maxDepth: number; maxNodes: number; maxPayloadBytes: number };
  types: ExportedBlockType[];
}

function exportBlocksArtifact(): void {
  const types: ExportedBlockType[] = [...DEFAULT_BLOCK_REGISTRY.definitions.values()].map(
    (definition) => ({
      type: definition.type,
      v: definition.v,
      enabled: definition.enabled,
      ...(definition.deprecated !== undefined ? { deprecated: definition.deprecated } : {}),
      ...(definition.minRole !== undefined ? { minRole: definition.minRole } : {}),
      childrenAllow: definition.children.allow,
      props: Object.entries(definition.props).map(([name, spec]) => ({
        name,
        kind: spec.kind,
        required: spec.required,
        ...(spec.default !== undefined ? { default: spec.default } : {}),
        ...('maxLength' in spec && spec.maxLength !== undefined ? { maxLength: spec.maxLength } : {}),
        ...('values' in spec ? { values: spec.values } : {}),
        ...('profile' in spec ? { profile: spec.profile } : {}),
        ...('nonEmpty' in spec && spec.nonEmpty !== undefined ? { nonEmpty: spec.nonEmpty } : {}),
        ...('responsive' in spec && spec.responsive !== undefined ? { responsive: spec.responsive } : {}),
        ...('units' in spec ? { units: spec.units } : {}),
        ...('min' in spec ? { min: spec.min } : {}),
        ...('max' in spec ? { max: spec.max } : {}),
      })),
      ...(definition.meta ? { meta: definition.meta } : {}),
    }),
  );

  const artifact: BlocksExportArtifact = {
    envelopeVersion: ENVELOPE_VERSION,
    rootAllowed: DEFAULT_BLOCK_REGISTRY.rootAllowed,
    limits: { maxDepth: MAX_DEPTH, maxNodes: MAX_NODES, maxPayloadBytes: MAX_PAYLOAD_BYTES },
    types,
  };

  const outputPath = resolve(__dirname, 'blocks-registry.json');
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`blocks-registry.json generato in: ${outputPath}`);
}

exportBlocksArtifact();
