import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getSettingsModule } from "@/modules/settings/composition";
import { GeneralSettingsForm } from "@/modules/settings/ui/general-settings-form";

export const metadata: Metadata = { title: "Configuración general - Farmacia Cabaleiro" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "settings.manage")) return <AccessDenied message="No tenés permiso para cambiar la configuración." />;

  const settings = await getSettingsModule().generalSettings.get();
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Configuración general</h1>
      <GeneralSettingsForm settings={settings} />
    </div>
  );
}
