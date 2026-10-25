"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getClientIp, requirePermission } from "@/modules/auth/server";
import { type FormState, errorToFormState, parseForm, withValues } from "@/shared/application/form-state";
import { getCatalogModule } from "../composition";
import { productIdSchema, productInputSchema } from "./schemas";

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(productInputSchema, formData);
  if ("state" in parsed) return parsed.state;

  let id: string;
  try {
    const actor = await requirePermission("products.write");
    id = (await getCatalogModule().catalogService.createProduct(actor, parsed.data, await getClientIp())).id;
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath("/productos");
  redirect(`/productos/${id}`);
}

export async function updateProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = productIdSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "No se encontró el producto." };
  const parsed = parseForm(productInputSchema, formData);
  if ("state" in parsed) return parsed.state;

  try {
    const actor = await requirePermission("products.write");
    await getCatalogModule().catalogService.updateProduct(actor, id.data, parsed.data, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath("/productos");
  redirect(`/productos/${id.data}`);
}

export async function setProductArchivedAction(productId: string, archived: boolean): Promise<FormState> {
  const id = productIdSchema.safeParse(productId);
  if (!id.success) return { error: "No se encontró el producto." };
  try {
    const actor = await requirePermission("products.archive");
    await getCatalogModule().catalogService.setArchived(actor, id.data, archived, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath("/productos");
  revalidatePath(`/productos/${id.data}`);
  return { success: archived ? "Producto archivado." : "Producto desarchivado." };
}
