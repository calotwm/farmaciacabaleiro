import type { Metadata } from "next";
import { getAuthModule } from "@/modules/auth/composition";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { CreateUserDialog } from "@/modules/auth/ui/create-user-dialog";
import { UsersTable } from "@/modules/auth/ui/users-table";

export const metadata: Metadata = { title: "Usuarios - Farmacia Cabaleiro" };

export default async function UsersPage() {
  const user = await getCurrentUser();
  // Server-side guard: the page and every action behind it require users.manage.
  if (!user || !hasPermission(user, "users.manage")) {
    return (
      <div className="grid max-w-3xl gap-2">
        <h1 className="text-2xl font-semibold">Acceso denegado</h1>
        <p role="alert" className="text-muted-foreground">
          No tenés permiso para administrar usuarios.
        </p>
      </div>
    );
  }

  const { userAdminService } = getAuthModule();
  const [users, roles] = await Promise.all([userAdminService.listUsers(user), userAdminService.listRoleNames(user)]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <CreateUserDialog roles={roles} />
      </div>
      <UsersTable users={users} roles={roles} currentUserId={user.id} />
    </div>
  );
}
