import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { SettingsSection } from "@/components/settings-section";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getSettingsModule } from "@/modules/settings/composition";
import { ExpirySettingsForm } from "@/modules/settings/ui/general-settings-form";
import { DEFAULT_CRITICAL_DAYS } from "@/shared/domain/expiry-status";

export const metadata: Metadata = { title: "Configuración de vencimientos - Farmacia Cabaleiro" };
export const dynamic = "force-dynamic";

export default async function ExpirySettingsPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "settings.manage")) return <AccessDenied message="No tenés permiso para cambiar la configuración." />;

  const settings = await getSettingsModule().generalSettings.get();
  const widest = Math.max(...settings.expiryThresholds);
  return (
    <SettingsSection
      title="Vencimientos"
      description="Con cuántos días de anticipación se avisa de un vencimiento y desde cuándo un lote se considera por vencer."
      actions={
        <Link href="/vencimientos" className="text-primary text-sm font-medium underline-offset-4 hover:underline">
          Ver vencimientos
        </Link>
      }
    >
      <ExpirySettingsForm settings={settings} />
      <div className="bg-card grid max-w-xl gap-2 rounded-xl border p-5 text-sm">
        <h3 className="font-semibold">Cómo se clasifica un lote hoy</h3>
        <ul className="text-muted-foreground grid gap-1.5">
          <li>
            <span className="text-foreground font-medium">Vencido:</span> ya pasó la fecha de vencimiento (el lote vale hasta el final de ese día).
          </li>
          <li>
            <span className="text-foreground font-medium">Crítico:</span> vence en {DEFAULT_CRITICAL_DAYS} días o menos.
          </li>
          <li>
            <span className="text-foreground font-medium">Advertencia:</span> vence en {widest} días o menos.
          </li>
          <li>
            <span className="text-foreground font-medium">Avisos:</span> se generan al cruzar cada plazo ({settings.expiryThresholds.join(", ")} días).
          </li>
        </ul>
      </div>
    </SettingsSection>
  );
}
