import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeService', () => {
  let service: RealtimeService;
  let gateway: { emitToTenant: jest.Mock; emitToBranch: jest.Mock };

  beforeEach(async () => {
    gateway = {
      emitToTenant: jest.fn(),
      emitToBranch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeService,
        { provide: RealtimeGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<RealtimeService>(RealtimeService);
  });

  describe('emitToTenant', () => {
    it('should delegate to gateway.emitToTenant with correct args', () => {
      service.emitToTenant('tenant-1', 'order.created', { id: '1' });
      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        'tenant-1',
        'order.created',
        { id: '1' },
      );
    });
  });

  describe('emitToBranch', () => {
    it('should delegate to gateway.emitToBranch with correct args', () => {
      service.emitToBranch('branch-1', 'order.created', { id: '2' });
      expect(gateway.emitToBranch).toHaveBeenCalledWith(
        'branch-1',
        'order.created',
        { id: '2' },
      );
    });
  });
});
