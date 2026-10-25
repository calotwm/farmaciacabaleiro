import type { SupplierStatus } from "../domain/supplier";

export interface SupplierRecord {
  id: string;
  name: string;
  /** 11 digits without separators (see domain/cuit.ts). */
  cuit: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  visitDays: number[];
  deliveryHours: string | null;
  leadTimeDays: number | null;
  status: SupplierStatus;
  notes: string | null;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Writable supplier fields. Optional text fields are `null` when empty. */
export interface SupplierData {
  name: string;
  cuit: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  visitDays: number[];
  deliveryHours: string | null;
  leadTimeDays: number | null;
  status: SupplierStatus;
  notes: string | null;
}

export const SUPPLIER_SORT_FIELDS = ["name", "cuit", "status", "leadTime", "updatedAt"] as const;
export type SupplierSortField = (typeof SUPPLIER_SORT_FIELDS)[number];

/** Status filter: "" shows every supplier. */
export const SUPPLIER_STATUS_FILTERS = ["", "ACTIVE", "INACTIVE"] as const;
export type SupplierStatusFilter = (typeof SUPPLIER_STATUS_FILTERS)[number];

export interface SupplierListQuery {
  /** Matches the name, the contact name or the CUIT (digits). */
  search?: string;
  status: SupplierStatusFilter;
  sort: SupplierSortField;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface SuppliedProduct {
  productId: string;
  code: string;
  name: string;
  barcode: string | null;
  productStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  linkedAt: Date;
}

export interface ProductRef {
  id: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}

export interface SupplierRepository {
  findById(id: string): Promise<SupplierRecord | null>;
  /** True when another supplier already has this CUIT. */
  cuitTaken(cuit: string, excludeId?: string): Promise<boolean>;
  create(data: SupplierData): Promise<SupplierRecord>;
  update(id: string, data: SupplierData): Promise<SupplierRecord>;
  setStatus(id: string, status: SupplierStatus): Promise<void>;
  list(query: SupplierListQuery): Promise<Page<SupplierRecord>>;

  listProducts(supplierId: string): Promise<SuppliedProduct[]>;
  findProduct(productId: string): Promise<ProductRef | null>;
  isProductLinked(supplierId: string, productId: string): Promise<boolean>;
  addProduct(supplierId: string, productId: string): Promise<void>;
  removeProduct(supplierId: string, productId: string): Promise<boolean>;
}
