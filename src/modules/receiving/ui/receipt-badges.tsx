import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import type { ReceiptStatus } from "../application/ports";

export function ReceiptStatusBadge({ status, isPartial }: { status: ReceiptStatus; isPartial: boolean }) {
  if (status === "DRAFT") return <Badge variant="outline">Borrador</Badge>;
  return (
    <Badge variant="outline" className={cn("border-transparent", "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200")}>
      {isPartial ? "Confirmada (parcial)" : "Confirmada"}
    </Badge>
  );
}

export function ReceiptIssuesBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <Badge variant="destructive">{count === 1 ? "1 problema" : `${count} problemas`}</Badge>;
}
