export interface OrderConfirmationData {
  orderNumber: string;
  clientName: string;
  vehicleInfo: string;
  scheduledDate: string;
  services: string[];
  totalPrice: string;
}

export interface StatusUpdateData {
  orderNumber: string;
  clientName: string;
  newStatus: string;
  vehicleInfo: string;
}

export interface BookingReminderData {
  orderNumber: string;
  clientName: string;
  scheduledDate: string;
  branchName: string;
  branchAddress?: string;
}
