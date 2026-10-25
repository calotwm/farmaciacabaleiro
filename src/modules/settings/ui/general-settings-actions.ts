"use server";

import { revalidatePath } from "next/cache";
import { getClientIp, requirePermission } from "@/modules/auth/server";
import { type FormState, errorToFormState, parseForm, withValues } from "@/shared/application/form-state";
import { expirySettingsSchema, pharmacySettingsSchema } from "../application/general-settings-input";
import { getSettingsModule } from "../composition";
import type { GeneralSettings } from "../domain/general-settings";

/** Saves one section: the stored values of the other sections are kept as they are. */
async function saveSection(formData: FormData, section: Partial<GeneralSettings>): Promise<FormState> {
  try {
    const actor = await requirePermission("settings.manage");
    const { generalSettings } = getSettingsModule();
    const current = await generalSettings.get();
    await generalSettings.update(actor, { ...current, ...section }, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath("/", "layout");
  return { success: "Configuración guardada." };
}

export async function updateGeneralSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(pharmacySettingsSchema, formData);
  if ("state" in parsed) return parsed.state;
  return saveSection(formData, parsed.data);
}

export async function updateExpirySettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(expirySettingsSchema, formData);
  if ("state" in parsed) return parsed.state;
  return saveSection(formData, parsed.data);
}
