import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getDeliveriesModule } from "@/modules/deliveries/composition";
import { isOpenDelivery } from "@/modules/deliveries/domain/delivery-status";
import { DeliveryForm } from "@/modules/deliveries/ui/delivery-form";
import { todayInTz } from "@/shared/domain/dates";
import { hasErrorCode } from "@/shared/domain/errors";
import { isUuid } from "@/shared/domain/ids";

export const metadata: Metadata = { title: "Editar entrega - Farmacia Cabaleiro" };

export default async function EditDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "deliveries.write")) return <AccessDenied message="No tenés permiso para editar entregas." />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { deliveryService } = getDeliveriesModule();
  const delivery = await deliveryService.getDelivery(user, id).catch((error) => {
    if (hasErrorCode(error, "NOT_FOUND")) return null;
    throw error;
  });
  if (!delivery || !isOpenDelivery(delivery.status)) notFound();

  const { users } = await deliveryService.listOptions(user);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Editar entrega o visita</h1>
      <DeliveryForm delivery={delivery} suppliers={[]} users={users.map((candidate) => ({ value: candidate.id, label: candidate.name }))} today={todayInTz()} />
    </div>
  );
}
