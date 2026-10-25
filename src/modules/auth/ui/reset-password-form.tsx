"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { resetPasswordAction } from "./auth-actions";
import { initialFormState } from "@/shared/application/form-state";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormBanner error={state.error} />
      <input type="hidden" name="token" value={token} />
      <FormField
        name="password"
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        required
        hint="Mínimo 10 caracteres."
        errors={state.fieldErrors?.password}
      />
      <FormField
        name="confirmPassword"
        label="Repetir contraseña"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar contraseña"}
      </Button>
      <Link href="/recuperar" className="text-muted-foreground text-center text-sm underline underline-offset-4">
        Pedir un enlace nuevo
      </Link>
    </form>
  );
}
