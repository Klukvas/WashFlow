import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { Socket } from 'socket.io';

function makeSocket(
  overrides: Partial<{
    handshake: Record<string, unknown>;
    id: string;
    data: Record<string, unknown>;
    join: jest.Mock;
    disconnect: jest.Mock;
  }>,
): Socket {
  return {
    id: 'socket-1',
    handshake: { auth: {}, headers: {} },
    data: {},
    join: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwtService: { verify: jest.Mock };
  let config: { get: jest.Mock };

  const mockPayload = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    type: 'access',
    isSuperAdmin: false,
    permissions: [],
  };

  beforeEach(async () => {
    jwtService = { verify: jest.fn().mockReturnValue(mockPayload) };
    config = { get: jest.fn().mockReturnValue('test-secret') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);

    // Inject mock server
    const mockRoom = { emit: jest.fn() };
    (gateway as any).server = {
      to: jest.fn().mockReturnValue(mockRoom),
    };
  });

  afterEach(() => {
    gateway.onModuleDestroy();
  });

  describe('handleConnection', () => {
    it('should join tenant room when valid token is in auth', async () => {
      const client = makeSocket({
        handshake: { auth: { token: 'valid.jwt.token' }, headers: {} },
      });
      await gateway.handleConnection(client);
      expect(jwtService.verify).toHaveBeenCalledWith(
        'valid.jwt.token',
        expect.any(Object),
      );
      expect(client.join).toHaveBeenCalledWith('tenant:tenant-1');
      expect(client.data.user).toEqual(mockPayload);
    });

    it('should extract token from Authorization header as fallback', async () => {
      const client = makeSocket({
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header.jwt.token' },
        },
      });
      await gateway.handleConnection(client);
      expect(jwtService.verify).toHaveBeenCalledWith(
        'header.jwt.token',
        expect.any(Object),
      );
    });

    it('should disconnect client when no token is provided', async () => {
      const client = makeSocket({
        handshake: { auth: {}, headers: {} },
      });
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should disconnect client when jwt.verify throws', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      const client = makeSocket({
        handshake: { auth: { token: 'bad.token' }, headers: {} },
      });
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleDisconnect', () => {
    it('should not throw when client disconnects', () => {
      const client = makeSocket({ id: 'socket-xyz' });
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });

  describe('emitToTenant', () => {
    it('should emit event to the correct tenant room', () => {
      gateway.emitToTenant('tenant-1', 'order.created', { id: '1' });
      expect((gateway as any).server.to).toHaveBeenCalledWith(
        'tenant:tenant-1',
      );
      const room = (gateway as any).server.to.mock.results[0].value;
      expect(room.emit).toHaveBeenCalledWith('order.created', { id: '1' });
    });
  });

  describe('emitToBranch', () => {
    it('should emit event to the correct branch room', () => {
      gateway.emitToBranch('branch-1', 'order.created', { id: '2' });
      expect((gateway as any).server.to).toHaveBeenCalledWith(
        'branch:branch-1',
      );
      const room = (gateway as any).server.to.mock.results[0].value;
      expect(room.emit).toHaveBeenCalledWith('order.created', { id: '2' });
    });
  });

  // =========================================================================
  // afterInit — CORS configuration
  // =========================================================================

  describe('afterInit', () => {
    it('configures CORS origins when corsOrigins is set and not wildcard', () => {
      config.get.mockReturnValue('https://app.com, https://admin.com');
      (gateway as any).server = {
        engine: { opts: { cors: {} } },
        sockets: { sockets: new Map() },
        to: jest.fn(),
      };

      gateway.afterInit();

      expect((gateway as any).server.engine.opts.cors).toEqual({
        origin: ['https://app.com', 'https://admin.com'],
        credentials: true,
      });
    });

    it('sets CORS origin to true in dev when corsOrigins is wildcard', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'nodeEnv') return 'development';
        return '*';
      });
      (gateway as any).server = {
        engine: { opts: { cors: {} } },
        sockets: { sockets: new Map() },
        to: jest.fn(),
      };

      gateway.afterInit();

      expect((gateway as any).server.engine.opts.cors).toEqual({
        origin: true,
        credentials: true,
      });
    });

    it('sets CORS origin to true in dev when corsOrigins is empty', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'nodeEnv') return 'development';
        return '';
      });
      (gateway as any).server = {
        engine: { opts: { cors: {} } },
        sockets: { sockets: new Map() },
        to: jest.fn(),
      };

      gateway.afterInit();

      expect((gateway as any).server.engine.opts.cors).toEqual({
        origin: true,
        credentials: true,
      });
    });

    it('does NOT crash when server.engine.opts is undefined', () => {
      config.get.mockReturnValue('https://app.com');
      (gateway as any).server = {
        sockets: { sockets: new Map() },
        to: jest.fn(),
      };

      expect(() => gateway.afterInit()).not.toThrow();
    });

    it('starts token check interval', () => {
      config.get.mockReturnValue('');
      (gateway as any).server = {
        engine: { opts: { cors: {} } },
        sockets: { sockets: new Map() },
        to: jest.fn(),
      };

      gateway.afterInit();

      expect((gateway as any).tokenCheckInterval).toBeTruthy();
      gateway.onModuleDestroy();
    });
  });

  // =========================================================================
  // afterInit — CORS in production
  // =========================================================================

  describe('afterInit (production CORS)', () => {
    it('returns false for wildcard CORS in production', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'nodeEnv') return 'production';
        if (key === 'corsOrigins') return '*';
        return '*';
      });
      (gateway as any).server = {
        engine: { opts: { cors: {} } },
        sockets: { sockets: new Map() },
        to: jest.fn(),
      };

      gateway.afterInit();

      expect((gateway as any).server.engine.opts.cors).toEqual({
        origin: false,
        credentials: true,
      });
    });
  });

  // =========================================================================
  // disconnectExpiredClients
  // =========================================================================

  describe('disconnectExpiredClients', () => {
    it('skips when server.sockets.sockets is undefined', () => {
      (gateway as any).server = { sockets: {} };
      expect(() => (gateway as any).disconnectExpiredClients()).not.toThrow();
    });

    it('skips sockets without tokens', () => {
      const socket = { id: 's1', data: {}, disconnect: jest.fn() };
      (gateway as any).server = {
        sockets: { sockets: new Map([['s1', socket]]) },
      };

      (gateway as any).disconnectExpiredClients();

      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('keeps sockets with valid tokens', () => {
      jwtService.verify.mockReturnValue({}); // valid
      const socket = {
        id: 's1',
        data: { token: 'valid' },
        disconnect: jest.fn(),
      };
      (gateway as any).server = {
        sockets: { sockets: new Map([['s1', socket]]) },
      };

      (gateway as any).disconnectExpiredClients();

      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects sockets with expired tokens', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const socket = {
        id: 's1',
        data: { token: 'expired' },
        disconnect: jest.fn(),
      };
      (gateway as any).server = {
        sockets: { sockets: new Map([['s1', socket]]) },
      };

      (gateway as any).disconnectExpiredClients();

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('handles empty sockets map gracefully', () => {
      (gateway as any).server = {
        sockets: { sockets: new Map() },
      };

      expect(() => (gateway as any).disconnectExpiredClients()).not.toThrow();
    });
  });

  // =========================================================================
  // onModuleDestroy — cleanup
  // =========================================================================

  describe('onModuleDestroy', () => {
    it('clears the token check interval', () => {
      config.get.mockReturnValue('');
      (gateway as any).server = {
        engine: { opts: { cors: {} } },
        sockets: { sockets: new Map() },
        to: jest.fn(),
      };

      gateway.afterInit();
      expect((gateway as any).tokenCheckInterval).toBeTruthy();

      gateway.onModuleDestroy();
      expect((gateway as any).tokenCheckInterval).toBeNull();
    });
  });
});
