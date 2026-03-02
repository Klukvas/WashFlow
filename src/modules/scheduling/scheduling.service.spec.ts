import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { SchedulingRepository } from './scheduling.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { WorkforceRepository } from '../workforce/workforce.repository';

describe('SchedulingService', () => {
  let service: SchedulingService;
  let schedulingRepo: jest.Mocked<SchedulingRepository>;
  let workforceRepo: jest.Mocked<WorkforceRepository>;
  let prisma: {
    bookingSettings: { findUnique: jest.Mock; findFirst: jest.Mock };
  };
  let tenantPrisma: { forTenant: jest.Mock };

  const mockWorkPostFindMany = jest.fn();
  const mockEmployeeProfileFindMany = jest.fn();
  const mockOrderFindMany = jest.fn();

  beforeEach(async () => {
    mockWorkPostFindMany.mockReset();
    mockEmployeeProfileFindMany.mockReset();
    mockOrderFindMany.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        {
          provide: SchedulingRepository,
          useValue: {
            lockOverlappingSlots: jest.fn().mockResolvedValue([]),
            countOverlapping: jest.fn().mockResolvedValue(0),
            findOrdersInRange: jest.fn().mockResolvedValue([]),
            findOrdersForWorkPostsInRange: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: WorkforceRepository,
          useValue: {
            countProfilesForBranch: jest.fn().mockResolvedValue(0),
            findAvailableEmployeesAtSlot: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            bookingSettings: { findUnique: jest.fn(), findFirst: jest.fn() },
          },
        },
        {
          provide: TenantPrismaService,
          useValue: {
            forTenant: jest.fn().mockReturnValue({
              workPost: { findMany: mockWorkPostFindMany },
              employeeProfile: { findMany: mockEmployeeProfileFindMany },
              order: { findMany: mockOrderFindMany },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    schedulingRepo = module.get(SchedulingRepository);
    workforceRepo = module.get(WorkforceRepository);
    prisma = module.get(PrismaService);
    tenantPrisma = module.get(TenantPrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reserveSlot', () => {
    const mockTx = {} as any;
    const baseParams = {
      tenantId: 'tenant-1',
      workPostId: 'wp-1',
      scheduledStart: new Date('2026-03-01T10:00:00Z'),
      scheduledEnd: new Date('2026-03-01T11:00:00Z'),
      bufferMinutes: 10,
    };

    it('should succeed when no conflicts exist', async () => {
      schedulingRepo.countOverlapping.mockResolvedValue(0);

      await expect(
        service.reserveSlot(mockTx, baseParams),
      ).resolves.toBeUndefined();

      expect(schedulingRepo.lockOverlappingSlots).toHaveBeenCalled();
      expect(schedulingRepo.countOverlapping).toHaveBeenCalled();
    });

    it('should throw ConflictException when slot overlaps', async () => {
      schedulingRepo.countOverlapping.mockResolvedValue(1);

      await expect(service.reserveSlot(mockTx, baseParams)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should pass bufferedStart and bufferedEnd to repo (subtracts buffer from start, adds to end)', async () => {
      schedulingRepo.countOverlapping.mockResolvedValue(0);
      const bufferMs = baseParams.bufferMinutes * 60000;
      const expectedBufferedStart = new Date(
        baseParams.scheduledStart.getTime() - bufferMs,
      );
      const expectedBufferedEnd = new Date(
        baseParams.scheduledEnd.getTime() + bufferMs,
      );

      await service.reserveSlot(mockTx, baseParams);

      expect(schedulingRepo.lockOverlappingSlots).toHaveBeenCalledWith(
        mockTx,
        baseParams.tenantId,
        baseParams.workPostId,
        expectedBufferedStart,
        expectedBufferedEnd,
      );
      expect(schedulingRepo.countOverlapping).toHaveBeenCalledWith(
        mockTx,
        baseParams.tenantId,
        baseParams.workPostId,
        expectedBufferedStart,
        expectedBufferedEnd,
      );
    });

    it('should pass tx to both lockOverlappingSlots and countOverlapping', async () => {
      schedulingRepo.countOverlapping.mockResolvedValue(0);
      const specificTx = { id: 'tx-abc' } as any;

      await service.reserveSlot(specificTx, baseParams);

      expect(schedulingRepo.lockOverlappingSlots).toHaveBeenCalledWith(
        specificTx,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(schedulingRepo.countOverlapping).toHaveBeenCalledWith(
        specificTx,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should apply zero buffer correctly', async () => {
      schedulingRepo.countOverlapping.mockResolvedValue(0);
      const params = { ...baseParams, bufferMinutes: 0 };

      await service.reserveSlot(mockTx, params);

      expect(schedulingRepo.lockOverlappingSlots).toHaveBeenCalledWith(
        mockTx,
        params.tenantId,
        params.workPostId,
        params.scheduledStart,
        params.scheduledEnd,
      );
    });
  });

  describe('applyBufferTime', () => {
    it('should apply buffer time correctly', () => {
      const start = new Date('2026-03-01T10:00:00Z');
      const end = new Date('2026-03-01T11:00:00Z');

      const result = service.applyBufferTime(start, end, 10);

      expect(result.bufferedStart.getTime()).toBe(start.getTime() - 10 * 60000);
      expect(result.bufferedEnd.getTime()).toBe(end.getTime() + 10 * 60000);
    });

    it('should return original dates when buffer is 0', () => {
      const start = new Date('2026-03-01T10:00:00Z');
      const end = new Date('2026-03-01T11:00:00Z');

      const result = service.applyBufferTime(start, end, 0);

      expect(result.bufferedStart.getTime()).toBe(start.getTime());
      expect(result.bufferedEnd.getTime()).toBe(end.getTime());
    });

    it('should not mutate the original dates', () => {
      const start = new Date('2026-03-01T10:00:00Z');
      const end = new Date('2026-03-01T11:00:00Z');
      const startTime = start.getTime();
      const endTime = end.getTime();

      service.applyBufferTime(start, end, 15);

      expect(start.getTime()).toBe(startTime);
      expect(end.getTime()).toBe(endTime);
    });
  });

  describe('validateNoOverlap', () => {
    it('should return true when there are no existing orders', async () => {
      schedulingRepo.findOrdersInRange.mockResolvedValue([]);

      const result = await service.validateNoOverlap(
        'tenant-1',
        'wp-1',
        new Date('2026-03-01T10:00:00Z'),
        new Date('2026-03-01T11:00:00Z'),
        10,
      );

      expect(result).toBe(true);
    });

    it('should return false when orders overlap', async () => {
      schedulingRepo.findOrdersInRange.mockResolvedValue([
        {
          scheduledStart: new Date('2026-03-01T10:30:00Z'),
          scheduledEnd: new Date('2026-03-01T11:30:00Z'),
        },
      ] as any);

      const result = await service.validateNoOverlap(
        'tenant-1',
        'wp-1',
        new Date('2026-03-01T10:00:00Z'),
        new Date('2026-03-01T11:00:00Z'),
        10,
      );

      expect(result).toBe(false);
    });

    it('should query with buffered start and end', async () => {
      schedulingRepo.findOrdersInRange.mockResolvedValue([]);
      const start = new Date('2026-03-01T10:00:00Z');
      const end = new Date('2026-03-01T11:00:00Z');
      const bufferMinutes = 10;
      const expectedBufferedStart = new Date(
        start.getTime() - bufferMinutes * 60000,
      );
      const expectedBufferedEnd = new Date(
        end.getTime() + bufferMinutes * 60000,
      );

      await service.validateNoOverlap(
        'tenant-1',
        'wp-1',
        start,
        end,
        bufferMinutes,
      );

      expect(schedulingRepo.findOrdersInRange).toHaveBeenCalledWith(
        'tenant-1',
        'wp-1',
        expectedBufferedStart,
        expectedBufferedEnd,
      );
    });

    it('should return true when only one order exists exactly at the boundary', async () => {
      schedulingRepo.findOrdersInRange.mockResolvedValue([]);

      const result = await service.validateNoOverlap(
        'tenant-1',
        'wp-1',
        new Date('2026-03-01T12:00:00Z'),
        new Date('2026-03-01T13:00:00Z'),
        0,
      );

      expect(result).toBe(true);
    });

    it('should return false when multiple orders exist', async () => {
      schedulingRepo.findOrdersInRange.mockResolvedValue([
        { scheduledStart: new Date(), scheduledEnd: new Date() },
        { scheduledStart: new Date(), scheduledEnd: new Date() },
      ] as any);

      const result = await service.validateNoOverlap(
        'tenant-1',
        'wp-1',
        new Date('2026-03-01T10:00:00Z'),
        new Date('2026-03-01T11:00:00Z'),
        10,
      );

      expect(result).toBe(false);
    });
  });

  describe('checkAvailability', () => {
    const date = new Date('2026-03-02T00:00:00Z'); // Monday
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    const mockSettings = {
      slotDurationMinutes: 30,
      bufferTimeMinutes: 10,
      workingHoursStart: '08:00',
      workingHoursEnd: '09:00', // Only 1 hour so we get 2 slots
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      maxAdvanceBookingDays: 365,
      allowOnlineBooking: true,
    };

    beforeEach(() => {
      prisma.bookingSettings.findUnique.mockResolvedValue(mockSettings);
      schedulingRepo.findOrdersForWorkPostsInRange.mockResolvedValue([]);
    });

    it('should use a specified workPostId instead of fetching all posts', async () => {
      const workPostId = 'wp-explicit';
      mockWorkPostFindMany.mockResolvedValue([
        { id: workPostId, name: 'Post A' },
      ]);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        workPostId,
        date,
        durationMinutes: 30,
      });

      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].workPostId).toBe(workPostId);
    });

    it('should fetch all active work posts when workPostId is not specified', async () => {
      // First call: findMany for branch posts; second call: findMany for name lookup
      mockWorkPostFindMany
        .mockResolvedValueOnce([
          { id: 'wp-1', name: 'Bay 1' },
          { id: 'wp-2', name: 'Bay 2' },
        ])
        .mockResolvedValueOnce([
          { id: 'wp-1', name: 'Bay 1' },
          { id: 'wp-2', name: 'Bay 2' },
        ]);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        date,
        durationMinutes: 30,
      });

      expect(slots.length).toBeGreaterThan(0);
      // forTenant should have been called with the tenantId
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(tenantId);
    });

    it('should use default settings when bookingSettings is null', async () => {
      prisma.bookingSettings.findUnique.mockResolvedValue(null);
      prisma.bookingSettings.findFirst.mockResolvedValue(null);
      mockWorkPostFindMany.mockResolvedValue([{ id: 'wp-1', name: 'Bay 1' }]);
      schedulingRepo.findOrdersForWorkPostsInRange.mockResolvedValue([]);

      // Defaults: slotDuration=30, workStart=08:00, workEnd=20:00 => 24 slots
      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        date,
        durationMinutes: undefined,
      });

      // 08:00 to 20:00 = 720 minutes / 30 minutes per slot = 24 slots
      expect(slots).toHaveLength(24);
    });

    it('should return all slots as available when there are no existing orders', async () => {
      mockWorkPostFindMany.mockResolvedValue([{ id: 'wp-1', name: 'Bay 1' }]);
      schedulingRepo.findOrdersForWorkPostsInRange.mockResolvedValue([]);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        workPostId: 'wp-1',
        date,
        durationMinutes: 30,
      });

      // 08:00 to 09:00 = 60 minutes / 30 minutes per slot = 2 slots
      expect(slots).toHaveLength(2);
      expect(slots.every((s) => s.available)).toBe(true);
    });

    it('should mark a slot as unavailable when an order overlaps', async () => {
      mockWorkPostFindMany.mockResolvedValue([{ id: 'wp-1', name: 'Bay 1' }]);

      // Conflict occupying the entire first slot's buffered window
      const orderStart = new Date(date);
      orderStart.setUTCHours(8, 0, 0, 0);
      const orderEnd = new Date(date);
      orderEnd.setUTCHours(8, 30, 0, 0);
      schedulingRepo.findOrdersForWorkPostsInRange.mockResolvedValue([
        {
          workPostId: 'wp-1',
          scheduledStart: orderStart,
          scheduledEnd: orderEnd,
        },
      ] as any);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        workPostId: 'wp-1',
        date,
        durationMinutes: 30,
      });

      expect(slots[0].available).toBe(false);
    });

    it('should return per-post slots when multiple work posts exist', async () => {
      // Two work posts: wp-1 is busy, wp-2 is free
      mockWorkPostFindMany
        .mockResolvedValueOnce([
          { id: 'wp-1', name: 'Bay 1' },
          { id: 'wp-2', name: 'Bay 2' },
        ])
        .mockResolvedValueOnce([
          { id: 'wp-1', name: 'Bay 1' },
          { id: 'wp-2', name: 'Bay 2' },
        ]);

      const orderStart = new Date(date);
      orderStart.setUTCHours(8, 0, 0, 0);
      const orderEnd = new Date(date);
      orderEnd.setUTCHours(8, 30, 0, 0);

      schedulingRepo.findOrdersForWorkPostsInRange.mockResolvedValue([
        {
          workPostId: 'wp-1',
          scheduledStart: orderStart,
          scheduledEnd: orderEnd,
        },
      ] as any); // wp-1 is busy, wp-2 has no orders

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        date,
        durationMinutes: 30,
      });

      // 2 time windows × 2 work posts = 4 slots
      expect(slots).toHaveLength(4);
      // First time window: wp-1 busy, wp-2 free
      expect(slots[0].workPostId).toBe('wp-1');
      expect(slots[0].available).toBe(false);
      expect(slots[1].workPostId).toBe('wp-2');
      expect(slots[1].available).toBe(true);
    });

    it('should use durationMinutes param over settings value', async () => {
      const settingsWithDuration = { ...mockSettings, slotDurationMinutes: 60 };
      prisma.bookingSettings.findUnique.mockResolvedValue(settingsWithDuration);
      mockWorkPostFindMany.mockResolvedValue([{ id: 'wp-1', name: 'Bay 1' }]);
      schedulingRepo.findOrdersForWorkPostsInRange.mockResolvedValue([]);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        workPostId: 'wp-1',
        date,
        durationMinutes: 30, // override the 60-min setting
      });

      // 08:00 to 09:00 = 60 minutes / 30 minutes per slot = 2 slots
      expect(slots).toHaveLength(2);
    });

    it('should return empty array when no work posts found', async () => {
      mockWorkPostFindMany.mockResolvedValue([]);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        workPostId: undefined,
        date,
        durationMinutes: 30,
      });

      // When workPostIds is empty, the time loop produces no slots.
      expect(slots).toHaveLength(0);
    });

    it('should include workPostName from the name map in each slot', async () => {
      const workPostId = 'wp-named';
      const workPostName = 'Premium Bay';
      mockWorkPostFindMany.mockResolvedValue([
        { id: workPostId, name: workPostName },
      ]);
      schedulingRepo.findOrdersForWorkPostsInRange.mockResolvedValue([]);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        workPostId,
        date,
        durationMinutes: 30,
      });

      expect(slots[0].workPostName).toBe(workPostName);
    });

    it('should set slot start and end times correctly', async () => {
      mockWorkPostFindMany.mockResolvedValue([{ id: 'wp-1', name: 'Bay 1' }]);
      schedulingRepo.findOrdersForWorkPostsInRange.mockResolvedValue([]);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        workPostId: 'wp-1',
        date,
        durationMinutes: 30,
      });

      const expectedStart = new Date(date);
      expectedStart.setUTCHours(8, 0, 0, 0);
      const expectedEnd = new Date(date);
      expectedEnd.setUTCHours(8, 30, 0, 0);

      expect(slots[0].start.getTime()).toBe(expectedStart.getTime());
      expect(slots[0].end.getTime()).toBe(expectedEnd.getTime());
    });
  });

  describe('checkAvailability — workforce capacity cap', () => {
    const date = new Date('2026-03-02T00:00:00Z'); // Monday
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    const mockSettings = {
      slotDurationMinutes: 30,
      bufferTimeMinutes: 0,
      workingHoursStart: '08:00',
      workingHoursEnd: '09:00', // 2 slots only
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      maxAdvanceBookingDays: 365,
      allowOnlineBooking: true,
    };

    beforeEach(() => {
      prisma.bookingSettings.findUnique.mockResolvedValue(mockSettings);
      schedulingRepo.findOrdersForWorkPostsInRange.mockResolvedValue([]);
    });

    it('should fall back to work-post count when branch has zero profiles', async () => {
      // 3 work posts, 0 profiles → capacity = 3
      mockWorkPostFindMany.mockResolvedValue([
        { id: 'wp-1', name: 'Bay 1' },
        { id: 'wp-2', name: 'Bay 2' },
        { id: 'wp-3', name: 'Bay 3' },
      ]);
      workforceRepo.countProfilesForBranch.mockResolvedValue(0);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        date,
        durationMinutes: 30,
      });

      // 2 time windows × 3 work posts = 6 slots, all available
      const available = slots.filter((s) => s.available);
      expect(available).toHaveLength(6);
      // employee queries should NOT be called when 0 profiles
      expect(mockEmployeeProfileFindMany).not.toHaveBeenCalled();
    });

    it('should cap slots to employee count when fewer employees than posts', async () => {
      // 3 work posts, 2 profiles configured, 2 employees available → cap at 2
      mockWorkPostFindMany.mockResolvedValue([
        { id: 'wp-1', name: 'Bay 1' },
        { id: 'wp-2', name: 'Bay 2' },
        { id: 'wp-3', name: 'Bay 3' },
      ]);
      workforceRepo.countProfilesForBranch.mockResolvedValue(2);
      mockEmployeeProfileFindMany.mockResolvedValue([
        { id: 'emp-1', workStartTime: '08:00', workEndTime: '09:00' },
        { id: 'emp-2', workStartTime: '08:00', workEndTime: '09:00' },
      ]);
      mockOrderFindMany.mockResolvedValue([]); // no conflicts

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        date,
        durationMinutes: 30,
      });

      // Each time window: 3 posts free, 2 employees → only 2 posts available
      // 2 time windows × 2 available = 4 available, 2 capped to false
      const available = slots.filter((s) => s.available);
      const unavailable = slots.filter((s) => !s.available);
      expect(available).toHaveLength(4);
      expect(unavailable).toHaveLength(2);
    });

    it('should allow all posts when employees >= posts', async () => {
      // 2 work posts, 3 employees → capacity = 2 (all posts)
      mockWorkPostFindMany.mockResolvedValue([
        { id: 'wp-1', name: 'Bay 1' },
        { id: 'wp-2', name: 'Bay 2' },
      ]);
      workforceRepo.countProfilesForBranch.mockResolvedValue(3);
      mockEmployeeProfileFindMany.mockResolvedValue([
        { id: 'emp-1', workStartTime: '08:00', workEndTime: '09:00' },
        { id: 'emp-2', workStartTime: '08:00', workEndTime: '09:00' },
        { id: 'emp-3', workStartTime: '08:00', workEndTime: '09:00' },
      ]);
      mockOrderFindMany.mockResolvedValue([]);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        date,
        durationMinutes: 30,
      });

      // 2 time windows × 2 posts, all available
      const available = slots.filter((s) => s.available);
      expect(available).toHaveLength(4);
    });

    it('should return zero available slots when no employees are available', async () => {
      // 3 posts configured, profiles exist, but 0 employees match criteria
      mockWorkPostFindMany.mockResolvedValue([
        { id: 'wp-1', name: 'Bay 1' },
        { id: 'wp-2', name: 'Bay 2' },
        { id: 'wp-3', name: 'Bay 3' },
      ]);
      workforceRepo.countProfilesForBranch.mockResolvedValue(3);
      mockEmployeeProfileFindMany.mockResolvedValue([]); // nobody matches criteria

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        date,
        durationMinutes: 30,
      });

      const available = slots.filter((s) => s.available);
      expect(available).toHaveLength(0);
    });

    it('should exclude employee already assigned to overlapping order', async () => {
      // 2 posts, 2 profiles, but emp-1 has a conflicting order → only 1 available per slot
      mockWorkPostFindMany.mockResolvedValue([
        { id: 'wp-1', name: 'Bay 1' },
        { id: 'wp-2', name: 'Bay 2' },
      ]);
      workforceRepo.countProfilesForBranch.mockResolvedValue(2);
      mockEmployeeProfileFindMany.mockResolvedValue([
        { id: 'emp-1', workStartTime: '08:00', workEndTime: '09:00' },
        { id: 'emp-2', workStartTime: '08:00', workEndTime: '09:00' },
      ]);
      // emp-1 has order spanning full window → conflicts with both slots
      mockOrderFindMany.mockResolvedValue([
        {
          assignedEmployeeId: 'emp-1',
          scheduledStart: new Date('2026-03-02T08:00:00Z'),
          scheduledEnd: new Date('2026-03-02T09:00:00Z'),
        },
      ]);

      const slots = await service.checkAvailability({
        tenantId,
        branchId,
        date,
        durationMinutes: 30,
      });

      // 2 posts free, only 1 worker free → cap at 1 per time window
      // 2 windows × 1 = 2 available
      const available = slots.filter((s) => s.available);
      expect(available).toHaveLength(2);
    });
  });
});
