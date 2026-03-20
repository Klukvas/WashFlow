import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PublicBookingHeaderController } from './public-booking-header.controller';
import { PublicBookingService } from './public-booking.service';
import type { CheckAvailabilityDto } from './dto/check-availability.dto';
import type { CreateBookingDto } from './dto/create-booking.dto';

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockPublicBookingService = {
  getPublicServicesByTenantId: jest.fn(),
  getPublicBranchesByTenantId: jest.fn(),
  checkAvailabilityByTenantId: jest.fn(),
  createBookingByTenantId: jest.fn(),
};

describe('PublicBookingHeaderController', () => {
  let controller: PublicBookingHeaderController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicBookingHeaderController],
      providers: [
        { provide: PublicBookingService, useValue: mockPublicBookingService },
      ],
    })
      .overrideGuard(require('@nestjs/throttler').ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PublicBookingHeaderController>(
      PublicBookingHeaderController,
    );
  });

  describe('header validation', () => {
    it('should throw BadRequestException when x-carwash-tenant-id is missing', () => {
      expect(() => controller.getServices(undefined)).toThrow(
        BadRequestException,
      );
      expect(() => controller.getServices(undefined)).toThrow(
        'x-carwash-tenant-id header is required',
      );
    });

    it('should throw BadRequestException when x-carwash-tenant-id is not a valid UUID', () => {
      expect(() => controller.getServices('not-a-uuid')).toThrow(
        BadRequestException,
      );
      expect(() => controller.getServices('not-a-uuid')).toThrow(
        'x-carwash-tenant-id must be a valid UUID',
      );
    });

    it('should accept a valid UUID header', async () => {
      mockPublicBookingService.getPublicServicesByTenantId.mockResolvedValue(
        [],
      );
      await expect(controller.getServices(TENANT_ID)).resolves.toEqual([]);
    });
  });

  describe('getServices', () => {
    it('delegates to service.getPublicServicesByTenantId', async () => {
      const expected = [{ id: 'svc-1', name: 'Full Wash' }];
      mockPublicBookingService.getPublicServicesByTenantId.mockResolvedValue(
        expected,
      );

      const result = await controller.getServices(TENANT_ID);

      expect(
        mockPublicBookingService.getPublicServicesByTenantId,
      ).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('getBranches', () => {
    it('delegates to service.getPublicBranchesByTenantId', async () => {
      const expected = [{ id: 'branch-1', name: 'Downtown' }];
      mockPublicBookingService.getPublicBranchesByTenantId.mockResolvedValue(
        expected,
      );

      const result = await controller.getBranches(TENANT_ID);

      expect(
        mockPublicBookingService.getPublicBranchesByTenantId,
      ).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('checkAvailability', () => {
    it('delegates to service.checkAvailabilityByTenantId', async () => {
      const dto: CheckAvailabilityDto = {
        branchId: 'branch-1',
        date: '2026-03-01',
      } as CheckAvailabilityDto;
      const expected = { slots: [] };
      mockPublicBookingService.checkAvailabilityByTenantId.mockResolvedValue(
        expected,
      );

      const result = await controller.checkAvailability(TENANT_ID, dto);

      expect(
        mockPublicBookingService.checkAvailabilityByTenantId,
      ).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('createBooking', () => {
    it('delegates to service.createBookingByTenantId with idempotency key', async () => {
      const dto: CreateBookingDto = {
        branchId: 'branch-1',
        scheduledStart: '2026-03-01T10:00:00Z',
        serviceIds: ['svc-1'],
        firstName: 'Alice',
        phone: '+1234567890',
        licensePlate: 'ABC123',
      } as CreateBookingDto;
      const idempotencyKey = 'idem-key-abc';
      const expected = { id: 'order-1' };
      mockPublicBookingService.createBookingByTenantId.mockResolvedValue(
        expected,
      );

      const result = await controller.createBooking(
        TENANT_ID,
        dto,
        idempotencyKey,
      );

      expect(
        mockPublicBookingService.createBookingByTenantId,
      ).toHaveBeenCalledWith(TENANT_ID, dto, idempotencyKey);
      expect(result).toBe(expected);
    });

    it('delegates with undefined idempotency key when absent', async () => {
      const dto = { branchId: 'branch-1' } as CreateBookingDto;
      mockPublicBookingService.createBookingByTenantId.mockResolvedValue({});

      await controller.createBooking(TENANT_ID, dto, undefined);

      expect(
        mockPublicBookingService.createBookingByTenantId,
      ).toHaveBeenCalledWith(TENANT_ID, dto, undefined);
    });
  });
});
