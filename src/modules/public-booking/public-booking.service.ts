import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TenantsRepository } from '../tenants/tenants.repository';
import { SchedulingService } from '../scheduling/scheduling.service';
import { OrdersService } from '../orders/orders.service';
import { ServicesRepository } from '../services/services.repository';
import { BranchesRepository } from '../branches/branches.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveBookingSettings } from '../../common/utils/booking-settings.util';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class PublicBookingService {
  constructor(
    private readonly tenantsRepo: TenantsRepository,
    private readonly schedulingService: SchedulingService,
    private readonly ordersService: OrdersService,
    private readonly servicesRepo: ServicesRepository,
    private readonly branchesRepo: BranchesRepository,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveTenant(slug: string) {
    const tenant = await this.tenantsRepo.findBySlug(slug);
    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Car wash not found');
    }
    return tenant;
  }

  async checkAvailability(slug: string, dto: CheckAvailabilityDto) {
    const tenant = await this.resolveTenant(slug);
    return this.schedulingService.checkAvailability({
      tenantId: tenant.id,
      branchId: dto.branchId,
      workPostId: dto.workPostId,
      date: new Date(dto.date),
      durationMinutes: dto.durationMinutes || 30,
    });
  }

  async getPublicServices(slug: string) {
    const tenant = await this.resolveTenant(slug);
    return this.servicesRepo.findActive(tenant.id);
  }

  async getPublicBranches(slug: string) {
    const tenant = await this.resolveTenant(slug);
    return this.branchesRepo.findActive(tenant.id);
  }

  async createBooking(
    slug: string,
    dto: CreateBookingDto,
    idempotencyKey?: string,
  ) {
    const tenant = await this.resolveTenant(slug);

    // Check if online booking is enabled (branch-level → tenant → defaults)
    const settings = await resolveBookingSettings(
      this.prisma,
      tenant.id,
      dto.branchId,
    );
    if (!settings.allowOnlineBooking) {
      throw new ForbiddenException('Online booking is not available');
    }

    // Find or create client
    let client = await this.prisma.client.findFirst({
      where: { tenantId: tenant.id, phone: dto.phone, deletedAt: null },
    });

    if (!client) {
      client = await this.prisma.client.create({
        data: {
          tenantId: tenant.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
        },
      });
    }

    // Find or create vehicle
    let vehicle = await this.prisma.vehicle.findFirst({
      where: {
        tenantId: tenant.id,
        clientId: client.id,
        licensePlate: dto.licensePlate,
        deletedAt: null,
      },
    });

    if (!vehicle) {
      vehicle = await this.prisma.vehicle.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          licensePlate: dto.licensePlate,
          make: dto.vehicleMake || 'Unknown',
          model: dto.vehicleModel,
        },
      });
    }

    // Delegate to OrdersService with source WEB
    try {
      return await this.ordersService.create(
        tenant.id,
        {
          branchId: dto.branchId,
          clientId: client.id,
          vehicleId: vehicle.id,
          workPostId: dto.workPostId,
          scheduledStart: dto.scheduledStart,
          serviceIds: dto.serviceIds,
          source: 'WEB',
          notes: dto.notes,
        },
        null, // No userId for public booking
        idempotencyKey,
      );
    } catch (err) {
      if (
        err instanceof BadRequestException &&
        (err.message.includes('No available employees') ||
          err.message.includes('No available work posts'))
      ) {
        throw new ConflictException(
          'This time slot just became unavailable. Please select a different time.',
        );
      }
      throw err;
    }
  }
}
