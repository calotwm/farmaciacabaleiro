import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { SettingsNav } from "@/modules/settings/ui/settings-nav";
import { settingsSectionsFor } from "./sections";

/** Shared frame of every Configuración page: one title and a section switcher filtered by the user's permissions. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const items = user ? settingsSectionsFor((key) => hasPermission(user, key)) : [];
  return (
    <div className="grid gap-5">
      <PageHeader title="Configuración" description="Datos de la farmacia, vencimientos, avisos, catálogo, usuarios y tu cuenta." />
      <div className="grid items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <SettingsNav items={items} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
