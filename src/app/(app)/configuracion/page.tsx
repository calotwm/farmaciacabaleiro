import Link from "next/link";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const canManageUsers = !!user && hasPermission(user, "users.manage");
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      {canManageUsers ? (
        <Link href="/configuracion/usuarios" className="underline underline-offset-4">
          Usuarios y roles
        </Link>
      ) : (
        <p className="text-muted-foreground">No hay opciones de configuración disponibles para tu rol.</p>
      )}
    </div>
  );
}
