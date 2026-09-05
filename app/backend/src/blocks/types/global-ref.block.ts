import { BlockDefinition } from '../block-definition.types';

/**
 * `globalRef` — dodicesimo tipo del registro (ADR-55 § 1): nodo puntatore
 * verso una riga `global_sections` (ADR-40), referenziabile ovunque
 * nell'albero `content` di una Pagina — non solo nei due `layoutSlot` fissi
 * (`header`/`footer`). Foglia (`children.allow: []`): nessun contenuto
 * proprio da validare o sanitizzare, il contenuto vive interamente nella riga
 * referenziata e passa dalla propria pipeline di scrittura
 * (`GlobalSectionsService.runWriteContentPipeline`).
 *
 * Un'unica prop, `globalSectionGuid` (`kind: 'globalSectionRef'`, ADR-55
 * § 1): solo forma di `guid` (16 hex), nessuna verifica di esistenza/stato a
 * scrittura — la risoluzione è a valle nel job di export, stesso principio
 * di `pageRef` (ADR-52 § 4).
 *
 * Il divieto di ciclo è per **contratto**, non per rilevamento a grafo: un
 * nodo `globalRef` è respinto se l'albero in validazione appartiene esso
 * stesso a una Sezione Globale (`BlockTreeValidationContext.insideGlobalSection`,
 * impostato solo da `GlobalSectionsService`, mai da `PagesService`) — vedi
 * `BlockTreeValidatorService.validateNode` (ADR-55, "Cicli chiusi per
 * contratto"). Questo file non impone quel vincolo: dichiara solo la forma
 * del nodo.
 */
export const globalRefBlock: BlockDefinition = {
  type: 'globalRef',
  v: 1,
  props: {
    globalSectionGuid: {
      kind: 'globalSectionRef',
      required: true,
    },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Sezione Globale',
    category: 'navigazione',
    icon: 'puzzle',
    props: {
      globalSectionGuid: {
        label: 'Sezione Globale',
        order: 1,
        help: 'Sezione Globale referenziata: la modifica del suo contenuto si riflette qui e in ogni altro punto che la referenzia.',
      },
    },
  },
};
