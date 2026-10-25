import type { DeliveryStatus, DeliveryType } from "@/modules/deliveries/domain/delivery-status";

export interface LowStockRow {
  id: string;
  name: string;
  /** Units that can be dispensed right now (expired, quarantined and blocked units excluded). */
  available: number;
  minStock: number;
}

export interface UpcomingDelivery {
  id: string;
  supplierName: string;
  scheduledAt: Date;
  status: DeliveryStatus;
  type: DeliveryType;
}
