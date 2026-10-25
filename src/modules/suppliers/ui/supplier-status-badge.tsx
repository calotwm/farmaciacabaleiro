import { Badge } from "@/components/ui/badge";
import { SUPPLIER_STATUS_LABELS, type SupplierStatus } from "../domain/supplier";

export function SupplierStatusBadge({ status }: { status: SupplierStatus }) {
  return <Badge variant={status === "ACTIVE" ? "secondary" : "outline"}>{SUPPLIER_STATUS_LABELS[status]}</Badge>;
}
