import { z } from "zod";

// Empty strings (e.g. `SMTP_HOST=` in a .env file) count as "not set".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "is required").pipe(z.url("must be a valid URL")),
    DATABASE_SSL_REJECT_UNAUTHORIZED: optional(z.enum(["true", "false"])),
    APP_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url().default("http://localhost:3000")),
    SESSION_SECRET: optional(z.string().min(32, "must be at least 32 characters")),
    VAPID_PUBLIC_KEY: optional(z.string().min(1)),
    VAPID_PRIVATE_KEY: optional(z.string().min(1)),
    VAPID_SUBJECT: optional(z.string().min(1)),
    SMTP_HOST: optional(z.string().min(1)),
    SMTP_PORT: optional(z.coerce.number().int().min(1).max(65535)),
    SMTP_USER: optional(z.string().min(1)),
    SMTP_PASS: optional(z.string().min(1)),
    SMTP_FROM: optional(z.string().min(1)),
  })
  .superRefine((env, ctx) => {
    const requireTogether = (keys: Array<keyof typeof env>, feature: string) => {
      const present = keys.filter((key) => env[key] !== undefined);
      if (present.length > 0 && present.length < keys.length) {
        for (const key of keys.filter((k) => env[k] === undefined)) {
          ctx.addIssue({ code: "custom", path: [key], message: `is required when configuring ${feature}` });
        }
      }
    };
    requireTogether(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"], "Web Push (VAPID)");
    requireTogether(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"], "SMTP");
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/** Pure parser (testable). Throws EnvValidationError listing every problem. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** Validated process.env, parsed once. Fails fast with a clear message. Server-side only. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** Derived feature flags so callers never re-check raw variables. */
export function isSmtpConfigured(env: ServerEnv): boolean {
  return env.SMTP_HOST !== undefined;
}
