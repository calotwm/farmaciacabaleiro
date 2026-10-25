import { Badge } from "@/components/ui/badge";
import { PRODUCT_STATUS_LABELS, type ProductStatus } from "../domain/product";

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const variant = status === "ACTIVE" ? "secondary" : "outline";
  return <Badge variant={variant}>{PRODUCT_STATUS_LABELS[status]}</Badge>;
}
