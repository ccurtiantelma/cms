import { Global, Module } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { RedisModule } from '../redis/redis.module';

/**
 * Modulo realtime (Socket.io) generico e completo, pronto all'uso ma
 * volutamente NON importato in `AppModule` (vedi commento in quel file):
 * lo starter-kit non contiene funzionalità realtime di dominio, quindi il
 * modulo resta disponibile senza essere attivo di default.
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [AppGateway],
  exports: [AppGateway],
})
export class RealtimeModule {}
