import { Prisma } from '@prisma/client';
import { CreateBookingDto } from './create-booking.dto';

export type BookingConfirmationDto = {
  id: string;
  branchId: string;
  scheduledStart: string;
  scheduledEnd: string;
  totalPrice: number;
  branch: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
  };
  client: { firstName: string; lastName: string | null; phone: string };
  vehicle: { licensePlate: string; make: string | null; model: string | null };
  services: {
    id: string;
    serviceId: string;
    price: number;
    quantity: number;
    service: { id: string; name: string; durationMin: number; price: number };
  }[];
};

// OrdersService returns these relations for new orders and stored idempotency bodies.
export type ConfirmationOrder = Prisma.OrderGetPayload<{
  include: { branch: true; services: { include: { service: true } } };
}>;

export function toBookingConfirmation(
  order: ConfirmationOrder,
  submitted: CreateBookingDto,
): BookingConfirmationDto {
  return {
    id: order.id,
    branchId: order.branchId,
    scheduledStart: new Date(order.scheduledStart).toISOString(),
    scheduledEnd: new Date(order.scheduledEnd).toISOString(),
    totalPrice: Number(order.totalPrice),
    branch: {
      id: order.branch.id,
      name: order.branch.name,
      address: order.branch.address,
      phone: order.branch.phone,
    },
    // A phone match links records; it does not prove ownership of stored personal data.
    client: {
      firstName: submitted.firstName,
      lastName: submitted.lastName ?? null,
      phone: submitted.phone,
    },
    vehicle: {
      licensePlate: submitted.licensePlate,
      make: submitted.vehicleMake ?? null,
      model: submitted.vehicleModel ?? null,
    },
    services: order.services.map((line) => ({
      id: line.id,
      serviceId: line.serviceId,
      price: Number(line.price),
      quantity: line.quantity,
      service: {
        id: line.service.id,
        name: line.service.name,
        durationMin: line.service.durationMin,
        price: Number(line.service.price),
      },
    })),
  };
}
