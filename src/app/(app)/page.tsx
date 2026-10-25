import type { Metadata } from "next";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getDashboardModule } from "@/modules/dashboard/composition";
import { EXPIRING_HORIZON_DAYS, buildExpiringLots } from "@/modules/dashboard/domain/expiring-lots";
import { buildDeliveryCards, buildStockCards } from "@/modules/dashboard/domain/kpi-cards";
import { ExpiringHero } from "@/modules/dashboard/ui/expiring-hero";
import { LatestMovements, UnreadAlerts } from "@/modules/dashboard/ui/dashboard-lists";
import { KpiGrid } from "@/modules/dashboard/ui/kpi-grid";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { readGeneralSettings } from "@/modules/settings/infrastructure/read-general-settings";
import { getAlertsModule } from "@/modules/alerts/composition";
import { todayInTz } from "@/shared/domain/dates";

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
  const [stock, deliveries, movements, alerts, expiring] = await Promise.all([
    canSeeStock ? reads.stockKpis(today, settings.expiryThresholds) : null,
    canSeeDeliveries ? reads.deliveryKpis(now, today) : null,
    canSeeStock ? reads.latestMovements(10) : [],
    reads.unreadNotifications(user.id, 5),
    canSeeStock ? reads.expiringLots(today, EXPIRING_HORIZON_DAYS, 8) : null,
  ]);

  return (
    <div className="grid gap-8">
      <h1 className="sr-only">Hola, {user.name}</h1>
      {expiring ? <ExpiringHero items={buildExpiringLots(expiring.rows, today)} total={expiring.total} today={today} /> : null}
      {stock ? <KpiGrid title="Inventario" cards={buildStockCards(stock, today)} /> : null}
      {deliveries ? <KpiGrid title="Entregas" cards={buildDeliveryCards(deliveries, today)} /> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {canSeeStock ? <LatestMovements movements={movements} /> : null}
        <UnreadAlerts alerts={alerts.items} total={alerts.total} />
      </div>
    </div>
  );
}
