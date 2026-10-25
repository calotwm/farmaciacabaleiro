import { getAlertsModule } from "@/modules/alerts/composition";
import { createCronHandler } from "@/modules/alerts/infrastructure/cron-handler";

export const dynamic = "force-dynamic";

// Triggered by .github/workflows/daily-alerts.yml. Authenticated by CRON_SECRET, not by a user session.
export const POST = createCronHandler({
  getSecret: () => process.env.CRON_SECRET || undefined,
  run: () => getAlertsModule().dailyAlerts.runDailyAlerts(),
});
