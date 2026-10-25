"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getClientIp, requireUser } from "@/modules/auth/server";
import { type FormState, errorToFormState, parseForm, withValues } from "@/shared/application/form-state";
import { movementInputSchema } from "../application/movement-input";
import { getInventoryModule } from "../composition";

/**
 * Registers one stock movement. Validation of the shape happens here; authorization (which
 * permission each type needs) and every stock rule are enforced again inside the use case.
 */
export async function registerMovementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(movementInputSchema, formData);
  if ("state" in parsed) return parsed.state;

  try {
    const actor = await requireUser();
    await getInventoryModule().stockOperations.registerMovement(actor, parsed.data, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  const { productId } = parsed.data;
  revalidatePath("/movimientos");
  revalidatePath("/lotes");
  revalidatePath(`/productos/${productId}`);
  redirect(`/movimientos?productId=${productId}`);
}
