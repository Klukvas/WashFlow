import type {
  OrderStatus,
  OrderSource,
  PaymentStatus,
  PaymentMethod,
  AuditAction,
} from './enums';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  settings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingSettings {
  id: string;
  tenantId: string;
  branchId: string | null;
  slotDurationMinutes: number;
  bufferTimeMinutes: number;
  maxAdvanceBookingDays: number;
  allowOnlineBooking: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number[];
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  bookingSettings?: BookingSettings;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface User {
  id: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  roleId: string | null;
  role?: Role;
  branch?: Branch;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions?: Permission[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  description: string | null;
  createdAt: string;
}

export interface Client {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  vehicles?: Vehicle[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Vehicle {
  id: string;
  tenantId: string;
  clientId: string;
  licensePlate: string | null;
  make: string;
  model: string | null;
  color: string | null;
  year: number | null;
  photoUrl: string | null;
  client?: Client;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Service {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface WorkPost {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  branch?: Branch;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  branchId: string;
  clientId: string;
  vehicleId: string;
  workPostId: string | null;
  createdById: string | null;
  status: OrderStatus;
  source: OrderSource;
  scheduledStart: string;
  scheduledEnd: string;
  totalPrice: number;
  notes: string | null;
  cancellationReason: string | null;
  branch?: Branch;
  client?: Client;
  vehicle?: Vehicle;
  workPost?: WorkPost;
  createdBy?: User;
  services?: OrderService[];
  payments?: Payment[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface OrderService {
  id: string;
  orderId: string;
  serviceId: string;
  name: string;
  price: number;
  durationMin: number;
  service?: Service;
}

export interface Payment {
  id: string;
  tenantId: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  order?: Order;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  performedById: string | null;
  performedBy?: User;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface IdempotencyKey {
  id: string;
  tenantId: string;
  key: string;
  response: Record<string, unknown> | null;
  expiresAt: string;
  createdAt: string;
}

export interface EmployeeProfile {
  id: string;
  tenantId: string;
  userId: string;
  user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
  branchId: string;
  branch: Pick<Branch, 'id' | 'name'>;
  isWorker: boolean;
  efficiencyCoefficient: number;
  active: boolean;
  workStartTime: string | null;
  workEndTime: string | null;
  createdAt: string;
  updatedAt: string;
}
