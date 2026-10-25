"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/server";
import { isUuid } from "@/shared/domain/ids";
import { getAlertsModule } from "../composition";

/** Marks one of the CURRENT user's notifications as read (an id that is not theirs matches nothing). */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) return;
  await getAlertsModule().notifications.markRead(user.id, id);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await getAlertsModule().notifications.markAllRead(user.id);
  revalidatePath("/", "layout");
}
