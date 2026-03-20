export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
}

export interface OrderService {
  id: string;
  orderId: string;
  serviceId: string;
  price: number;
  quantity: number;
  service: {
    id: string;
    name: string;
    durationMin: number;
    price: number;
  };
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}

export interface Vehicle {
  id: string;
  licensePlate: string | null;
  make: string;
  model: string | null;
}

export interface Order {
  id: string;
  tenantId: string;
  branchId: string;
  scheduledStart: string;
  scheduledEnd: string;
  totalPrice: number;
  notes: string | null;
  branch?: Branch;
  client?: Client;
  vehicle?: Vehicle;
  services?: OrderService[];
}
