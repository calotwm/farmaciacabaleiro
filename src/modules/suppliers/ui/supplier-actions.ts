"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getClientIp, requirePermission } from "@/modules/auth/server";
import { type FormState, errorToFormState, parseForm, withValues } from "@/shared/application/form-state";
import { getSuppliersModule } from "../composition";
import { supplierIdSchema, supplierInputSchema, supplierProductSchema } from "./schemas";

const PARSE_OPTIONS = { arrayFields: ["visitDays"] } as const;

export async function createSupplierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(supplierInputSchema, formData, PARSE_OPTIONS);
  if ("state" in parsed) return parsed.state;

  let id: string;
  try {
    const actor = await requirePermission("suppliers.write");
    id = (await getSuppliersModule().supplierService.createSupplier(actor, parsed.data, await getClientIp())).id;
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath("/proveedores");
  redirect(`/proveedores/${id}`);
}

export async function updateSupplierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = supplierIdSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "No se encontró el proveedor." };
  const parsed = parseForm(supplierInputSchema, formData, PARSE_OPTIONS);
  if ("state" in parsed) return parsed.state;

  try {
    const actor = await requirePermission("suppliers.write");
    await getSuppliersModule().supplierService.updateSupplier(actor, id.data, parsed.data, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidatePath("/proveedores");
  redirect(`/proveedores/${id.data}`);
}

export async function setSupplierActiveAction(supplierId: string, active: boolean): Promise<FormState> {
  const id = supplierIdSchema.safeParse(supplierId);
  if (!id.success) return { error: "No se encontró el proveedor." };
  try {
    const actor = await requirePermission("suppliers.write");
    await getSuppliersModule().supplierService.setActive(actor, id.data, active, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath("/proveedores");
  revalidatePath(`/proveedores/${id.data}`);
  return { success: active ? "Proveedor activado." : "Proveedor desactivado." };
}

export async function addSupplierProductAction(supplierId: string, productId: string): Promise<FormState> {
  const ids = supplierProductSchema.safeParse({ supplierId, productId });
  if (!ids.success) return { error: "No se encontró el proveedor o el producto." };
  try {
    const actor = await requirePermission("suppliers.write");
    await getSuppliersModule().supplierService.addProduct(actor, ids.data.supplierId, ids.data.productId, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath(`/proveedores/${ids.data.supplierId}`);
  return { success: "Producto agregado al proveedor." };
}

export async function removeSupplierProductAction(supplierId: string, productId: string): Promise<FormState> {
  const ids = supplierProductSchema.safeParse({ supplierId, productId });
  if (!ids.success) return { error: "No se encontró el proveedor o el producto." };
  try {
    const actor = await requirePermission("suppliers.write");
    await getSuppliersModule().supplierService.removeProduct(actor, ids.data.supplierId, ids.data.productId, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath(`/proveedores/${ids.data.supplierId}`);
  return { success: "Producto quitado del proveedor." };
}
