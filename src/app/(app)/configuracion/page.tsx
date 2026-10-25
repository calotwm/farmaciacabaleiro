import Link from "next/link";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const links = [
    { href: "/configuracion/usuarios", label: "Usuarios y roles", allowed: !!user && hasPermission(user, "users.manage") },
    { href: "/configuracion/categorias", label: "Categorías", allowed: !!user && hasPermission(user, "catalog.manage") },
    { href: "/configuracion/unidades", label: "Unidades", allowed: !!user && hasPermission(user, "catalog.manage") },
  ].filter((link) => link.allowed);

  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      {links.length > 0 ? (
        <ul className="grid gap-2">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="underline underline-offset-4">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No hay opciones de configuración disponibles para tu rol.</p>
      )}
    </div>
  );
}
