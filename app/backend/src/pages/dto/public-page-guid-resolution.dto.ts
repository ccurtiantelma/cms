import { ApiProperty } from '@nestjs/swagger';

/**
 * Payload della risoluzione pubblica inversa `guid → percorso`
 * (`GET public/pages/by-guid/:guid`, ADR-52 § 4). Serve al render SSR di
 * `app/public-site` per trasformare il `pageGuid` persistito da un
 * `navMenuItem` nell'`href` da mostrare — stessa forma di percorso accettata
 * da `?path=` (`GET public/pages`), mai un `guid`/`id` amministrativo.
 */
export class PublicPageGuidResolutionDto {
  @ApiProperty({
    description:
      'Percorso pubblico canonico, locale-prefixed dove non è la lingua di default, della Pagina pubblicata',
    example: '/chi-siamo',
  })
  path!: string;
}
