"use server";

import { revalidatePath } from "next/cache";
import { getAuthModule } from "../composition";
import { getClientIp, requirePermission } from "../server";
import { type FormState, errorToFormState, parseForm } from "./form-state";
import { changeRoleSchema, createUserSchema, setActiveSchema } from "./schemas";

const USERS_PATH = "/configuracion/usuarios";

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(createUserSchema, formData);
  if ("state" in parsed) return parsed.state;
  try {
    const actor = await requirePermission("users.manage");
    await getAuthModule().userAdminService.createUser(actor, parsed.data, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath(USERS_PATH);
  return { success: "Usuario creado." };
}

export async function changeRoleAction(userId: string, roleName: string): Promise<FormState> {
  const parsed = parseForm(changeRoleSchema, toFormData({ userId, roleName }));
  if ("state" in parsed) return parsed.state;
  try {
    const actor = await requirePermission("users.manage");
    await getAuthModule().userAdminService.changeRole(actor, parsed.data.userId, parsed.data.roleName, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath(USERS_PATH);
  return { success: "Rol actualizado." };
}

export async function setActiveAction(userId: string, active: boolean): Promise<FormState> {
  const parsed = parseForm(setActiveSchema, toFormData({ userId, active: String(active) }));
  if ("state" in parsed) return parsed.state;
  try {
    const actor = await requirePermission("users.manage");
    await getAuthModule().userAdminService.setActive(actor, parsed.data.userId, parsed.data.active === "true", await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath(USERS_PATH);
  return { success: active ? "Usuario activado." : "Usuario desactivado." };
}

function toFormData(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
