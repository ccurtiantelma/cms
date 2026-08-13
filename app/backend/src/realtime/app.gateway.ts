import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { AppConstants } from '../common/app-constants';
import { RedisService } from '../redis/redis.service';

/** Sottoinsieme del payload JWT necessario a identificare il client connesso. */
interface JwtPayload {
  id: number;
}

/**
 * Gateway WebSocket generico (Socket.io). NON importato in `app.module.ts`
 * (vedi commento in quel file): è fornito come base pronta all'uso per i
 * moduli del CMS che necessitano di notifiche realtime.
 *
 * Autenticazione a due livelli: firma JWT valida E allowlist di sessione su
 * Redis (`login:${token}`) — un JWT con firma valida ma la cui sessione è
 * stata invalidata (logout, refresh, disabilitazione utente) viene comunque rifiutato.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: AppConstants.frontendUrl,
    credentials: true,
  },
})
export class AppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AppGateway.name);

  @WebSocketServer()
  server: Server;

  /** Inietta il servizio Redis usato per verificare l'allowlist di sessione. */
  constructor(private readonly redisService: RedisService) {}

  /** Hook lifecycle Socket.io: log di avvenuta inizializzazione del gateway. */
  afterInit(): void {
    this.logger.log('Gateway realtime inizializzato.');
  }

  /** Autentica il client via JWT + allowlist Redis e lo unisce alla sua room utente. */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token: string | undefined = client.handshake.auth?.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = jwt.verify(token, AppConstants.securityKey) as JwtPayload;

      // Verifica ANCHE l'allowlist di sessione su Redis, non solo la firma JWT:
      // un token con firma valida ma sessione invalidata (logout/refresh/disabilitazione) va rifiutato.
      const sessionExists = await this.redisService.exists(`login:${token}`);
      if (!sessionExists) {
        this.logger.warn(
          `Connessione WebSocket rifiutata: sessione non in allowlist (client ${client.id}).`,
        );
        client.disconnect();
        return;
      }

      // Room dedicata all'utente: consente emit mirati (`emitToUser`) senza dover
      // tracciare manualmente la mappa userId → socket.id.
      await client.join(`user:${payload.id}`);
      this.logger.log(`Client connesso: ${client.id} (utente ${payload.id}).`);
    } catch {
      client.disconnect();
    }
  }

  /** Hook lifecycle Socket.io: log della disconnessione client. */
  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnesso: ${client.id}.`);
  }

  // ---- Emettitori pubblici — chiamati dai servizi applicativi ----

  /** Trasmette un evento a tutti i client connessi. */
  emit(event: string, payload: unknown): void {
    this.server.emit(event, payload);
  }

  /** Trasmette un evento solo ai client connessi come un dato utente (room `user:${userId}`). */
  emitToUser(userId: number, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
