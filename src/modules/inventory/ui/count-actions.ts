"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getClientIp, requireUser } from "@/modules/auth/server";
import { type FormState, errorToFormState, parseForm, withValues } from "@/shared/application/form-state";
import { isUuid } from "@/shared/domain/ids";
import { closeCountSchema, openCountSchema, parseCountEntries } from "../application/count-input";
import { getInventoryModule } from "../composition";

export async function openCountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(openCountSchema, formData);
  if ("state" in parsed) return parsed.state;

  let countId: string;
  try {
    const actor = await requireUser();
    const input = { categoryId: parsed.data.categoryId ?? undefined, location: parsed.data.location ?? undefined, notes: parsed.data.notes };
    countId = (await getInventoryModule().stockCounts.openCount(actor, input, await getClientIp())).id;
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath("/conteos");
  redirect(`/conteos/${countId}`);
}

export async function saveCountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const countId = String(formData.get("countId") ?? "");
  if (!isUuid(countId)) return { error: "No se encontró el conteo." };
  const { entries, fieldErrors } = parseCountEntries(formData);
  if (Object.keys(fieldErrors).length > 0) return { error: "Revisá las cantidades marcadas.", fieldErrors };

  try {
    const actor = await requireUser();
    const { saved } = await getInventoryModule().stockCounts.saveCounts(actor, countId, entries, await getClientIp());
    revalidatePath(`/conteos/${countId}`);
    return { success: saved === 0 ? "No había cambios para guardar." : `Conteo guardado (${saved} ${saved === 1 ? "lote actualizado" : "lotes actualizados"}).` };
  } catch (error) {
    return errorToFormState(error);
  }
}

export async function closeCountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(closeCountSchema, formData);
  if ("state" in parsed) return parsed.state;
  const { countId, reasonId, reasonText } = parsed.data;

  try {
    const actor = await requireUser();
    await getInventoryModule().stockCounts.closeCount(actor, countId, { reasonId, reasonText }, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath("/conteos");
  revalidatePath(`/conteos/${countId}`);
  revalidatePath("/movimientos");
  revalidatePath("/lotes");
  redirect(`/conteos/${countId}`);
}
