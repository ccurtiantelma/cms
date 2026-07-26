import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Espone `RedisService` globalmente: è l'unico session store dell'app
 * (login token, refresh token opachi, sfide MFA temporanee) — non esiste
 * tabella `logins` nel database.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
