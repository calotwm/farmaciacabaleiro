import type { AuthUser } from "@/modules/auth/domain/permissions";
import { prisma } from "@/shared/infrastructure/db/prisma";

/**
 * Shared integration fixtures.
 *
 * Stock movements are append-only (Postgres trigger), so anything that ever had a movement
 * can never be deleted. Tests that need real commits therefore reuse two permanent, INACTIVE,
 * password-less users (they cannot log in and never receive notifications) and create products
 * with unique `TEST-<uuid>` codes. Everything that can be rolled back is rolled back instead.
 */

export class Rollback extends Error {}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Runs `work` inside a transaction that is always rolled back: nothing is left in the shared database. */
export async function inRolledBackTransaction(work: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await work(tx);
        throw new Rollback();
      },
      { timeout: 55_000, maxWait: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/** A permanent inactive test user holding the given role; returned as the actor services expect. */
export async function getTestActor(roleName: "admin" | "employee"): Promise<AuthUser> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { name: roleName },
    include: { permissions: { include: { permission: true } } },
  });
  const email = `it-actor-${roleName}@example.test`;
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: `IT ${roleName}`, passwordHash: "!", active: false, roleId: role.id },
  });
  return {
    id: user.id,
    email,
    name: user.name,
    roleName,
    permissions: role.permissions.map((rp) => rp.permission.key),
  };
}

/** An active user that holds the given role, created inside `tx` (so it is rolled back with it). */
export async function createActiveUser(tx: Tx, roleName: "admin" | "employee"): Promise<AuthUser> {
  const role = await tx.role.findUniqueOrThrow({
    where: { name: roleName },
    include: { permissions: { include: { permission: true } } },
  });
  const email = `it-${crypto.randomUUID()}@example.test`;
  const user = await tx.user.create({
    data: { email, name: `IT ${roleName}`, passwordHash: "!", active: true, roleId: role.id },
  });
  return { id: user.id, email, name: user.name, roleName, permissions: role.permissions.map((rp) => rp.permission.key) };
}

/** First seeded category and unit (read-only use). */
export async function seededCategoryAndUnit(db: Pick<Tx, "category" | "unit"> = prisma) {
  const [category, unit] = await Promise.all([
    db.category.findFirstOrThrow({ where: { active: true }, orderBy: { name: "asc" } }),
    db.unit.findFirstOrThrow({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return { categoryId: category.id, unitId: unit.id };
}
