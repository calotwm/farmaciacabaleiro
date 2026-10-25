import type { z } from "zod";
import { type ConflictError, type ValidationError, hasErrorCode, isDomainError } from "@/shared/domain/errors";
import { toUserMessage } from "@/shared/application/user-message";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
  /** Submitted values echoed back so the form can keep what the user typed after an error. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = {};

export interface ParseFormOptions {
  /** Fields that can repeat (checkbox groups): their values are collected into an array of strings. */
  arrayFields?: readonly string[];
}

/** Validates FormData with Zod; returns the parsed data or a ready-to-render error state. */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
  options: ParseFormOptions = {},
): { data: z.infer<T> } | { state: FormState } {
  const raw: Record<string, FormDataEntryValue | FormDataEntryValue[]> = Object.fromEntries(formData);
  for (const field of options.arrayFields ?? []) raw[field] = formData.getAll(field);
  const result = schema.safeParse(raw);
  if (result.success) return { data: result.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { state: { error: "Revisá los datos ingresados.", fieldErrors, values: formValues(formData) } };
}

/** Maps a thrown error to form state at the edge. Unknown errors are logged, never shown. */
export function errorToFormState(error: unknown): FormState {
  if (hasErrorCode(error, "VALIDATION") || hasErrorCode(error, "CONFLICT")) {
    const { fieldErrors } = error as ValidationError | ConflictError;
    return { error: toUserMessage(error), fieldErrors: { ...fieldErrors } };
  }
  if (!isDomainError(error)) console.error(error);
  return { error: toUserMessage(error) };
}

const SENSITIVE_FIELD = /password|token/i;

/**
 * The text fields of a submission (files ignored). Password and token fields are never echoed back.
 * A repeated field (checkbox group) is echoed as its values joined by commas.
 */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || SENSITIVE_FIELD.test(key)) continue;
    values[key] = key in values ? `${values[key]},${value}` : value;
  }
  return values;
}

/** Adds the submitted values to an error state (see `FormState.values`). */
export function withValues(state: FormState, formData: FormData): FormState {
  return { ...state, values: formValues(formData) };
}
