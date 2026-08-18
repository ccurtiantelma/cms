import { Module } from '@nestjs/common';
import { BlockTreeValidatorService } from './validator/block-tree-validator.service';
import { BLOCK_REGISTRY_TOKEN, DEFAULT_BLOCK_REGISTRY } from './block-registry';

/**
 * Modulo Blocchi (F02/T2): registro dei tipi (`block-registry.ts`, oggetti
 * statici) e interprete di validazione (`BlockTreeValidatorService`). Nessun
 * controller: T2 non innesta nulla in `pages` — l'innesto è T5. Nessuna
 * sanitizzazione per `kind` (T3) e nessun motore di migrazione (T4) in
 * questo modulo.
 *
 * Il registro è esposto anche dietro il token `BLOCK_REGISTRY_TOKEN` (F02/T7,
 * stesso pattern di `STORAGE_DRIVER`): i punti di consumo lo iniettano
 * invece di importare `DEFAULT_BLOCK_REGISTRY` come costante fissa, così un
 * test e2e può sovrascrivere il provider con un registro di test (tipo a
 * `v: 2`) senza toccare il binding di produzione.
 */
@Module({
  providers: [
    BlockTreeValidatorService,
    { provide: BLOCK_REGISTRY_TOKEN, useValue: DEFAULT_BLOCK_REGISTRY },
  ],
  exports: [BlockTreeValidatorService, BLOCK_REGISTRY_TOKEN],
})
export class BlocksModule {}
