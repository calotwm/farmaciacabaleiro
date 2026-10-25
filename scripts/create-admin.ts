// Bootstrap the first administrator.
//   ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" pnpm admin:create
// The password is read from stdin without echo, or from ADMIN_PASSWORD (CI only).
// Refuses to run when a user with that email already exists. Never prints secrets.
import "dotenv/config";
import { createUserAdminService } from "../src/modules/auth/application/user-admin-service";
import { Argon2PasswordHasher } from "../src/modules/auth/infrastructure/argon2-password-hasher";
import { PrismaSessionRepository, PrismaUserRepository } from "../src/modules/auth/infrastructure/prisma-repositories";
import { createRecordAudit } from "../src/modules/audit/application/record-audit";
import { PrismaAuditWriter } from "../src/modules/audit/infrastructure/prisma-audit-writer";
import { DomainError, ValidationError } from "../src/shared/domain/errors";
import { toUserMessage } from "../src/shared/application/user-message";
import { createPrismaClient } from "../src/shared/infrastructure/db/create-client";

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      // Piped input: read one line.
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => (data += chunk));
      stdin.on("end", () => resolve(data.split(/\r?\n/)[0] ?? ""));
      stdin.on("error", reject);
      return;
    }
    stdout.write(prompt);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (char: string) => {
      for (const c of char) {
        if (c === "\u0003") {
          stdin.setRawMode(false);
          stdout.write("\n");
          process.exit(130);
        } else if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        } else if (c === "\u007f" || c === "\b") {
          value = value.slice(0, -1);
        } else {
          value += c;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const name = process.env.ADMIN_NAME?.trim();
  if (!email || !name) {
    throw new Error("ADMIN_EMAIL and ADMIN_NAME are required.");
  }
  const password = process.env.ADMIN_PASSWORD ?? (await readHidden("Password (min 10 characters): "));

  const prisma = createPrismaClient();
  try {
    const service = createUserAdminService({
      users: new PrismaUserRepository(prisma),
      sessions: new PrismaSessionRepository(prisma),
      hasher: new Argon2PasswordHasher(),
      audit: createRecordAudit(new PrismaAuditWriter(prisma)),
    });
    const created = await service.createInitialAdmin({ name, email, password });
    console.log(`Admin created: ${created.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ValidationError) {
    console.error(Object.values(error.fieldErrors).flat().join("\n") || toUserMessage(error));
  } else if (error instanceof DomainError) {
    console.error(toUserMessage(error));
  } else {
    console.error(error instanceof Error ? error.message : "Unexpected error");
  }
  process.exitCode = 1;
});
