import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { DELIVERY_SORT_FIELDS } from "@/modules/deliveries/application/ports";
import { getDeliveriesModule } from "@/modules/deliveries/composition";
import { gridRange, monthKey, monthOf, parseMonth } from "@/modules/deliveries/domain/calendar";
import { DELIVERY_STATUSES, DELIVERY_TYPES } from "@/modules/deliveries/domain/delivery-status";
import { DeliveriesTable } from "@/modules/deliveries/ui/deliveries-table";
import { DeliveryCalendar } from "@/modules/deliveries/ui/delivery-calendar";
import { DeliveryFilters, type DeliveryView } from "@/modules/deliveries/ui/delivery-filters";
import {
  DEFAULT_PAGE_SIZE,
  buildHref,
  dateParam,
  firstParam,
  parseOption,
  parsePage,
  parseSortDirection,
  type SearchParams,
  uuidParam,
} from "@/shared/application/list-query";
import { todayInTz } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";

export const metadata: Metadata = { title: "Entregas - Farmacia Cabaleiro" };

const TYPE_FILTERS = ["", ...DELIVERY_TYPES] as const;
const STATUS_FILTERS = ["", ...DELIVERY_STATUSES] as const;

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "deliveries.read")) return <AccessDenied message="No tenés permiso para ver las entregas." />;

  const sp = await searchParams;
  const { deliveryService } = getDeliveriesModule();
  const view: DeliveryView = firstParam(sp.view) === "calendar" ? "calendar" : "list";
  const now = new Date();
  const filters = {
    supplierId: uuidParam(sp.supplierId),
    type: parseOption(sp.type, TYPE_FILTERS, "") || undefined,
    status: parseOption(sp.status, STATUS_FILTERS, "") || undefined,
  };
  const filterParams = { supplierId: filters.supplierId, type: filters.type, status: filters.status };

  const { suppliers } = await deliveryService.listOptions(user);
  const supplierOptions = suppliers.map((supplier) => ({ value: supplier.id, label: supplier.active ? supplier.name : `${supplier.name} (inactivo)` }));

  const month = parseMonth(firstParam(sp.month)) ?? monthOf(todayInTz(now));
  const sort = parseOption(sp.sort, DELIVERY_SORT_FIELDS, "scheduledAt");
  const dir = parseSortDirection(sp.dir, "desc");
  const listQuery = {
    ...filters,
    from: dateParam(sp.from),
    to: dateParam(sp.to),
    lateOnly: firstParam(sp.late) === "1",
    openOnly: firstParam(sp.open) === "1",
    sort,
    dir,
    page: parsePage(sp.page),
    pageSize: DEFAULT_PAGE_SIZE,
  };
  const listParams = { ...filterParams, from: listQuery.from, to: listQuery.to, late: listQuery.lateOnly ? "1" : undefined, open: listQuery.openOnly ? "1" : undefined };

  const calendarItems = view === "calendar" ? await deliveryService.listCalendar(user, { ...filters, ...gridRange(month) }) : [];
  const listPage = view === "list" ? await deliveryService.listDeliveries(user, listQuery) : { items: [], total: 0 };

  const toggleLink = (target: DeliveryView) => buildHref("/entregas", { view: target, ...filterParams, ...(target === "list" ? { from: listQuery.from, to: listQuery.to } : { month: monthKey(month) }) });
  const toggleClass = (target: DeliveryView) => cn("rounded-md border px-3 py-1.5 text-sm", view === target ? "bg-primary text-primary-foreground" : "hover:bg-accent");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Entregas</h1>
          <p className="text-muted-foreground text-sm">Repartos y visitas de proveedores. Las horas se muestran en hora de Argentina.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/entregas/cumplimiento">Cumplimiento</Link>
          </Button>
          {hasPermission(user, "deliveries.write") ? (
            <Button asChild>
              <Link href="/entregas/nueva">Programar</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <nav aria-label="Vista" className="flex gap-2">
        <Link href={toggleLink("list")} className={toggleClass("list")} aria-current={view === "list" ? "page" : undefined}>
          Lista
        </Link>
        <Link href={toggleLink("calendar")} className={toggleClass("calendar")} aria-current={view === "calendar" ? "page" : undefined}>
          Calendario
        </Link>
      </nav>

      <DeliveryFilters
        view={view}
        suppliers={supplierOptions}
        values={{ ...filterParams, from: listQuery.from, to: listQuery.to, late: listQuery.lateOnly, month: monthKey(month), sort, dir }}
      />

      {view === "calendar" ? (
        <DeliveryCalendar month={month} deliveries={calendarItems} now={now} params={filterParams} />
      ) : (
        <>
          <DeliveriesTable deliveries={listPage.items} sort={sort} dir={dir} params={listParams} now={now} />
          <Pagination basePath="/entregas" params={{ view: "list", ...listParams, sort, dir }} page={listQuery.page} pageSize={listQuery.pageSize} total={listPage.total} />
        </>
      )}
    </div>
  );
}
