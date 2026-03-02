import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PublicBookingService } from './public-booking.service';
import { TenantsRepository } from '../tenants/tenants.repository';
import { SchedulingService } from '../scheduling/scheduling.service';
import { OrdersService } from '../orders/orders.service';
import { ServicesRepository } from '../services/services.repository';
import { BranchesRepository } from '../branches/branches.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

describe('PublicBookingService', () => {
  let service: PublicBookingService;
  let tenantsRepo: {
    findBySlug: jest.Mock;
    getBookingSettings: jest.Mock;
  };
  let schedulingService: { checkAvailability: jest.Mock };
  let ordersService: { create: jest.Mock };
  let servicesRepo: { findActive: jest.Mock };
  let branchesRepo: { findActive: jest.Mock };
  let prisma: {
    client: { findFirst: jest.Mock; create: jest.Mock };
    vehicle: { findFirst: jest.Mock; create: jest.Mock };
    bookingSettings: { findUnique: jest.Mock; findFirst: jest.Mock };
  };

  const activeTenant = { id: 'tenant-1', slug: 'clean-wash', isActive: true };
  const inactiveTenant = {
    id: 'tenant-2',
    slug: 'closed-wash',
    isActive: false,
  };

  const baseBookingDto: CreateBookingDto = {
    branchId: 'branch-1',
    workPostId: 'wp-1',
    scheduledStart: '2026-03-01T10:00:00Z',
    serviceIds: ['svc-1'],
    firstName: 'Alice',
    lastName: 'Smith',
    phone: '+1234567890',
    licensePlate: 'ABC123',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
  };

  const baseAvailabilityDto: CheckAvailabilityDto = {
    branchId: 'branch-1',
    date: '2026-03-01',
    durationMinutes: 30,
  };

  beforeEach(async () => {
    tenantsRepo = {
      findBySlug: jest.fn(),
      getBookingSettings: jest.fn(),
    };
    schedulingService = { checkAvailability: jest.fn() };
    ordersService = { create: jest.fn() };
    servicesRepo = { findActive: jest.fn() };
    branchesRepo = { findActive: jest.fn() };
    prisma = {
      client: { findFirst: jest.fn(), create: jest.fn() },
      vehicle: { findFirst: jest.fn(), create: jest.fn() },
      bookingSettings: { findUnique: jest.fn(), findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicBookingService,
        { provide: TenantsRepository, useValue: tenantsRepo },
        { provide: SchedulingService, useValue: schedulingService },
        { provide: OrdersService, useValue: ordersService },
        { provide: ServicesRepository, useValue: servicesRepo },
        { provide: BranchesRepository, useValue: branchesRepo },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PublicBookingService>(PublicBookingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveTenant (via public methods)', () => {
    it('should throw NotFoundException when slug is not found', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(null);

      await expect(
        service.checkAvailability('unknown-slug', baseAvailabilityDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when tenant exists but is not active', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(inactiveTenant);

      await expect(
        service.checkAvailability('closed-wash', baseAvailabilityDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with message "Car wash not found" when slug missing', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(null);

      await expect(service.getPublicServices('no-tenant')).rejects.toThrow(
        'Car wash not found',
      );
    });

    it('should throw NotFoundException with message "Car wash not found" when inactive', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(inactiveTenant);

      await expect(service.getPublicBranches('closed-wash')).rejects.toThrow(
        'Car wash not found',
      );
    });
  });

  describe('checkAvailability', () => {
    it('should resolve tenant and delegate to schedulingService', async () => {
      const mockSlots = [
        { start: new Date(), end: new Date(), available: true },
      ];
      tenantsRepo.findBySlug.mockResolvedValue(activeTenant);
      schedulingService.checkAvailability.mockResolvedValue(mockSlots);

      const result = await service.checkAvailability(
        'clean-wash',
        baseAvailabilityDto,
      );

      expect(tenantsRepo.findBySlug).toHaveBeenCalledWith('clean-wash');
      expect(schedulingService.checkAvailability).toHaveBeenCalledWith({
        tenantId: activeTenant.id,
        branchId: baseAvailabilityDto.branchId,
        workPostId: baseAvailabilityDto.workPostId,
        date: new Date(baseAvailabilityDto.date),
        durationMinutes: baseAvailabilityDto.durationMinutes,
      });
      expect(result).toBe(mockSlots);
    });

    it('should default durationMinutes to 30 when not provided', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(activeTenant);
      schedulingService.checkAvailability.mockResolvedValue([]);
      const dtoWithoutDuration: CheckAvailabilityDto = {
        branchId: 'branch-1',
        date: '2026-03-01',
      };

      await service.checkAvailability('clean-wash', dtoWithoutDuration);

      expect(schedulingService.checkAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 30 }),
      );
    });

    it('should pass workPostId when provided in dto', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(activeTenant);
      schedulingService.checkAvailability.mockResolvedValue([]);
      const dto: CheckAvailabilityDto = {
        branchId: 'branch-1',
        date: '2026-03-01',
        workPostId: 'wp-specific',
      };

      await service.checkAvailability('clean-wash', dto);

      expect(schedulingService.checkAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ workPostId: 'wp-specific' }),
      );
    });

    it('should not call schedulingService when tenant not found', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(null);

      await expect(
        service.checkAvailability('bad-slug', baseAvailabilityDto),
      ).rejects.toThrow(NotFoundException);

      expect(schedulingService.checkAvailability).not.toHaveBeenCalled();
    });
  });

  describe('getPublicServices', () => {
    it('should resolve tenant then return active services', async () => {
      const mockServices = [{ id: 'svc-1', name: 'Basic Wash' }];
      tenantsRepo.findBySlug.mockResolvedValue(activeTenant);
      servicesRepo.findActive.mockResolvedValue(mockServices);

      const result = await service.getPublicServices('clean-wash');

      expect(tenantsRepo.findBySlug).toHaveBeenCalledWith('clean-wash');
      expect(servicesRepo.findActive).toHaveBeenCalledWith(activeTenant.id);
      expect(result).toBe(mockServices);
    });

    it('should not call servicesRepo when tenant not found', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(null);

      await expect(service.getPublicServices('bad-slug')).rejects.toThrow(
        NotFoundException,
      );

      expect(servicesRepo.findActive).not.toHaveBeenCalled();
    });
  });

  describe('getPublicBranches', () => {
    it('should resolve tenant then return active branches', async () => {
      const mockBranches = [{ id: 'branch-1', name: 'Main Branch' }];
      tenantsRepo.findBySlug.mockResolvedValue(activeTenant);
      branchesRepo.findActive.mockResolvedValue(mockBranches);

      const result = await service.getPublicBranches('clean-wash');

      expect(tenantsRepo.findBySlug).toHaveBeenCalledWith('clean-wash');
      expect(branchesRepo.findActive).toHaveBeenCalledWith(activeTenant.id);
      expect(result).toBe(mockBranches);
    });

    it('should not call branchesRepo when tenant is inactive', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(inactiveTenant);

      await expect(service.getPublicBranches('closed-wash')).rejects.toThrow(
        NotFoundException,
      );

      expect(branchesRepo.findActive).not.toHaveBeenCalled();
    });
  });

  describe('createBooking', () => {
    const mockClient = { id: 'client-1', phone: '+1234567890' };
    const mockVehicle = { id: 'vehicle-1', licensePlate: 'ABC123' };
    const mockOrder = { id: 'order-1' };

    beforeEach(() => {
      tenantsRepo.findBySlug.mockResolvedValue(activeTenant);
      prisma.bookingSettings.findUnique.mockResolvedValue({
        allowOnlineBooking: true,
      });
      prisma.client.findFirst.mockResolvedValue(mockClient);
      prisma.vehicle.findFirst.mockResolvedValue(mockVehicle);
      ordersService.create.mockResolvedValue(mockOrder);
    });

    it('should resolve tenant before processing the booking', async () => {
      await service.createBooking('clean-wash', baseBookingDto);
      expect(tenantsRepo.findBySlug).toHaveBeenCalledWith('clean-wash');
    });

    it('should check booking settings for the resolved tenant', async () => {
      await service.createBooking('clean-wash', baseBookingDto);
      expect(prisma.bookingSettings.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_branchId: {
            tenantId: activeTenant.id,
            branchId: baseBookingDto.branchId,
          },
        },
      });
    });

    it('should throw ForbiddenException when allowOnlineBooking is false', async () => {
      prisma.bookingSettings.findUnique.mockResolvedValue({
        allowOnlineBooking: false,
      });

      await expect(
        service.createBooking('clean-wash', baseBookingDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow booking when no settings found (falls back to defaults with allowOnlineBooking: true)', async () => {
      prisma.bookingSettings.findUnique.mockResolvedValue(null);
      prisma.bookingSettings.findFirst.mockResolvedValue(null);

      const result = await service.createBooking('clean-wash', baseBookingDto);

      expect(result).toBe(mockOrder);
    });

    it('should not call ordersService when booking is disabled', async () => {
      prisma.bookingSettings.findUnique.mockResolvedValue({
        allowOnlineBooking: false,
      });

      await expect(
        service.createBooking('clean-wash', baseBookingDto),
      ).rejects.toThrow(ForbiddenException);

      expect(ordersService.create).not.toHaveBeenCalled();
    });

    it('should delegate to ordersService.create with source WEB', async () => {
      await service.createBooking('clean-wash', baseBookingDto);

      expect(ordersService.create).toHaveBeenCalledWith(
        activeTenant.id,
        expect.objectContaining({ source: 'WEB' }),
        null,
        undefined,
      );
    });

    it('should pass idempotencyKey to ordersService.create', async () => {
      const idemKey = 'idem-key-abc';
      await service.createBooking('clean-wash', baseBookingDto, idemKey);

      expect(ordersService.create).toHaveBeenCalledWith(
        activeTenant.id,
        expect.anything(),
        null,
        idemKey,
      );
    });

    it('should pass null as userId to ordersService.create for public booking', async () => {
      await service.createBooking('clean-wash', baseBookingDto);

      // Third positional argument (userId) must be null for anonymous public bookings
      const [, , userId] = ordersService.create.mock.calls[0];
      expect(userId).toBeNull();
    });

    it('should pass correct order fields from dto to ordersService.create', async () => {
      await service.createBooking('clean-wash', baseBookingDto);

      expect(ordersService.create).toHaveBeenCalledWith(
        activeTenant.id,
        expect.objectContaining({
          branchId: baseBookingDto.branchId,
          clientId: mockClient.id,
          vehicleId: mockVehicle.id,
          workPostId: baseBookingDto.workPostId,
          scheduledStart: baseBookingDto.scheduledStart,
          serviceIds: baseBookingDto.serviceIds,
          source: 'WEB',
          notes: baseBookingDto.notes,
        }),
        null,
        undefined,
      );
    });

    describe('client resolution', () => {
      it('should reuse an existing client when found by phone', async () => {
        prisma.client.findFirst.mockResolvedValue(mockClient);

        await service.createBooking('clean-wash', baseBookingDto);

        expect(prisma.client.findFirst).toHaveBeenCalledWith({
          where: {
            tenantId: activeTenant.id,
            phone: baseBookingDto.phone,
            deletedAt: null,
          },
        });
        expect(prisma.client.create).not.toHaveBeenCalled();
        expect(ordersService.create).toHaveBeenCalledWith(
          activeTenant.id,
          expect.objectContaining({ clientId: mockClient.id }),
          null,
          undefined,
        );
      });

      it('should create a new client when not found by phone', async () => {
        const newClient = { id: 'client-new', phone: '+1234567890' };
        prisma.client.findFirst.mockResolvedValue(null);
        prisma.client.create.mockResolvedValue(newClient);

        await service.createBooking('clean-wash', baseBookingDto);

        expect(prisma.client.create).toHaveBeenCalledWith({
          data: {
            tenantId: activeTenant.id,
            firstName: baseBookingDto.firstName,
            lastName: baseBookingDto.lastName,
            phone: baseBookingDto.phone,
            email: baseBookingDto.email,
          },
        });
        expect(ordersService.create).toHaveBeenCalledWith(
          activeTenant.id,
          expect.objectContaining({ clientId: newClient.id }),
          null,
          undefined,
        );
      });
    });

    describe('vehicle resolution', () => {
      it('should reuse an existing vehicle when found by license plate', async () => {
        prisma.client.findFirst.mockResolvedValue(mockClient);
        prisma.vehicle.findFirst.mockResolvedValue(mockVehicle);

        await service.createBooking('clean-wash', baseBookingDto);

        expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
          where: {
            tenantId: activeTenant.id,
            clientId: mockClient.id,
            licensePlate: baseBookingDto.licensePlate,
          },
        });
        expect(prisma.vehicle.create).not.toHaveBeenCalled();
        expect(ordersService.create).toHaveBeenCalledWith(
          activeTenant.id,
          expect.objectContaining({ vehicleId: mockVehicle.id }),
          null,
          undefined,
        );
      });

      it('should create a new vehicle when not found', async () => {
        const newVehicle = { id: 'vehicle-new', licensePlate: 'ABC123' };
        prisma.client.findFirst.mockResolvedValue(mockClient);
        prisma.vehicle.findFirst.mockResolvedValue(null);
        prisma.vehicle.create.mockResolvedValue(newVehicle);

        await service.createBooking('clean-wash', baseBookingDto);

        expect(prisma.vehicle.create).toHaveBeenCalledWith({
          data: {
            tenantId: activeTenant.id,
            clientId: mockClient.id,
            licensePlate: baseBookingDto.licensePlate,
            make: baseBookingDto.vehicleMake,
            model: baseBookingDto.vehicleModel,
          },
        });
        expect(ordersService.create).toHaveBeenCalledWith(
          activeTenant.id,
          expect.objectContaining({ vehicleId: newVehicle.id }),
          null,
          undefined,
        );
      });

      it('should use "Unknown" as make when vehicleMake is not provided', async () => {
        const dtoWithoutMake: CreateBookingDto = {
          ...baseBookingDto,
          vehicleMake: undefined,
        };
        prisma.client.findFirst.mockResolvedValue(mockClient);
        prisma.vehicle.findFirst.mockResolvedValue(null);
        prisma.vehicle.create.mockResolvedValue({
          id: 'vehicle-2',
          licensePlate: 'ABC123',
        });

        await service.createBooking('clean-wash', dtoWithoutMake);

        expect(prisma.vehicle.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ make: 'Unknown' }),
          }),
        );
      });

      it('should use the new client id when looking up the vehicle for a newly created client', async () => {
        const newClient = { id: 'client-brand-new', phone: '+1234567890' };
        const newVehicle = { id: 'vehicle-brand-new', licensePlate: 'NEW999' };
        prisma.client.findFirst.mockResolvedValue(null);
        prisma.client.create.mockResolvedValue(newClient);
        prisma.vehicle.findFirst.mockResolvedValue(null);
        prisma.vehicle.create.mockResolvedValue(newVehicle);

        await service.createBooking('clean-wash', {
          ...baseBookingDto,
          phone: '+1234567890',
        });

        expect(prisma.vehicle.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ clientId: newClient.id }),
          }),
        );
      });
    });

    it('should return the result from ordersService.create', async () => {
      ordersService.create.mockResolvedValue(mockOrder);

      const result = await service.createBooking('clean-wash', baseBookingDto);

      expect(result).toBe(mockOrder);
    });
  });
});
