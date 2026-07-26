import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Rappresentazione pubblica di una notifica (mai `userId`: il possesso è
 * implicito nel token JWT del chiamante — ogni endpoint opera solo sulle
 * notifiche dell'utente autenticato).
 */
export class NotificationDto {
  @ApiProperty({
    description: 'Identificatore pubblico della notifica, usato nelle URL',
    example: 'a1b2c3d4e5f6a7b8',
  })
  guid!: string;

  @ApiProperty({
    description: 'Codice tipo libero, definito dal progetto verticale',
    example: 'system.info',
  })
  type!: string;

  @ApiProperty({ description: 'Titolo breve', example: 'Nuovo documento caricato' })
  title!: string;

  @ApiProperty({
    description: 'Testo del messaggio',
    example: 'Il file "fattura.pdf" è stato caricato con successo.',
  })
  message!: string;

  @ApiPropertyOptional({
    description: "Percorso frontend su cui portare l'utente al click, se presente",
    example: '/files',
    nullable: true,
  })
  link?: string | null;

  @ApiProperty({ description: 'Se la notifica è già stata letta', example: false })
  isRead!: boolean;

  @ApiProperty({ description: 'Data di creazione', example: '2026-07-23T10:00:00.000Z' })
  createdAt!: Date;
}

/** Risposta di `GET /app/notifications/unread-count`. */
export class UnreadCountDto {
  @ApiProperty({ description: 'Numero di notifiche non lette del chiamante', example: 3 })
  count!: number;
}

/** Risposta di `PATCH /app/notifications/read-all`. */
export class MarkAllReadDto {
  @ApiProperty({ description: 'Numero di notifiche aggiornate', example: 3 })
  updated!: number;
}
