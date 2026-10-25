import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReceiptSummary } from "../application/ports";
import { ReceiptsTable } from "./receipts-table";

/** A short list of receipts inside another page (supplier or delivery detail). */
export function ReceiptsCard({ title, receipts, showSupplier = false }: { title: string; receipts: ReceiptSummary[]; showSupplier?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ReceiptsTable receipts={receipts} showSupplier={showSupplier} />
      </CardContent>
    </Card>
  );
}
