import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { SettingsSection } from "@/components/settings-section";
import { getAuthModule } from "@/modules/auth/composition";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { CreateUserDialog } from "@/modules/auth/ui/create-user-dialog";
import { UsersTable } from "@/modules/auth/ui/users-table";

export const metadata: Metadata = { title: "Usuarios - Farmacia Cabaleiro" };

export default async function UsersPage() {
  const user = await getCurrentUser();
  // Server-side guard: the page and every action behind it require users.manage.
  if (!user || !hasPermission(user, "users.manage")) return <AccessDenied message="No tenés permiso para administrar usuarios." />;

  const { userAdminService } = getAuthModule();
  const [users, roles] = await Promise.all([userAdminService.listUsers(user), userAdminService.listRoleNames(user)]);

  return (
    <SettingsSection title="Usuarios y roles" description="Quién puede entrar al sistema y qué puede hacer." actions={<CreateUserDialog roles={roles} />}>
      <UsersTable users={users} roles={roles} currentUserId={user.id} />
    </SettingsSection>
  );
}
