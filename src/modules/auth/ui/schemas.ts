import { z } from "zod";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../domain/password-policy";

const email = z
  .string({ error: "Ingresá tu email." })
  .trim()
  .min(1, "Ingresá tu email.")
  .max(254, "El email es demasiado largo.")
  .pipe(z.email("Ingresá un email válido."));

// The service re-validates the password policy; this gives field-level messages early.
const newPassword = z
  .string({ error: "Ingresá una contraseña." })
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .max(MAX_PASSWORD_LENGTH, `La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`);

const identifier = z
  .string({ error: "Ingresá tu usuario o email." })
  .trim()
  .min(1, "Ingresá tu usuario o email.")
  .max(254, "El usuario o email es demasiado largo.");

export const loginSchema = z.object({
  identifier,
  password: z.string({ error: "Ingresá tu contraseña." }).min(1, "Ingresá tu contraseña."),
  next: z.string().optional(),
});

export const requestResetSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "El enlace no es válido."),
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  });

export const createUserSchema = z.object({
  name: z.string({ error: "Ingresá el nombre." }).trim().min(1, "Ingresá el nombre.").max(120, "El nombre es demasiado largo."),
  email,
  roleName: z.string({ error: "Elegí un rol." }).min(1, "Elegí un rol."),
  password: newPassword,
});

export const changeRoleSchema = z.object({ userId: z.uuid(), roleName: z.string().min(1) });
export const setActiveSchema = z.object({ userId: z.uuid(), active: z.enum(["true", "false"]) });
