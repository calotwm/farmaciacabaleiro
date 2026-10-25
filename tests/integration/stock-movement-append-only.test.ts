import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/shared/infrastructure/db/prisma";

class Rollback extends Error {}

// Everything runs inside one transaction that is always rolled back, so the
// shared dev database is never polluted and no movement row is ever deleted.
async function inRolledBackTransaction(
  work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<void>,
) {
  await expect(
    prisma.$transaction(async (tx) => {
      await work(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

describe("stock_movements append-only trigger", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedMovement(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
    const suffix = crypto.randomUUID();
    const role = await tx.role.create({ data: { name: `it-role-${suffix}` } });
    const user = await tx.user.create({
      data: { email: `it-${suffix}@example.test`, passwordHash: "x", name: "IT", roleId: role.id },
    });
    const category = await tx.category.create({ data: { name: `it-cat-${suffix}` } });
    const unit = await tx.unit.create({ data: { name: `it-unit-${suffix}` } });
    const product = await tx.product.create({
      data: { code: `IT-${suffix}`, commercialName: "IT product", categoryId: category.id, unitId: unit.id },
    });
    const lot = await tx.lot.create({
      data: {
        productId: product.id,
        lotNumber: "L1",
        expiryDate: new Date("2030-01-31"),
        initialQuantity: 10,
        currentQuantity: 10,
      },
    });
    const movement = await tx.stockMovement.create({
      data: {
        type: "ENTRY",
        lotId: lot.id,
        productId: product.id,
        quantity: 10,
        balanceAfter: 10,
        userId: user.id,
      },
    });
    return { lot, movement };
  }

  async function expectRejected(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    statement: () => Promise<unknown>,
    message: RegExp,
  ) {
    await tx.$executeRawUnsafe("SAVEPOINT guarded");
    await expect(statement()).rejects.toThrow(message);
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT guarded");
  }

  it("rejects UPDATE of a movement", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { movement } = await seedMovement(tx);
      await expectRejected(
        tx,
        () => tx.stockMovement.update({ where: { id: movement.id }, data: { quantity: 99 } }),
        /append-only/,
      );
    });
  });

  it("rejects DELETE of a movement", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { movement } = await seedMovement(tx);
      await expectRejected(tx, () => tx.stockMovement.delete({ where: { id: movement.id } }), /append-only/);
    });
  });

  it("rejects TRUNCATE of the movements table", async () => {
    await inRolledBackTransaction(async (tx) => {
      await expectRejected(tx, () => tx.$executeRawUnsafe('TRUNCATE TABLE "stock_movements"'), /append-only/);
    });
  });

  it("enforces lot quantity CHECK constraints", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { lot } = await seedMovement(tx);
      await expectRejected(
        tx,
        () => tx.lot.update({ where: { id: lot.id }, data: { currentQuantity: -1 } }),
        /lots_current_quantity_non_negative|check constraint/i,
      );
      await expectRejected(
        tx,
        () => tx.lot.update({ where: { id: lot.id }, data: { blockedQuantity: 11 } }),
        /lots_blocked_within_current|check constraint/i,
      );
    });
  });
});
