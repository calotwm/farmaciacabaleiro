import type { Metadata } from "next";
import { SettingsSection } from "@/components/settings-section";
import { requireUser } from "@/modules/auth/server";
import { ChangePasswordForm } from "@/modules/auth/ui/change-password-form";
import { roleLabel } from "@/modules/auth/ui/role-label";

export const metadata: Metadata = { title: "Mi cuenta - Farmacia Cabaleiro" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <SettingsSection title="Mi cuenta" description="Tus datos de acceso y la contraseña.">
      <dl className="bg-card grid max-w-xl gap-3 rounded-xl border p-5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Nombre</dt>
        <dd className="font-medium">{user.name}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd className="font-medium break-all">{user.email}</dd>
        <dt className="text-muted-foreground">Rol</dt>
        <dd className="font-medium">{roleLabel(user.roleName)}</dd>
      </dl>
      <div className="bg-card grid max-w-xl gap-4 rounded-xl border p-5">
        <h3 className="text-sm font-semibold">Cambiar contraseña</h3>
        <ChangePasswordForm />
      </div>
    </SettingsSection>
  );
}
