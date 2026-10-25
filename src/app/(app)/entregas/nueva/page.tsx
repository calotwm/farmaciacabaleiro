import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getDeliveriesModule } from "@/modules/deliveries/composition";
import { DeliveryForm } from "@/modules/deliveries/ui/delivery-form";
import { type SearchParams, uuidParam } from "@/shared/application/list-query";
import { todayInTz } from "@/shared/domain/dates";

export const metadata: Metadata = { title: "Programar entrega - Farmacia Cabaleiro" };

export default async function NewDeliveryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "deliveries.write")) return <AccessDenied message="No tenés permiso para programar entregas." />;

  const sp = await searchParams;
  const { suppliers, users } = await getDeliveriesModule().deliveryService.listOptions(user);

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Programar entrega o visita</h1>
      <DeliveryForm
        suppliers={suppliers.filter((supplier) => supplier.active).map((supplier) => ({ value: supplier.id, label: supplier.name }))}
        users={users.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
        defaultSupplierId={uuidParam(sp.supplierId)}
        defaultResponsibleId={user.id}
        today={todayInTz()}
      />
    </div>
  );
}
