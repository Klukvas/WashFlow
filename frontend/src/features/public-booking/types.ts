export type {
  CheckAvailabilityParams,
  CreateBookingPayload,
} from './api/booking.api';

export type BookingConfirmation = {
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
