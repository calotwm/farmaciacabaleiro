"use server";

import { revalidatePath } from "next/cache";
import { getClientIp, requirePermission } from "@/modules/auth/server";
import { type FormState, errorToFormState, parseForm, withValues } from "@/shared/application/form-state";
import type { TaxonomyKind } from "../application/taxonomy-service";
import { getCatalogModule } from "../composition";
import { createTaxonomySchema, deleteTaxonomySchema, renameTaxonomySchema, setTaxonomyActiveSchema } from "./schemas";

const PATHS: Record<TaxonomyKind, string> = { category: "/configuracion/categorias", unit: "/configuracion/unidades" };
const SINGULAR: Record<TaxonomyKind, string> = { category: "Categoría", unit: "Unidad" };

export async function createTaxonomyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(createTaxonomySchema, formData);
  if ("state" in parsed) return parsed.state;
  const { kind, name } = parsed.data;
  try {
    const actor = await requirePermission("catalog.manage");
    await getCatalogModule().taxonomyService.create(actor, kind, name, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath(PATHS[kind]);
  return { success: `${SINGULAR[kind]} creada.` };
}

export async function renameTaxonomyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(renameTaxonomySchema, formData);
  if ("state" in parsed) return parsed.state;
  const { kind, id, name } = parsed.data;
  try {
    const actor = await requirePermission("catalog.manage");
    await getCatalogModule().taxonomyService.rename(actor, kind, id, name, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath(PATHS[kind]);
  return { success: "Nombre actualizado." };
}

export async function setTaxonomyActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(setTaxonomyActiveSchema, formData);
  if ("state" in parsed) return parsed.state;
  const { kind, id, active } = parsed.data;
  try {
    const actor = await requirePermission("catalog.manage");
    await getCatalogModule().taxonomyService.setActive(actor, kind, id, active === "true", await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath(PATHS[kind]);
  return { success: active === "true" ? "Activada." : "Desactivada." };
}

export async function deleteTaxonomyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(deleteTaxonomySchema, formData);
  if ("state" in parsed) return parsed.state;
  const { kind, id } = parsed.data;
  try {
    const actor = await requirePermission("catalog.manage");
    await getCatalogModule().taxonomyService.remove(actor, kind, id, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath(PATHS[kind]);
  return { success: "Eliminada." };
}
