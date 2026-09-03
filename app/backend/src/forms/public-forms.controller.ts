import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { Request } from 'express';
import { FormsService } from './forms.service';
import { SubmitFormDto } from './dto/submit-form.dto';

/** Risposta generica di successo: mai un echo del payload (ADR-46 § 4, RFC-46 D4.6). */
interface SubmitFormResponse {
  success: true;
}

/**
 * Superficie pubblica di sottomissione dei Form (`api/v1/public/forms`,
 * ADR-46 § 4). Anonima (esclusa da `AuthMiddleware`, `app.module.ts`), sola
 * scrittura di un Invio. Rate limiting proprio (`@Throttle`, throttler
 * `public`): per IP, come ogni altra rotta pubblica.
 *
 * **Limite dichiarato** (RFC-46 D6.3): il rate limit richiesto è per IP **e**
 * per `(ip, formKey)`. `ThrottlerGuard`/`@Throttle` di questo progetto
 * applicano solo la chiave IP di default (nessuno storage/tracker per
 * `(ip, formKey)` già presente nel progetto) — non introdotto qui per non
 * bloccare l'implementazione su un guard dedicato non richiesto altrove nel
 * codice. Il rate limit per `(ip, formKey)` resta un guard/store dedicato da
 * aggiungere in un task a sé, dichiarato qui e non taciuto.
 */
@ApiTags('Public Forms')
@Controller('public/forms')
@UseGuards(ThrottlerGuard)
export class PublicFormsController {
  /** Inietta il service di elaborazione degli Invii. */
  constructor(private readonly formsService: FormsService) {}

  /**
   * Elabora una sottomissione. `:formId` **è** `formKey` (ADR-46 § 4). Il
   * body arriva grezzo (`Record<string, unknown>`, non tipizzato da
   * `ValidationPipe`): vedi JSDoc di {@link SubmitFormDto} per il motivo
   * (honeypot a nome dinamico). Risposta sempre `200` generica, anche negli
   * esiti "silenziosi" anti-spam (honeypot valorizzato, firma non valida).
   */
  @Post(':formId/submit')
  @HttpCode(HttpStatus.OK)
  @Throttle({ public: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Elabora la sottomissione di un Form pubblicato' })
  @ApiParam({ name: 'formId', description: 'Chiave editoriale del modulo (form.formKey)' })
  @ApiBody({ type: SubmitFormDto })
  @ApiResponse({ status: 200, description: 'Sempre 200: esito reale mai rivelato al chiamante' })
  @ApiResponse({
    status: 400,
    description: 'Valori non conformi ai form-field realmente pubblicati',
  })
  @ApiResponse({ status: 404, description: 'Nessun blocco form pubblicato con questo formKey' })
  async submit(
    @Param('formId') formId: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<SubmitFormResponse> {
    const dto = plainToInstance(SubmitFormDto, rawBody ?? {});
    await this.formsService.submitForm(
      formId,
      dto,
      rawBody ?? {},
      req.ip ?? '',
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
    );
    return { success: true };
  }
}
