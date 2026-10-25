"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getClientIp, requirePermission } from "@/modules/auth/server";
import { type FormState, errorToFormState, parseForm, withValues } from "@/shared/application/form-state";
import { getDeliveriesModule } from "../composition";
import { cancelDeliverySchema, createDeliverySchema, deliveryIdSchema, editDeliverySchema, rescheduleDeliverySchema } from "./schemas";

const NOT_FOUND: FormState = { error: "No se encontró la entrega." };

function revalidate(id?: string) {
  revalidatePath("/entregas");
  if (id) revalidatePath(`/entregas/${id}`);
}

export async function createDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(createDeliverySchema, formData);
  if ("state" in parsed) return parsed.state;

  let id: string;
  try {
    const actor = await requirePermission("deliveries.write");
    id = (await getDeliveriesModule().deliveryService.createDelivery(actor, parsed.data, await getClientIp())).id;
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidate();
  redirect(`/entregas/${id}`);
}

export async function updateDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = deliveryIdSchema.safeParse(formData.get("id"));
  if (!id.success) return NOT_FOUND;
  const parsed = parseForm(editDeliverySchema, formData);
  if ("state" in parsed) return parsed.state;

  try {
    const actor = await requirePermission("deliveries.write");
    await getDeliveriesModule().deliveryService.updateDelivery(actor, id.data, parsed.data, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidate(id.data);
  redirect(`/entregas/${id.data}`);
}

export async function confirmDeliveryAction(deliveryId: string): Promise<FormState> {
  const id = deliveryIdSchema.safeParse(deliveryId);
  if (!id.success) return NOT_FOUND;
  try {
    const actor = await requirePermission("deliveries.write");
    await getDeliveriesModule().deliveryService.confirmDelivery(actor, id.data, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidate(id.data);
  return { success: "Entrega confirmada." };
}

/** Marks a visit (not a delivery) as done. */
export async function completeDeliveryAction(deliveryId: string): Promise<FormState> {
  const id = deliveryIdSchema.safeParse(deliveryId);
  if (!id.success) return NOT_FOUND;
  try {
    const actor = await requirePermission("deliveries.write");
    await getDeliveriesModule().deliveryService.completeDelivery(actor, id.data, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  revalidate(id.data);
  return { success: "Visita marcada como realizada." };
}

export async function cancelDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = deliveryIdSchema.safeParse(formData.get("id"));
  if (!id.success) return NOT_FOUND;
  const parsed = parseForm(cancelDeliverySchema, formData);
  if ("state" in parsed) return parsed.state;
  try {
    const actor = await requirePermission("deliveries.write");
    await getDeliveriesModule().deliveryService.cancelDelivery(actor, id.data, parsed.data.reason, await getClientIp());
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidate(id.data);
  return { success: "Entrega cancelada." };
}

export async function rescheduleDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = deliveryIdSchema.safeParse(formData.get("id"));
  if (!id.success) return NOT_FOUND;
  const parsed = parseForm(rescheduleDeliverySchema, formData);
  if ("state" in parsed) return parsed.state;

  let newId: string;
  try {
    const actor = await requirePermission("deliveries.write");
    newId = (await getDeliveriesModule().deliveryService.rescheduleDelivery(actor, id.data, parsed.data, await getClientIp())).id;
  } catch (error) {
    return withValues(errorToFormState(error), formData);
  }
  revalidate(id.data);
  redirect(`/entregas/${newId}`);
}
