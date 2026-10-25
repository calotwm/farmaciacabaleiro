import Link from "next/link";
import { PRIORITY_DOT, PRIORITY_LABELS, type NotificationPriority } from "@/modules/alerts/ui/priority";
import { MOVEMENT_TYPE_LABELS } from "@/modules/inventory/domain/movement-type";
import type { MovementType } from "@/modules/inventory/domain/movement-type";
import { formatDateTime } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import { Panel, PanelMessage } from "./panel";

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
    <Panel id="latest-movements" title="Últimos movimientos" href="/movimientos">
      {movements.length === 0 ? (
        <PanelMessage>Todavía no hay movimientos.</PanelMessage>
      ) : (
        <ul className="divide-y">
          {movements.map((movement) => (
            <li key={movement.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <Link href={`/productos/${movement.product.id}`} className="font-medium underline-offset-4 hover:underline">
                  {movement.product.commercialName}
                </Link>
                <span className="text-muted-foreground"> · lote {movement.lot.lotNumber}</span>
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {MOVEMENT_TYPE_LABELS[movement.type]} ({movement.quantity}) · {formatDateTime(movement.occurredAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function UnreadAlerts({ alerts, total }: { alerts: UnreadAlert[]; total: number }) {
  return (
    <Panel id="unread-alerts" title="Alertas sin leer" count={total} href="/notificaciones" hrefLabel="Ver todas">
      {alerts.length === 0 ? (
        <PanelMessage>No hay alertas sin leer.</PanelMessage>
      ) : (
        <ul className="divide-y">
          {alerts.map((alert) => (
            <li key={alert.id} className="grid gap-0.5 px-4 py-2.5 text-sm">
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
              <span className="text-muted-foreground text-xs tabular-nums">{formatDateTime(alert.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
