"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientIp, requirePermission } from "@/modules/auth/server";
import { type FormState, errorToFormState, parseForm, withValues } from "@/shared/application/form-state";
import { receiptContentSchema, startReceiptSchema } from "../application/receipt-input";
import { getReceivingModule } from "../composition";

const NOT_FOUND: FormState = { error: "No se encontró la recepción." };

function revalidate(receiptId?: string) {
  revalidatePath("/recepciones");
  if (receiptId) revalidatePath(`/recepciones/${receiptId}`);
}

/** Starts (or resumes) a receipt from a delivery, or an unscheduled one for a supplier. */
export async function startReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(startReceiptSchema, formData);
  if ("state" in parsed) return parsed.state;

  let id: string;
  try {
    const actor = await requirePermission("receiving.write");
    id = (await getReceivingModule().receivingService.startDraft(actor, { deliveryId: parsed.data.deliveryId, supplierId: parsed.data.supplierId }, await getClientIp())).id;
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidate();
  redirect(`/recepciones/${id}`);
}

const editorIdsSchema = z.object({
  id: z.uuid(),
  idempotencyKey: z.string().min(8).max(100),
  intent: z.enum(["save", "confirm"]),
});

/**
 * Saves the draft (`intent=save`) or confirms the receipt (`intent=confirm`). Confirming sends the editor
 * content and the draft's idempotency key; a double submit finds the receipt confirmed and changes nothing.
 */
export async function saveReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ids = editorIdsSchema.safeParse(Object.fromEntries(formData));
  if (!ids.success) return NOT_FOUND;
  const parsed = parseForm(receiptContentSchema, formData);
  if ("state" in parsed) return parsed.state;

  const { receivingService } = getReceivingModule();
  try {
    const actor = await requirePermission("receiving.write");
    const ip = await getClientIp();
    if (ids.data.intent === "save") {
      await receivingService.saveDraft(actor, ids.data.id, parsed.data, ip);
    } else {
      await receivingService.confirmReceipt(actor, ids.data.id, ids.data.idempotencyKey, parsed.data, ip);
    }
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidate(ids.data.id);
  revalidatePath("/lotes");
  revalidatePath("/movimientos");
  revalidatePath("/entregas");
  if (ids.data.intent === "confirm") redirect(`/recepciones/${ids.data.id}`);
  return { success: "Borrador guardado." };
}

export async function discardReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return NOT_FOUND;
  try {
    const actor = await requirePermission("receiving.write");
    await getReceivingModule().receivingService.discardDraft(actor, id.data, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidate();
  redirect("/recepciones");
}
