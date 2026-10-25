import Link from "next/link";
import { PRIORITY_DOT, PRIORITY_LABELS, type NotificationPriority } from "@/modules/alerts/ui/priority";
import { MOVEMENT_TYPE_LABELS } from "@/modules/inventory/domain/movement-type";
import type { MovementType } from "@/modules/inventory/domain/movement-type";
import { formatDateTime } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";

export interface LatestMovement {
  id: string;
  type: MovementType;
  quantity: number;
  occurredAt: Date;
  product: { id: string; commercialName: string };
  lot: { lotNumber: string };
}

export interface UnreadAlert {
  id: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  link: string | null;
  createdAt: Date;
}

export function LatestMovements({ movements }: { movements: LatestMovement[] }) {
  return (
    <section aria-labelledby="latest-movements" className="grid content-start gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="latest-movements" className="text-lg font-medium">
          Últimos movimientos
        </h2>
        <Link href="/movimientos" className="text-sm underline underline-offset-4">
          Ver todos
        </Link>
      </div>
      {movements.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay movimientos.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {movements.map((movement) => (
            <li key={movement.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm">
              <span>
                <Link href={`/productos/${movement.product.id}`} className="font-medium underline-offset-4 hover:underline">
                  {movement.product.commercialName}
                </Link>
                <span className="text-muted-foreground"> · lote {movement.lot.lotNumber}</span>
              </span>
              <span className="text-muted-foreground">
                {MOVEMENT_TYPE_LABELS[movement.type]} ({movement.quantity}) · {formatDateTime(movement.occurredAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function UnreadAlerts({ alerts, total }: { alerts: UnreadAlert[]; total: number }) {
  return (
    <section aria-labelledby="unread-alerts" className="grid content-start gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="unread-alerts" className="text-lg font-medium">
          Alertas sin leer{total > 0 ? ` (${total})` : ""}
        </h2>
        <Link href="/notificaciones" className="text-sm underline underline-offset-4">
          Ver todas
        </Link>
      </div>
      {alerts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay alertas sin leer.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {alerts.map((alert) => (
            <li key={alert.id} className="grid gap-0.5 px-4 py-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[alert.priority])} />
                <span className="sr-only">Prioridad {PRIORITY_LABELS[alert.priority]}: </span>
                {alert.link ? (
                  <Link href={alert.link} className="underline-offset-4 hover:underline">
                    {alert.title}
                  </Link>
                ) : (
                  alert.title
                )}
              </span>
              <span className="text-muted-foreground">{alert.body}</span>
              <span className="text-muted-foreground text-xs">{formatDateTime(alert.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
