import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getAlertsModule } from "@/modules/alerts/composition";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getDashboardModule } from "@/modules/dashboard/composition";
import { EXPIRING_HORIZON_DAYS, buildExpiringLots } from "@/modules/dashboard/domain/expiring-lots";
import { buildDeliveryCards, buildStockCards } from "@/modules/dashboard/domain/kpi-cards";
import { LatestMovements, UnreadAlerts } from "@/modules/dashboard/ui/dashboard-lists";
import { ExpiredLotsPanel, UpcomingExpirationsPanel } from "@/modules/dashboard/ui/expiring-lots-panel";
import { KpiStrip } from "@/modules/dashboard/ui/kpi-strip";
import { LowStockPanel } from "@/modules/dashboard/ui/low-stock-panel";
import { UpcomingDeliveriesPanel } from "@/modules/dashboard/ui/upcoming-deliveries-panel";
import { readGeneralSettings } from "@/modules/settings/infrastructure/read-general-settings";
import { todayInTz } from "@/shared/domain/dates";
import { prisma } from "@/shared/infrastructure/db/prisma";

export const metadata: Metadata = { title: "Inicio - Farmacia Cabaleiro" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Fallback for the daily GitHub Actions trigger: runs at most once per AR day; never blocks the page.
  await getAlertsModule()
    .dailyAlerts.runDailyAlertsIfDue()
    .catch((error: unknown) => console.error("Daily alerts fallback failed", error));

  const { reads } = getDashboardModule();
  const now = new Date();
  const today = todayInTz(now);
  const canSeeStock = hasPermission(user, "inventory.read");
  const canSeeDeliveries = hasPermission(user, "deliveries.read");

  const settings = await readGeneralSettings(prisma);
  const [stock, deliveries, upcomingDeliveries, movements, alerts, upcoming, expired, lowStock] = await Promise.all([
    canSeeStock ? reads.stockKpis(today, settings.expiryThresholds) : null,
    canSeeDeliveries ? reads.deliveryKpis(now, today) : null,
    canSeeDeliveries ? reads.upcomingDeliveries(6) : [],
    canSeeStock ? reads.latestMovements(8) : [],
    reads.unreadNotifications(user.id, 5),
    canSeeStock ? reads.upcomingLots(today, EXPIRING_HORIZON_DAYS, 8) : null,
    canSeeStock ? reads.expiredLots(today, 5) : null,
    canSeeStock ? reads.lowStockProducts(today, 6) : [],
  ]);

  const actions = [
    hasPermission(user, "receiving.write") ? { href: "/recepciones/nueva", label: "Registrar recepción", primary: true } : null,
    hasPermission(user, "inventory.write") ? { href: "/movimientos/nuevo?type=ADJUSTMENT_IN", label: "Ajustar stock", primary: false } : null,
    canSeeStock ? { href: "/vencimientos", label: "Consultar vencimientos", primary: false } : null,
  ].filter((action) => action !== null);

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Panel"
        description={`Resumen operativo de ${settings.pharmacyName}.`}
        actions={actions.map((action) => (
          <Button key={action.href} asChild variant={action.primary ? "default" : "outline"}>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ))}
      />
      {stock ? <KpiStrip label="Inventario" cards={buildStockCards(stock, today)} /> : null}
      {upcoming && expired ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <UpcomingExpirationsPanel items={buildExpiringLots(upcoming.rows, today)} total={upcoming.total} horizonDays={EXPIRING_HORIZON_DAYS} />
          <ExpiredLotsPanel items={buildExpiringLots(expired.rows, today)} total={expired.total} />
        </div>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {stock ? <LowStockPanel rows={lowStock} total={stock.lowStock + stock.outOfStock} /> : null}
        {deliveries ? <UpcomingDeliveriesPanel deliveries={upcomingDeliveries} counters={buildDeliveryCards(deliveries, today)} now={now} /> : null}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {canSeeStock ? <LatestMovements movements={movements} /> : null}
        <UnreadAlerts alerts={alerts.items} total={alerts.total} />
      </div>
    </div>
  );
}
