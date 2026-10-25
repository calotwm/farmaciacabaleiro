"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeRoleAction } from "./user-actions";
import { roleLabel } from "./role-label";

export function UserRoleSelect({
  userId,
  userName,
  value,
  roles,
}: {
  userId: string;
  userName: string;
  value: string;
  roles: string[];
}) {
  const [pending, startTransition] = useTransition();

  function onChange(roleName: string) {
    startTransition(async () => {
      const result = await changeRoleAction(userId, roleName);
      if (result.error) toast.error(result.error);
      else toast.success(result.success ?? "Rol actualizado.");
    });
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-40" aria-label={`Rol de ${userName}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role} value={role}>
            {roleLabel(role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
