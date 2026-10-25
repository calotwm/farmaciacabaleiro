"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/modules/auth/server";
import { isUuid } from "@/shared/domain/ids";
import { getAlertsModule } from "../composition";
import { getWebPushDispatcher } from "../dispatcher";

const subscriptionSchema = z.object({
  endpoint: z.url().max(2048).refine((value) => value.startsWith("https://"), "endpoint must be https"),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(512).nullish(),
});

export type PushActionResult = { ok: true } | { ok: false; message: string };

/** Registers (or refreshes) the CURRENT user's subscription for this device. */
export async function savePushSubscriptionAction(input: unknown): Promise<PushActionResult> {
  const user = await requireUser();
  if (!getWebPushDispatcher()) return { ok: false, message: "Notificaciones push no configuradas en el servidor" };
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "La suscripción del dispositivo no es válida." };
  await getAlertsModule().pushSubscriptions.upsert(user.id, parsed.data);
  revalidatePath("/configuracion/notificaciones");
  return { ok: true };
}

/** Removes the CURRENT user's subscription for an endpoint (an endpoint that is not theirs matches nothing). */
export async function removePushSubscriptionAction(endpoint: string): Promise<PushActionResult> {
  const user = await requireUser();
  if (typeof endpoint !== "string" || endpoint.length === 0) return { ok: false, message: "Dispositivo inválido." };
  await getAlertsModule().pushSubscriptions.removeByEndpoint(user.id, endpoint);
  revalidatePath("/configuracion/notificaciones");
  return { ok: true };
}

export async function removePushDeviceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) return;
  await getAlertsModule().pushSubscriptions.removeById(user.id, id);
  revalidatePath("/configuracion/notificaciones");
}

export async function sendTestPushAction(): Promise<PushActionResult> {
  const user = await requireUser();
  const dispatcher = getWebPushDispatcher();
  if (!dispatcher) return { ok: false, message: "Notificaciones push no configuradas en el servidor" };
  const { sent, failed } = await dispatcher.sendTest(user.id);
  revalidatePath("/configuracion/notificaciones");
  if (sent === 0 && failed === 0) return { ok: false, message: "No hay dispositivos activos. Activá las notificaciones en este dispositivo." };
  if (sent === 0) return { ok: false, message: "No se pudo enviar la notificación de prueba." };
  return { ok: true };
}
