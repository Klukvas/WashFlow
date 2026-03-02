import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../../common/types/jwt-payload.type';

@WebSocketGateway({
  namespace: '/events',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    const corsOrigins = this.config.get<string>('corsOrigins', '');
    if (corsOrigins && corsOrigins !== '*') {
      const origins = corsOrigins.split(',').map((o) => o.trim());
      this.server.engine.opts.cors = { origin: origins, credentials: true };
    }
  }

  async handleConnection(client: Socket) {
    try {
      // Validate origin against allowed CORS origins
      const origin = client.handshake.headers?.origin;
      const corsOrigins = this.config.get<string>('corsOrigins', '');
      if (corsOrigins && corsOrigins !== '*' && origin) {
        const allowed = corsOrigins.split(',').map((o) => o.trim());
        if (!allowed.includes(origin)) {
          client.disconnect(true);
          return;
        }
      }

      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });

      // Join tenant room
      client.join(`tenant:${payload.tenantId}`);

      // Store user data on socket
      client.data.user = payload;

      this.logger.debug(
        `Client connected: ${client.id} (tenant: ${payload.tenantId})`,
      );
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  emitToTenant(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  emitToBranch(branchId: string, event: string, data: unknown) {
    this.server.to(`branch:${branchId}`).emit(event, data);
  }
}
