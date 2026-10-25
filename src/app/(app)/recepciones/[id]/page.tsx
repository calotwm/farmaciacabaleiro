import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getReceivingModule } from "@/modules/receiving/composition";
import { formatDateTime } from "@/shared/domain/dates";
import { ReceiptBadgesFor } from "@/modules/receiving/ui/receipt-header";
import { ReceiptDetail } from "@/modules/receiving/ui/receipt-detail";
import { ReceiptEditor } from "@/modules/receiving/ui/receipt-editor";
import { hasErrorCode } from "@/shared/domain/errors";
import { isUuid } from "@/shared/domain/ids";

export const metadata: Metadata = { title: "Recepción - Farmacia Cabaleiro" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "receiving.read")) return <AccessDenied message="No tenés permiso para ver las recepciones." />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { receivingService } = getReceivingModule();
  const context = await receivingService.getEditorContext(user, id).catch((error) => {
    if (hasErrorCode(error, "NOT_FOUND")) return null;
    throw error;
  });
  if (!context) notFound();
  const { receipt, expected } = context;

  const editable = receipt.status === "DRAFT" && hasPermission(user, "receiving.write");
  const movements = receipt.status === "CONFIRMED" ? await receivingService.listMovements(user, receipt.id) : [];
  const title = receipt.status === "DRAFT" ? "Recepción en borrador" : "Recepción confirmada";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {title}: {receipt.supplierName}
        </h1>
        <ReceiptBadgesFor receipt={receipt} />
      </div>
      {editable ? (
        <>
          <p className="text-muted-foreground text-sm">
            {receipt.deliveryScheduledAt ? `Entrega programada para el ${formatDateTime(receipt.deliveryScheduledAt)}.` : "Recepción sin entrega programada."} Podés guardar el
            borrador y seguir más tarde.
          </p>
          <ReceiptEditor
            receipt={{
              id: receipt.id,
              idempotencyKey: receipt.idempotencyKey,
              supplierName: receipt.supplierName,
              deliveryId: receipt.deliveryId,
              deliveryLabel: receipt.deliveryScheduledAt ? formatDateTime(receipt.deliveryScheduledAt) : null,
              invoiceNumber: receipt.invoiceNumber,
              notes: receipt.notes,
              isPartial: receipt.isPartial,
              lines: receipt.lines,
              manualIssues: receipt.issues.filter((issue) => issue.type === "WRONG_PRODUCT" || issue.type === "OTHER"),
            }}
            expected={expected}
          />
        </>
      ) : (
        <ReceiptDetail receipt={receipt} movements={movements} canLinkDelivery={hasPermission(user, "deliveries.read")} />
      )}
    </div>
  );
}
