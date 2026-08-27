import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { GlobalSectionsService } from './global-sections.service';
import { PublicActiveGlobalSectionsDto } from './dto/public-active-global-sections.dto';

/**
 * Superficie pubblica di sola lettura delle Sezioni Globali (`api/v1/public/
 * global-sections`, F06, ADR-40). Anonima (esclusa da `AuthMiddleware`,
 * `public/*` in `app.module.ts`), rate limiting proprio come ogni altro
 * endpoint pubblico (ADR-24). Nessun `404`: risposta sempre `200`, uno slot
 * senza Sezione assegnata è `null`.
 */
@ApiTags('Public Global Sections')
@Controller('public/global-sections')
@UseGuards(ThrottlerGuard)
export class PublicGlobalSectionsController {
  constructor(private readonly globalSectionsService: GlobalSectionsService) {}

  /** Sezioni assegnate a `header`/`footer`, per il rendering SSR del layout pubblico. */
  @Get('active')
  @Throttle({ public: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Restituisce le Sezioni Globali attive per header e footer' })
  @ApiResponse({
    status: 200,
    description: 'Sezioni attive (slot assenti = null)',
    type: PublicActiveGlobalSectionsDto,
  })
  async getActive(): Promise<PublicActiveGlobalSectionsDto> {
    return this.globalSectionsService.getActivePublic();
  }
}
