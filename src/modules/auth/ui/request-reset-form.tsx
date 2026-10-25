"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { requestPasswordResetAction } from "./auth-actions";
import { initialFormState } from "@/shared/application/form-state";

export function RequestResetForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialFormState);
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormBanner error={state.error} success={state.success} />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Enviar enlace"}
      </Button>
      <Link href="/login" className="text-muted-foreground text-center text-sm underline underline-offset-4">
        Volver a iniciar sesión
      </Link>
    </form>
  );
}
