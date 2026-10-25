import type { ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/shared/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps extends Omit<ComponentProps<"select">, "id" | "name"> {
  name: string;
  label: string;
  options: readonly SelectOption[];
  /** Label of the empty option (value ""). Omit it when a value is always required. */
  placeholder?: string;
  errors?: string[];
  hint?: string;
}

const SELECT_CLASS =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

/** Labelled native select (works without JS, in GET filter forms and in server-action forms). */
export function SelectField({ name, label, options, placeholder, errors, hint, className, ...selectProps }: SelectFieldProps) {
  const hasError = !!errors?.length;
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        className={cn(SELECT_CLASS, className)}
        {...selectProps}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
