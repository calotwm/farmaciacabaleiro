"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { loginAction } from "./auth-actions";
import { initialFormState } from "@/shared/application/form-state";

export function LoginForm({ next, justReset }: { next?: string; justReset?: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, initialFormState);
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormBanner
        error={state.error}
        success={justReset ? "Contraseña actualizada. Ya podés iniciar sesión." : undefined}
      />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormField
        name="identifier"
        label="Usuario o email"
        type="text"
        autoComplete="username"
        required
        errors={state.fieldErrors?.identifier}
      />
      <FormField
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
      <Link href="/recuperar" className="text-muted-foreground text-center text-sm underline underline-offset-4">
        Olvidé mi contraseña
      </Link>
    </form>
  );
}
