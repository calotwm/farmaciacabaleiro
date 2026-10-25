"use server";

import { redirect } from "next/navigation";
import { getAuthModule } from "../composition";
import {
  clearSessionCookie,
  getClientIp,
  getCurrentUser,
  getSessionToken,
  getUserAgent,
  setSessionCookie,
} from "../server";
import { type FormState, errorToFormState, parseForm } from "@/shared/application/form-state";
import { loginSchema, requestResetSchema, resetPasswordSchema } from "./schemas";

/** Only same-site relative paths are valid post-login targets (no open redirects). */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(loginSchema, formData);
  if ("state" in parsed) return parsed.state;

  let target: string;
  try {
    const result = await getAuthModule().authService.login({
      email: parsed.data.email,
      password: parsed.data.password,
      ip: await getClientIp(),
      userAgent: await getUserAgent(),
    });
    await setSessionCookie(result.token);
    target = safeNext(parsed.data.next);
  } catch (error) {
    return errorToFormState(error);
  }
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    const user = await getCurrentUser();
    await getAuthModule().authService.logout(token, user ?? undefined, await getClientIp());
  }
  await clearSessionCookie();
  redirect("/login");
}

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(requestResetSchema, formData);
  if ("state" in parsed) return parsed.state;
  try {
    await getAuthModule().authService.requestPasswordReset(parsed.data.email, await getClientIp());
  } catch (error) {
    // Do not distinguish failures from success: same message either way.
    console.error(error);
  }
  return { success: "Si el email está registrado, te enviamos un enlace para restablecer la contraseña." };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(resetPasswordSchema, formData);
  if ("state" in parsed) return parsed.state;
  try {
    await getAuthModule().authService.resetPassword(parsed.data.token, parsed.data.password, await getClientIp());
  } catch (error) {
    return errorToFormState(error);
  }
  redirect("/login?reset=1");
}
