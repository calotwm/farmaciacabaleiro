import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getDeliveriesModule } from "@/modules/deliveries/composition";
import { deliveryAlertState } from "@/modules/deliveries/domain/delivery-schedule";
import { isOpenDelivery } from "@/modules/deliveries/domain/delivery-status";
import { DeliveryAlertBadge, DeliveryStatusBadge, DeliveryTypeBadge } from "@/modules/deliveries/ui/delivery-badges";
import { DeliveryControls } from "@/modules/deliveries/ui/delivery-controls";
import { DeliveryDetail } from "@/modules/deliveries/ui/delivery-detail";
import { todayInTz } from "@/shared/domain/dates";
import { hasErrorCode } from "@/shared/domain/errors";
import { isUuid } from "@/shared/domain/ids";

export const metadata: Metadata = { title: "Entrega - Farmacia Cabaleiro" };

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "deliveries.read")) return <AccessDenied message="No tenés permiso para ver las entregas." />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const delivery = await getDeliveriesModule()
    .deliveryService.getDelivery(user, id)
    .catch((error) => {
      if (hasErrorCode(error, "NOT_FOUND")) return null;
      throw error;
    });
  if (!delivery) notFound();

  const now = new Date();
  const canWrite = hasPermission(user, "deliveries.write");
  const open = isOpenDelivery(delivery.status);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{delivery.supplierName}</h1>
          <DeliveryTypeBadge type={delivery.type} />
          <DeliveryStatusBadge status={delivery.status} />
          <DeliveryAlertBadge alert={deliveryAlertState(delivery, now)} />
        </div>
        {canWrite && open ? (
          <Button asChild variant="outline">
            <Link href={`/entregas/${delivery.id}/editar`}>Editar</Link>
          </Button>
        ) : null}
      </div>
      {canWrite ? <DeliveryControls deliveryId={delivery.id} status={delivery.status} type={delivery.type} today={todayInTz(now)} /> : null}
      <DeliveryDetail delivery={delivery} />
    </div>
  );
}
