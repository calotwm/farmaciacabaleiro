import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/shared/domain/dates";
import type { UserSummary } from "../application/ports";
import { ToggleActiveButton } from "./toggle-active-button";
import { UserRoleSelect } from "./user-role-select";

/** Presentational: receives data and the signed-in user id, renders the admin table. */
export function UsersTable({ users, roles, currentUserId }: { users: UserSummary[]; roles: string[]; currentUserId: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Último ingreso</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              <UserRoleSelect userId={user.id} userName={user.name} value={user.roleName} roles={roles} />
            </TableCell>
            <TableCell>
              <Badge variant={user.active ? "secondary" : "outline"}>{user.active ? "Activo" : "Inactivo"}</Badge>
            </TableCell>
            <TableCell>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Nunca"}</TableCell>
            <TableCell className="text-right">
              <ToggleActiveButton
                userId={user.id}
                userName={user.name}
                active={user.active}
                isSelf={user.id === currentUserId}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
