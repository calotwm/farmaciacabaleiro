import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { SettingsSection } from "@/components/settings-section";
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
    <SettingsSection title="General" description="Nombre de la farmacia, moneda y el stock mínimo con el que arrancan los productos nuevos.">
      <GeneralSettingsForm settings={settings} />
    </SettingsSection>
  );
}
