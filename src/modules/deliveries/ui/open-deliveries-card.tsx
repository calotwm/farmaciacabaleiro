import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/shared/domain/dates";
import type { DeliverySummary } from "../application/ports";
import { deliveryAlertState } from "../domain/delivery-schedule";
import { DeliveryAlertBadge, DeliveryStatusBadge, DeliveryTypeBadge } from "./delivery-badges";

interface OpenDeliveriesCardProps {
  supplierId: string;
  deliveries: DeliverySummary[];
  now: Date;
  canSchedule: boolean;
}

/** "Próximas entregas" of a supplier: open deliveries and visits, overdue ones first. */
export function OpenDeliveriesCard({ supplierId, deliveries, now, canSchedule }: OpenDeliveriesCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Próximas entregas</CardTitle>
        {canSchedule ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/entregas/nueva?supplierId=${supplierId}`}>Programar entrega</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {deliveries.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay entregas ni visitas pendientes con este proveedor.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Entregas pendientes del proveedor">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Link href={`/entregas/${delivery.id}`} className="font-medium underline-offset-4 hover:underline">
                  {formatDateTime(delivery.scheduledAt)}
                </Link>
                <DeliveryTypeBadge type={delivery.type} />
                <DeliveryStatusBadge status={delivery.status} />
                <DeliveryAlertBadge alert={deliveryAlertState(delivery, now)} />
                {delivery.orderNumber ? <span className="text-muted-foreground">Pedido {delivery.orderNumber}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
