import type { ProductStatus } from "../domain/product";

export interface ProductRecord {
  id: string;
  code: string;
  commercialName: string;
  activeIngredient: string | null;
  brand: string | null;
  laboratory: string | null;
  barcode: string | null;
  sku: string | null;
  categoryId: string;
  categoryName: string;
  presentation: string | null;
  concentration: string | null;
  pharmaceuticalForm: string | null;
  contentPerPackage: string | null;
  unitId: string;
  unitName: string;
  minStock: number;
  maxStock: number | null;
  /** Decimal as a string with 2 decimals (no float rounding). */
  costPrice: string;
  salePrice: string | null;
  usualSupplierId: string | null;
  usualSupplierName: string | null;
  location: string | null;
  status: ProductStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Writable product fields. Optional text fields are `null` when empty. */
export interface ProductData {
  code: string;
  commercialName: string;
  activeIngredient: string | null;
  brand: string | null;
  laboratory: string | null;
  barcode: string | null;
  sku: string | null;
  categoryId: string;
  presentation: string | null;
  concentration: string | null;
  pharmaceuticalForm: string | null;
  contentPerPackage: string | null;
  unitId: string;
  minStock: number;
  maxStock: number | null;
  costPrice: string;
  salePrice: string | null;
  usualSupplierId: string | null;
  location: string | null;
  status: ProductStatus;
  notes: string | null;
}

export const PRODUCT_SORT_FIELDS = ["name", "code", "category", "minStock", "updatedAt"] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

/** Status filter: "" hides archived products, "ALL" shows everything. */
export const PRODUCT_STATUS_FILTERS = ["", "ACTIVE", "INACTIVE", "ARCHIVED", "ALL"] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number];

export interface ProductListQuery {
  search?: string;
  categoryId?: string;
  supplierId?: string;
  status: ProductStatusFilter;
  sort: ProductSortField;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface ProductRepository {
  findById(id: string): Promise<ProductRecord | null>;
  findByBarcode(barcode: string): Promise<ProductRecord | null>;
  /** The conflicting field ("code" | "barcode" | "sku") for another product, if any. */
  findDuplicateField(data: Pick<ProductData, "code" | "barcode" | "sku">, excludeId?: string): Promise<DuplicateField | null>;
  create(data: ProductData): Promise<ProductRecord>;
  update(id: string, data: ProductData): Promise<ProductRecord>;
  setStatus(id: string, status: ProductStatus): Promise<void>;
  list(query: ProductListQuery): Promise<Page<ProductRecord>>;
}

export type DuplicateField = "code" | "barcode" | "sku";

export interface TaxonomyRecord {
  id: string;
  name: string;
  active: boolean;
  productCount: number;
}

/** Categories and units share one shape (name + active flag + usage count). */
export interface TaxonomyRepository {
  list(): Promise<TaxonomyRecord[]>;
  findById(id: string): Promise<TaxonomyRecord | null>;
  /** Case-insensitive name lookup. */
  findByName(name: string): Promise<TaxonomyRecord | null>;
  create(name: string): Promise<TaxonomyRecord>;
  rename(id: string, name: string): Promise<void>;
  setActive(id: string, active: boolean): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SupplierOption {
  id: string;
  name: string;
}

/** Read-only view of suppliers (the suppliers module arrives later; products only reference them). */
export interface SupplierLookup {
  listOptions(): Promise<SupplierOption[]>;
  exists(id: string): Promise<boolean>;
}
