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
});
