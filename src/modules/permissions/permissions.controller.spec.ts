import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findByModule: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsController,
        { provide: PermissionsService, useValue: service },
      ],
    }).compile();

    controller = module.get<PermissionsController>(PermissionsController);
  });

  describe('findAll', () => {
    it('should delegate to service.findAll and return its result', async () => {
      const expected = [{ id: '1', name: 'orders.read' }];
      service.findAll.mockResolvedValue(expected);
      const result = await controller.findAll();
      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expected);
    });
  });

  describe('findByModule', () => {
    it('should delegate to service.findByModule with the module param', async () => {
      const expected = [{ id: '2', module: 'orders' }];
      service.findByModule.mockResolvedValue(expected);
      const result = await controller.findByModule('orders');
      expect(service.findByModule).toHaveBeenCalledWith('orders');
      expect(result).toEqual(expected);
    });
  });
});
