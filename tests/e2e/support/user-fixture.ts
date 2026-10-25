// Run through tsx (not Playwright's CommonJS loader): the generated Prisma client is ESM-only.
//   tsx user-fixture.ts create   -> prints {"email","password","id"} as JSON
//   tsx user-fixture.ts delete <id> <email>
import "dotenv/config";
import { buildAuthModule } from "../../../src/modules/auth/composition";
import { prisma } from "../../../src/shared/infrastructure/db/prisma";

const PASSWORD = "e2e-password-12345";

async function create() {
  const email = `test-e2e-${crypto.randomUUID()}@example.test`;
  const { userAdminService } = buildAuthModule();
  const created = await userAdminService.createInitialAdmin({ name: "E2E Admin", email, password: PASSWORD });
  console.log(JSON.stringify({ id: created.id, email, password: PASSWORD }));
}

async function remove(id: string, email: string) {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: id }, { entityId: id }, { after: { path: ["email"], equals: email } }] },
  });
  // Rows the specs create through the UI are named "E2E ...". Products that ever had a stock
  // movement cannot be deleted (append-only history), so those are left in place.
  await prisma.product.deleteMany({ where: { commercialName: { startsWith: "E2E " }, stockMovements: { none: {} } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: "E2E " }, products: { none: {} } } });
  await prisma.stockCount.deleteMany({ where: { createdById: id } }); // lines cascade
  try {
    await prisma.user.deleteMany({ where: { email } }); // sessions cascade
  } catch {
    // The user authored stock movements (kept forever): retire the account instead of deleting it.
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.user.updateMany({ where: { email }, data: { active: false } });
  }
}

async function main() {
  const [command, id, email] = process.argv.slice(2);
  if (command === "create") await create();
  else if (command === "delete" && id && email) await remove(id, email);
  else throw new Error("usage: user-fixture <create | delete <id> <email>>");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
