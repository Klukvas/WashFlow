import { Test, TestingModule } from '@nestjs/testing';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import type { CheckAvailabilityDto } from './dto/check-availability.dto';
import type { CreateBookingDto } from './dto/create-booking.dto';

const TENANT_SLUG = 'my-carwash';

const mockPublicBookingService = {
  checkAvailability: jest.fn(),
  getPublicServices: jest.fn(),
  getPublicBranches: jest.fn(),
  createBooking: jest.fn(),
};

describe('PublicBookingController', () => {
  let controller: PublicBookingController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicBookingController],
      providers: [
        { provide: PublicBookingService, useValue: mockPublicBookingService },
      ],
    })
      .overrideGuard(require('@nestjs/throttler').ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PublicBookingController>(PublicBookingController);
  });

  describe('checkAvailability', () => {
    it('delegates to publicBookingService.checkAvailability with slug and dto', async () => {
      const dto: CheckAvailabilityDto = {
        date: '2026-03-01',
        serviceId: 'svc-uuid-1',
      } as unknown as CheckAvailabilityDto;
      const expected = { slots: [] };
      mockPublicBookingService.checkAvailability.mockResolvedValue(expected);

      const result = await controller.checkAvailability(TENANT_SLUG, dto);

      expect(mockPublicBookingService.checkAvailability).toHaveBeenCalledTimes(
        1,
      );
      expect(mockPublicBookingService.checkAvailability).toHaveBeenCalledWith(
        TENANT_SLUG,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getServices', () => {
    it('delegates to publicBookingService.getPublicServices with slug', async () => {
      const expected = [{ id: 'svc-uuid-1', name: 'Full Wash' }];
      mockPublicBookingService.getPublicServices.mockResolvedValue(expected);

      const result = await controller.getServices(TENANT_SLUG);

      expect(mockPublicBookingService.getPublicServices).toHaveBeenCalledTimes(
        1,
      );
      expect(mockPublicBookingService.getPublicServices).toHaveBeenCalledWith(
        TENANT_SLUG,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getBranches', () => {
    it('delegates to publicBookingService.getPublicBranches with slug', async () => {
      const expected = [{ id: 'branch-uuid-1', name: 'Downtown' }];
      mockPublicBookingService.getPublicBranches.mockResolvedValue(expected);

      const result = await controller.getBranches(TENANT_SLUG);

      expect(mockPublicBookingService.getPublicBranches).toHaveBeenCalledTimes(
        1,
      );
      expect(mockPublicBookingService.getPublicBranches).toHaveBeenCalledWith(
        TENANT_SLUG,
      );
      expect(result).toBe(expected);
    });
  });

  describe('createBooking', () => {
    it('delegates to publicBookingService.createBooking with slug, dto and idempotency key', async () => {
      const dto: CreateBookingDto = {
        serviceId: 'svc-uuid-1',
        slotId: 'slot-uuid-1',
      } as unknown as CreateBookingDto;
      const idempotencyKey = 'idem-key-abc123';
      const expected = { bookingId: 'booking-uuid-1' };
      mockPublicBookingService.createBooking.mockResolvedValue(expected);

      const result = await controller.createBooking(
        TENANT_SLUG,
        dto,
        idempotencyKey,
      );

      expect(mockPublicBookingService.createBooking).toHaveBeenCalledTimes(1);
      expect(mockPublicBookingService.createBooking).toHaveBeenCalledWith(
        TENANT_SLUG,
        dto,
        idempotencyKey,
      );
      expect(result).toBe(expected);
    });

    it('delegates to publicBookingService.createBooking with undefined idempotency key when header is absent', async () => {
      const dto: CreateBookingDto = {
        serviceId: 'svc-uuid-1',
        slotId: 'slot-uuid-1',
      } as unknown as CreateBookingDto;
      const expected = { bookingId: 'booking-uuid-2' };
      mockPublicBookingService.createBooking.mockResolvedValue(expected);

      const result = await controller.createBooking(
        TENANT_SLUG,
        dto,
        undefined,
      );

      expect(mockPublicBookingService.createBooking).toHaveBeenCalledTimes(1);
      expect(mockPublicBookingService.createBooking).toHaveBeenCalledWith(
        TENANT_SLUG,
        dto,
        undefined,
      );
      expect(result).toBe(expected);
    });
  });
});
