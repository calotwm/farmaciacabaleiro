"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/shared/application/form-state";
import { changePasswordAction } from "./auth-actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid max-w-md gap-4" noValidate>
      <FormBanner error={state.error} success={state.success} />
      <FormField
        name="currentPassword"
        label="Contraseña actual"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.currentPassword}
      />
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
        label="Repetir la nueva contraseña"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Cambiar contraseña"}
        </Button>
      </div>
    </form>
  );
}
