import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getReceivingModule } from "@/modules/receiving/composition";
import { StartUnscheduledReceiptForm } from "@/modules/receiving/ui/start-receipt-form";

export const metadata: Metadata = { title: "Recepción sin programar - Farmacia Cabaleiro" };

export default async function NewReceiptPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "receiving.write")) return <AccessDenied message="No tenés permiso para registrar recepciones." />;

  const suppliers = await getReceivingModule().receivingService.listSupplierOptions(user);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Recepción sin programar</h1>
        <p className="text-muted-foreground text-sm">Para una compra que no estaba en el calendario. Si es un reparto programado, recibilo desde su entrega.</p>
      </div>
      <StartUnscheduledReceiptForm suppliers={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))} />
    </div>
  );
}
