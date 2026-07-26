import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DbModule } from '../db/db.module';
import { RedisModule } from '../redis/redis.module';
import { EmailQueueModule } from '../queues/email-queue/email-queue.module';

/**
 * Modulo di autenticazione: login/refresh/logout, attivazione account,
 * recupero password, MFA TOTP, impersonificazione SuperAdmin. `AuthMiddleware`
 * non è registrato qui ma applicato globalmente in `AppModule.configure`
 * (con `.exclude()` sulle rotte pubbliche), per poter proteggere anche gli
 * altri moduli applicativi con lo stesso middleware.
 */
@Module({
  imports: [DbModule, RedisModule, EmailQueueModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
