import type { z } from "zod";
import { DomainError, ValidationError } from "@/shared/domain/errors";
import { toUserMessage } from "@/shared/application/user-message";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

export const initialFormState: FormState = {};

/** Validates FormData with Zod; returns the parsed data or a ready-to-render error state. */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { data: z.infer<T> } | { state: FormState } {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (result.success) return { data: result.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { state: { error: "Revisá los datos ingresados.", fieldErrors } };
}

/** Maps a thrown error to form state at the edge. Unknown errors are logged, never shown. */
export function errorToFormState(error: unknown): FormState {
  if (error instanceof ValidationError) {
    return { error: toUserMessage(error), fieldErrors: { ...error.fieldErrors } };
  }
  if (!(error instanceof DomainError)) console.error(error);
  return { error: toUserMessage(error) };
}
