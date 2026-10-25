import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DELIVERY_ALERT_LABELS, deliveryAlertState } from "@/modules/deliveries/domain/delivery-schedule";
import { DELIVERY_TYPE_LABELS } from "@/modules/deliveries/domain/delivery-status";
import { DeliveryStatusBadge } from "@/modules/deliveries/ui/delivery-badges";
import { formatDateTime } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import type { UpcomingDelivery } from "../domain/dashboard-lists";
import type { KpiCard } from "../domain/kpi-cards";
import { Panel, PanelMessage } from "./panel";

/** Next scheduled supplier visits (oldest first, so late ones lead and are flagged) plus the delivery counters. */
export function UpcomingDeliveriesPanel({ deliveries, counters, now }: { deliveries: UpcomingDelivery[]; counters: KpiCard[]; now: Date }) {
  return (
    <Panel id="upcoming-deliveries" title="Próximas entregas de proveedores" href="/entregas?open=1" hrefLabel="Ver entregas">
      <ul className="bg-border grid grid-cols-2 gap-px border-b sm:grid-cols-4">
        {counters.map((counter) => (
          <li key={counter.id} className="bg-card">
            <Link href={counter.href} className="hover:bg-muted/60 grid px-4 py-2 transition-colors">
              <span className="text-muted-foreground text-xs">{counter.label}</span>
              <span className={cn("text-lg font-semibold tabular-nums", counter.tone === "danger" && "text-danger-soft-foreground")}>
                {counter.value.toLocaleString("es-AR")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {deliveries.length === 0 ? (
        <PanelMessage>No hay entregas ni visitas programadas.</PanelMessage>
      ) : (
        <ul className="divide-y">
          {deliveries.map((delivery) => {
            const alert = deliveryAlertState(delivery, now);
            return (
              <li key={delivery.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="grid min-w-0">
                  <Link href={`/entregas/${delivery.id}`} className="truncate font-medium underline-offset-4 hover:underline">
                    {delivery.supplierName}
                  </Link>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatDateTime(delivery.scheduledAt)} · {DELIVERY_TYPE_LABELS[delivery.type]}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  {alert ? <Badge variant={alert === "LATE" ? "danger" : "warning"}>{DELIVERY_ALERT_LABELS[alert]}</Badge> : null}
                  <DeliveryStatusBadge status={delivery.status} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
