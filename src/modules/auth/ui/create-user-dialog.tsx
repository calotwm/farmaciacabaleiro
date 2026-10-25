"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initialFormState } from "@/shared/application/form-state";
import { roleLabel } from "./role-label";
import { createUserAction } from "./user-actions";

export function CreateUserDialog({ roles }: { roles: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createUserAction, initialFormState);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nuevo usuario</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>La persona podrá cambiar su contraseña desde &quot;Olvidé mi contraseña&quot;.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4" noValidate>
          <FormBanner error={state.error} />
          <FormField name="name" label="Nombre" autoComplete="off" required errors={state.fieldErrors?.name} />
          <FormField name="email" label="Email" type="email" autoComplete="off" required errors={state.fieldErrors?.email} />
          <div className="grid gap-2">
            <Label htmlFor="roleName">Rol</Label>
            <Select name="roleName" defaultValue={roles.includes("employee") ? "employee" : roles[0]}>
              <SelectTrigger id="roleName" className="w-full">
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
            {state.fieldErrors?.roleName ? (
              <p role="alert" className="text-destructive text-sm">
                {state.fieldErrors.roleName.join(" ")}
              </p>
            ) : null}
          </div>
          <FormField
            name="password"
            label="Contraseña inicial"
            type="password"
            autoComplete="new-password"
            required
            hint="Mínimo 10 caracteres."
            errors={state.fieldErrors?.password}
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Creando..." : "Crear usuario"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
