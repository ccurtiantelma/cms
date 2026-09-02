import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BlocksModule } from '../blocks/blocks.module';
import { EmailQueueModule } from '../queues/email-queue/email-queue.module';
import { FormsController } from './forms.controller';
import { PublicFormsController } from './public-forms.controller';
import { FormsService } from './forms.service';

/**
 * Modulo Form Builder dinamico (F10-02, ADR-46): elaborazione degli Invii,
 * due controller distinti sullo stesso modulo (`app/forms` amministrativo,
 * `public/forms` anonimo) — stesso principio di `PagesModule` (lettura
 * pubblica e scrittura autenticata sono due superfici separate). I tre nuovi
 * tipi di blocco (`form`/`form-field`/`form-submit`) vivono nel registro
 * (`blocks/block-registry.ts`), non in questo modulo. `BlocksModule` porta
 * `BlockTreeValidatorService`/`BLOCK_REGISTRY_TOKEN`, riusati da
 * `FormsService` per risolvere il blocco `form` pubblicato senza un parser
 * jsonb parallelo. `EmailQueueModule` porta `EmailQueueService`, unico punto
 * di invio della notifica (mai un invio diretto da questo service).
 */
@Module({
  imports: [DbModule, BlocksModule, EmailQueueModule],
  controllers: [FormsController, PublicFormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
