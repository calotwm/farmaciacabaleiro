export const PRODUCT_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Statuses a user can pick in the product form; ARCHIVED is reached through the archive action. */
export const EDITABLE_PRODUCT_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  ARCHIVED: "Archivado",
};

/** Archived products are hidden from lists unless explicitly requested. */
export function isArchived(status: ProductStatus): boolean {
  return status === "ARCHIVED";
}

const CODE_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Internal product code used when the user does not provide one: "P-" + 8 unambiguous characters. */
export function generateProductCode(randomByte: () => number = () => Math.floor(Math.random() * 256)): string {
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += CODE_ALPHABET[randomByte() % CODE_ALPHABET.length];
  return `P-${suffix}`;
}
