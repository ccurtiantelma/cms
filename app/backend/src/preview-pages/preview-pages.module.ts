import { Module } from '@nestjs/common';
import { PagesModule } from '../pages/pages.module';
import { PreviewPagesController } from './preview-pages.controller';
import { PreviewPagesService } from './preview-pages.service';

/**
 * Modulo dedicato alla superficie di anteprima (ADR-25 § 3, T3): terzo
 * prefisso accanto ad `app/` e `public/`, mai fuso nel modulo Pagine per
 * mantenere il controller/guard separati dal resto (nessun guard di ruolo
 * qui: l'accesso è provato dal token, non da un JWT di sessione). Importa
 * `PagesModule` solo per riusare {@link PagesService.findDraftForPreview}
 * (esportato), la stessa pipeline di lettura-tollerante del dettaglio
 * Pagina — nessuna lettura duplicata.
 */
@Module({
  imports: [PagesModule],
  controllers: [PreviewPagesController],
  providers: [PreviewPagesService],
})
export class PreviewPagesModule {}
