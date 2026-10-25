"use server";

import { revalidatePath } from "next/cache";
import { getClientIp, requirePermission } from "@/modules/auth/server";
import { type FormState, errorToFormState, parseForm, withValues } from "@/shared/application/form-state";
import { generalSettingsSchema } from "../application/general-settings-input";
import { getSettingsModule } from "../composition";

export async function updateGeneralSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(generalSettingsSchema, formData);
  if ("state" in parsed) return parsed.state;
  try {
    const actor = await requirePermission("settings.manage");
    await getSettingsModule().generalSettings.update(actor, parsed.data, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath("/", "layout");
  return { success: "Configuración guardada." };
}
