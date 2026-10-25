import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { NotificationBell } from "@/modules/alerts/ui/notification-bell";
import { getCurrentUser } from "@/modules/auth/server";
import { roleLabel } from "@/modules/auth/ui/role-label";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell userName={user.name} roleLabel={roleLabel(user.roleName)} bell={<NotificationBell userId={user.id} />}>
      {children}
    </AppShell>
  );
}
