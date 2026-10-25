import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buildHref } from "@/shared/application/list-query";
import { type CalendarDate, formatDate, formatTime, todayInTz } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import type { DeliverySummary } from "../application/ports";
import {
  type MonthRef,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT_NAMES,
  buildMonthGrid,
  formatLongDay,
  groupByDay,
  monthKey,
  monthLabel,
  shiftMonth,
} from "../domain/calendar";
import { deliveryAlertState } from "../domain/delivery-schedule";
import { DELIVERY_TYPE_LABELS, deliveryStatusLabel } from "../domain/delivery-status";
import { DELIVERY_STATUS_CLASSES, DeliveryAlertBadge, DeliveryStatusBadge, DeliveryTypeBadge } from "./delivery-badges";

interface DeliveryCalendarProps {
  month: MonthRef;
  deliveries: DeliverySummary[];
  now: Date;
  /** Active filters (supplier, type, status), kept in the navigation links. */
  params: Record<string, string | undefined>;
}

const MAX_PER_DAY = 3;

/** One calendar entry: time, supplier and status (text + color). */
function itemLabel(delivery: DeliverySummary): string {
  return `${formatTime(delivery.scheduledAt)} ${delivery.supplierName}`;
}

/**
 * Month calendar (Monday first, AR days). A table on wide screens; below `md` it falls back to an agenda
 * list of the days that have something. Server-rendered: navigation and filters are plain links.
 */
export function DeliveryCalendar({ month, deliveries, now, params }: DeliveryCalendarProps) {
  const weeks = buildMonthGrid(month);
  const byDay = groupByDay(deliveries);
  const today = todayInTz(now);
  const monthDays = weeks.flat().filter((day) => day.startsWith(monthKey(month)));
  const agendaDays = monthDays.filter((day) => byDay.has(day));
  const nav = (target: MonthRef) => buildHref("/entregas", { view: "calendar", ...params, month: monthKey(target) });
  const listForDay = (day: CalendarDate) => buildHref("/entregas", { view: "list", ...params, from: day, to: day });

  return (
    <section aria-labelledby="calendar-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="calendar-title" className="text-lg font-medium">
          {monthLabel(month)}
        </h2>
        <nav aria-label="Cambiar de mes" className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={nav(shiftMonth(month, -1))} rel="prev">
              Mes anterior
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref("/entregas", { view: "calendar", ...params })}>Hoy</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={nav(shiftMonth(month, 1))} rel="next">
              Mes siguiente
            </Link>
          </Button>
        </nav>
      </div>

      <table className="hidden w-full table-fixed border-collapse md:table" data-testid="delivery-calendar">
        <caption className="sr-only">Entregas y visitas programadas en {monthLabel(month)}</caption>
        <thead>
          <tr>
            {WEEKDAY_NAMES.map((name, index) => (
              <th key={name} scope="col" className="text-muted-foreground border px-2 py-1 text-left text-xs font-medium">
                <abbr title={name} className="no-underline">
                  {WEEKDAY_SHORT_NAMES[index]}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const items = byDay.get(day) ?? [];
                const inMonth = day.startsWith(monthKey(month));
                return (
                  <td key={day} className={cn("h-28 border p-1 align-top", !inMonth && "bg-muted/40 text-muted-foreground")}>
                    <time dateTime={day} className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs", day === today && "bg-primary text-primary-foreground")}>
                      {Number(day.slice(8))}
                    </time>
                    <ul className="mt-1 grid gap-1">
                      {items.slice(0, MAX_PER_DAY).map((delivery) => (
                        <li key={delivery.id}>
                          <Link
                            href={`/entregas/${delivery.id}`}
                            title={`${DELIVERY_TYPE_LABELS[delivery.type]} · ${deliveryStatusLabel(delivery.status)}`}
                            className={cn("block truncate rounded px-1 py-0.5 text-xs hover:underline", DELIVERY_STATUS_CLASSES[delivery.status])}
                          >
                            <span className="sr-only">
                              {DELIVERY_TYPE_LABELS[delivery.type]}, {deliveryStatusLabel(delivery.status)}:{" "}
                            </span>
                            {itemLabel(delivery)}
                          </Link>
                        </li>
                      ))}
                      {items.length > MAX_PER_DAY ? (
                        <li>
                          <Link href={listForDay(day)} className="text-muted-foreground text-xs underline underline-offset-2">
                            +{items.length - MAX_PER_DAY} más
                          </Link>
                        </li>
                      ) : null}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-3 md:hidden" data-testid="delivery-agenda">
        {agendaDays.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay entregas ni visitas programadas este mes.</p>
        ) : (
          agendaDays.map((day) => (
            <section key={day} aria-label={formatDate(day)} className="rounded-md border p-3">
              <h3 className={cn("text-sm font-medium", day === today && "text-primary")}>
                {formatLongDay(day)}
                {day === today ? " (hoy)" : ""}
              </h3>
              <ul className="mt-2 grid gap-2">
                {(byDay.get(day) ?? []).map((delivery) => (
                  <li key={delivery.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link href={`/entregas/${delivery.id}`} className="font-medium underline-offset-4 hover:underline">
                      {itemLabel(delivery)}
                    </Link>
                    <DeliveryTypeBadge type={delivery.type} />
                    <DeliveryStatusBadge status={delivery.status} />
                    <DeliveryAlertBadge alert={deliveryAlertState(delivery, now)} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </section>
  );
}
