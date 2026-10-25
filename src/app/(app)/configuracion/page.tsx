import { redirect } from "next/navigation";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { settingsSectionsFor } from "./sections";

/** /configuracion has no content of its own: it opens the first section the user can see. */
export default async function SettingsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const first = settingsSectionsFor((key) => hasPermission(user, key))[0];
  redirect(first?.href ?? "/configuracion/cuenta");
}
