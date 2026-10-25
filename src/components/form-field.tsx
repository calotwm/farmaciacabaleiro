import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormFieldProps extends Omit<ComponentProps<typeof Input>, "id" | "name"> {
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
}

/** Labelled input with accessible error/hint wiring (aria-invalid + aria-describedby). */
export function FormField({ name, label, errors, hint, ...inputProps }: FormFieldProps) {
  const hasError = !!errors?.length;
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={hasError || undefined} aria-describedby={describedBy} {...inputProps} />
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
