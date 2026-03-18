import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../../common/types/jwt-payload.type';

function buildCorsOrigin(
  config: ConfigService,
):
  | boolean
  | string[]
  | ((
      origin: string,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void) {
  const raw = config.get<string>('corsOrigins', '');
  if (!raw || raw === '*') {
    const nodeEnv = config.get<string>('nodeEnv', 'development');
    if (nodeEnv === 'production') {
      return false;
    }
    return true;
  }
  return raw.split(',').map((o) => o.trim());
}

@WebSocketGateway({
  namespace: '/events',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private tokenCheckInterval: ReturnType<typeof setInterval> | null = null;

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    const corsOrigin = buildCorsOrigin(this.config);
    if (this.server?.engine?.opts) {
      this.server.engine.opts.cors = { origin: corsOrigin, credentials: true };
    }

    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval);
    }
    this.tokenCheckInterval = setInterval(() => {
      this.disconnectExpiredClients();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval);
      this.tokenCheckInterval = null;
    }
  }

  async handleConnection(client: Socket) {
    try {
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

      // Reject non-access tokens (e.g. refresh tokens)
      if (payload.type !== 'access') {
        client.disconnect(true);
        return;
      }

      // Join tenant room
      client.join(`tenant:${payload.tenantId}`);

      // Store user data on socket
      client.data.user = payload;
      client.data.token = token;

      this.logger.debug(
        `Client connected: ${client.id} (tenant: ${payload.tenantId})`,
      );
    } catch (error) {
      this.logger.warn(
        `Rejected WebSocket connection from ${client.id}: ${(error as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  emitToTenant(tenantId: string, event: string, data: unknown) {
    if (!this.server) return;
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  emitToBranch(branchId: string, event: string, data: unknown) {
    if (!this.server) return;
    this.server.to(`branch:${branchId}`).emit(event, data);
  }

  private disconnectExpiredClients() {
    const sockets = this.server?.sockets?.sockets;
    if (!sockets) return;

    for (const [, socket] of sockets) {
      const token = socket.data?.token as string | undefined;
      if (!token) continue;

      try {
        this.jwtService.verify(token, {
          secret: this.config.get<string>('jwt.accessSecret'),
        });
      } catch {
        this.logger.debug(`Disconnecting client ${socket.id}: token expired`);
        socket.disconnect(true);
      }
    }
  }
}
