import type { Metadata } from "next";
import { SettingsSection } from "@/components/settings-section";
import { getAlertsModule } from "@/modules/alerts/composition";
import { PushSettings } from "@/modules/alerts/ui/push-settings";
import { requireUser } from "@/modules/auth/server";
import { getServerEnv, isWebPushConfigured } from "@/shared/config/env";

export const metadata: Metadata = { title: "Notificaciones - Farmacia Cabaleiro" };
export const dynamic = "force-dynamic";

export default async function PushSettingsPage() {
  const user = await requireUser();
  const env = getServerEnv();
  const configured = isWebPushConfigured(env);
  const devices = configured ? await getAlertsModule().pushSubscriptions.list(user.id) : [];
  return (
    <SettingsSection
      title="Notificaciones en el dispositivo"
      description="Recibí los avisos de la farmacia como notificaciones del navegador, aunque no tengas la aplicación abierta. Las alertas dentro de la aplicación siguen funcionando igual."
    >
      <PushSettings
        publicKey={configured ? (env.VAPID_PUBLIC_KEY ?? null) : null}
        devices={devices.map((d) => ({
          id: d.id,
          endpoint: d.endpoint,
          userAgent: d.userAgent,
          createdAt: d.createdAt.toISOString(),
          disabled: d.disabledAt !== null,
        }))}
      />
    </SettingsSection>
  );
}
