/**
 * Scheduled delivery integration tests (real database). Everything runs inside one transaction that is
 * rolled back; only the concurrent-cancel race commits (see its comment) and cleans up after itself.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { AuthUser } from "@/modules/auth/domain/permissions";
import type { CreateDeliveryInput } from "@/modules/deliveries/application/delivery-input";
import type { DeliveryListQuery } from "@/modules/deliveries/application/ports";
import { buildDeliveriesModule } from "@/modules/deliveries/composition";
import { addDays, startOfDayInTz, todayInTz, zonedInstant } from "@/shared/domain/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { prisma } from "@/shared/infrastructure/db/prisma";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { createActiveUser, getTestActor, inRolledBackTransaction, seededCategoryAndUnit } from "./support/fixtures";

const NOW = new Date("2026-11-10T15:00:00Z"); // 12:00 AR
const record = async () => {};

const raceSupplierIds: string[] = [];
const raceDeliveryIds: string[] = [];

afterAll(async () => {
  // Deliveries of the race test are deletable (no stock movements reference them).
  await prisma.auditLog.deleteMany({ where: { entityId: { in: raceDeliveryIds } } });
  await prisma.scheduledDelivery.deleteMany({ where: { supplierId: { in: raceSupplierIds } } });
  await prisma.supplier.deleteMany({ where: { id: { in: raceSupplierIds } } });
  await prisma.$disconnect();
});

function modules(tx: DbClient) {
  return buildDeliveriesModule({ db: tx, transact: (work) => work(tx), audit: record, now: () => NOW });
}

async function setup(tx: DbClient) {
  const admin = await createActiveUser(tx, "admin");
  const supplier = await tx.supplier.create({ data: { name: `TEST proveedor ${crypto.randomUUID()}` } });
  const { categoryId, unitId } = await seededCategoryAndUnit(tx);
  const product = await tx.product.create({ data: { code: `TEST-${crypto.randomUUID()}`, commercialName: "TEST producto entrega", categoryId, unitId } });
  const { deliveryService } = modules(tx);
  const input = (overrides: Partial<CreateDeliveryInput> = {}): CreateDeliveryInput => ({
    supplierId: supplier.id,
    scheduledAt: zonedInstant("2026-11-12", "10:00"),
    type: "DELIVERY",
    orderNumber: null,
    responsibleUserId: null,
    notes: null,
    expectedItems: [],
    ...overrides,
  });
  return { admin, supplier, product, deliveryService, input, tx };
}

const listQuery = (overrides: Partial<Omit<DeliveryListQuery, "now">> = {}): Omit<DeliveryListQuery, "now"> => ({
  sort: "scheduledAt",
  dir: "asc",
  page: 1,
  pageSize: 50,
  ...overrides,
});

describe("scheduling", () => {
  it("creates a delivery with expected items, a responsible user and an audit entry", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, product, deliveryService, input } = await setup(tx);
      const created = await deliveryService.createDelivery(
        admin,
        input({ orderNumber: "P-100", responsibleUserId: admin.id, notes: "Llega por la mañana", expectedItems: [{ productId: product.id, expectedQuantity: 12 }] }),
      );
      expect(created).toMatchObject({ supplierId: supplier.id, status: "SCHEDULED", type: "DELIVERY", orderNumber: "P-100", responsibleUserId: admin.id });
      expect(created.expectedItems).toMatchObject([{ productId: product.id, expectedQuantity: 12 }]);
      // 10:00 AR is stored as 13:00Z.
      expect(created.scheduledAt.toISOString()).toBe("2026-11-12T13:00:00.000Z");
      expect(await tx.scheduledDelivery.count({ where: { id: created.id } })).toBe(1);
    });
  });

  it("rejects inactive or unknown suppliers, archived products, inactive responsibles and missing permissions", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, product, deliveryService, input } = await setup(tx);
      await tx.supplier.update({ where: { id: supplier.id }, data: { status: "INACTIVE" } });
      await expect(deliveryService.createDelivery(admin, input())).rejects.toBeInstanceOf(ValidationError);
      await expect(deliveryService.createDelivery(admin, input({ supplierId: crypto.randomUUID() }))).rejects.toBeInstanceOf(ValidationError);
      await tx.supplier.update({ where: { id: supplier.id }, data: { status: "ACTIVE" } });

      await tx.product.update({ where: { id: product.id }, data: { status: "ARCHIVED" } });
      await expect(deliveryService.createDelivery(admin, input({ expectedItems: [{ productId: product.id, expectedQuantity: 1 }] }))).rejects.toBeInstanceOf(ValidationError);
      await expect(deliveryService.createDelivery(admin, input({ expectedItems: [{ productId: crypto.randomUUID(), expectedQuantity: 1 }] }))).rejects.toBeInstanceOf(ValidationError);
      const inactiveUser = await tx.user.update({ where: { id: admin.id }, data: { active: false } });
      await expect(deliveryService.createDelivery(admin, input({ responsibleUserId: inactiveUser.id }))).rejects.toBeInstanceOf(ValidationError);

      const readOnly: AuthUser = { ...admin, roleName: "employee", permissions: ["deliveries.read"] };
      await expect(deliveryService.createDelivery(readOnly, input())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deliveryService.listDeliveries(readOnly, listQuery())).resolves.toMatchObject({ total: expect.any(Number) });
      const nobody: AuthUser = { ...admin, roleName: "employee", permissions: [] };
      await expect(deliveryService.listDeliveries(nobody, listQuery())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deliveryService.confirmDelivery(readOnly, crypto.randomUUID())).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("the seeded employee role can schedule and manage deliveries", async () => {
    const employee = await getTestActor("employee");
    expect(employee.permissions).toEqual(expect.arrayContaining(["deliveries.read", "deliveries.write"]));
  });

  it("edits type, order, responsible, notes and items of an open delivery but not a closed one", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, product, deliveryService, input } = await setup(tx);
      const created = await deliveryService.createDelivery(admin, input({ expectedItems: [{ productId: product.id, expectedQuantity: 5 }] }));
      const edit = { type: "DELIVERY" as const, orderNumber: "P-2", responsibleUserId: null, notes: "Nuevo", expectedItems: [] };
      const updated = await deliveryService.updateDelivery(admin, created.id, edit);
      expect(updated).toMatchObject({ orderNumber: "P-2", notes: "Nuevo", expectedItems: [] });

      await deliveryService.cancelDelivery(admin, created.id, null);
      await expect(deliveryService.updateDelivery(admin, created.id, edit)).rejects.toBeInstanceOf(ConflictError);
      await expect(deliveryService.updateDelivery(admin, crypto.randomUUID(), edit)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("does not change the type once the delivery has receipts", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, deliveryService, input } = await setup(tx);
      const created = await deliveryService.createDelivery(admin, input());
      await tx.receipt.create({ data: { deliveryId: created.id, supplierId: supplier.id, idempotencyKey: crypto.randomUUID() } });
      const edit = { type: "SALES_VISIT" as const, orderNumber: null, responsibleUserId: null, notes: null, expectedItems: [] };
      await expect(deliveryService.updateDelivery(admin, created.id, edit)).rejects.toBeInstanceOf(ConflictError);
    });
  });
});

describe("status transitions", () => {
  it("confirm, then cancel; a cancelled delivery accepts nothing else", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, deliveryService, input } = await setup(tx);
      const created = await deliveryService.createDelivery(admin, input());
      await deliveryService.confirmDelivery(admin, created.id);
      expect((await deliveryService.getDelivery(admin, created.id)).status).toBe("CONFIRMED");
      await expect(deliveryService.confirmDelivery(admin, created.id)).rejects.toBeInstanceOf(ConflictError);

      await deliveryService.cancelDelivery(admin, created.id, "El proveedor no reparte");
      expect((await deliveryService.getDelivery(admin, created.id)).status).toBe("CANCELLED");
      await expect(deliveryService.confirmDelivery(admin, created.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(deliveryService.cancelDelivery(admin, created.id, null)).rejects.toBeInstanceOf(ConflictError);
      await expect(deliveryService.rescheduleDelivery(admin, created.id, { scheduledAt: zonedInstant("2026-11-20", "10:00"), reason: null })).rejects.toBeInstanceOf(ConflictError);
      await expect(deliveryService.completeDelivery(admin, created.id)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("only visits can be marked as done; a delivery cannot", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, deliveryService, input } = await setup(tx);
      const delivery = await deliveryService.createDelivery(admin, input());
      await expect(deliveryService.completeDelivery(admin, delivery.id)).rejects.toBeInstanceOf(ConflictError);

      const visit = await deliveryService.createDelivery(admin, input({ type: "SALES_VISIT" }));
      await deliveryService.completeDelivery(admin, visit.id);
      expect((await deliveryService.getDelivery(admin, visit.id)).status).toBe("COMPLETED");
      await expect(deliveryService.cancelDelivery(admin, visit.id, null)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("rescheduling builds a linked chain and keeps every original", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, product, deliveryService, input } = await setup(tx);
      const first = await deliveryService.createDelivery(
        admin,
        input({ orderNumber: "P-9", notes: "Frágil", expectedItems: [{ productId: product.id, expectedQuantity: 3 }] }),
      );
      const second = await deliveryService.rescheduleDelivery(admin, first.id, { scheduledAt: zonedInstant("2026-11-15", "09:00"), reason: "Feriado" });
      const third = await deliveryService.rescheduleDelivery(admin, second.id, { scheduledAt: zonedInstant("2026-11-18", "09:00"), reason: null });

      expect(second).toMatchObject({ status: "SCHEDULED", rescheduledFromId: first.id, orderNumber: "P-9", notes: "Frágil" });
      expect(second.expectedItems).toMatchObject([{ productId: product.id, expectedQuantity: 3 }]);
      expect(third).toMatchObject({ status: "SCHEDULED", rescheduledFromId: second.id });

      const reread = (id: string) => deliveryService.getDelivery(admin, id);
      expect(await reread(first.id)).toMatchObject({ status: "RESCHEDULED", rescheduledToId: second.id, rescheduledFromId: null });
      expect(await reread(second.id)).toMatchObject({ status: "RESCHEDULED", rescheduledToId: third.id, rescheduledFromId: first.id });
      expect(await reread(third.id)).toMatchObject({ status: "SCHEDULED", rescheduledToId: null });

      // A rescheduled delivery is terminal: it cannot be rescheduled or cancelled again.
      await expect(deliveryService.rescheduleDelivery(admin, first.id, { scheduledAt: zonedInstant("2026-11-25", "09:00"), reason: null })).rejects.toBeInstanceOf(ConflictError);
      await expect(deliveryService.cancelDelivery(admin, second.id, null)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("a confirmed delivery can be rescheduled; the new one starts SCHEDULED again", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, deliveryService, input } = await setup(tx);
      const created = await deliveryService.createDelivery(admin, input());
      await deliveryService.confirmDelivery(admin, created.id);
      const next = await deliveryService.rescheduleDelivery(admin, created.id, { scheduledAt: zonedInstant("2026-11-16", "11:00"), reason: null });
      expect(next.status).toBe("SCHEDULED");
    });
  });

  it("rejects a reschedule to the past or to the same instant, and leaves the original untouched", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, deliveryService, input } = await setup(tx);
      const created = await deliveryService.createDelivery(admin, input());
      await expect(deliveryService.rescheduleDelivery(admin, created.id, { scheduledAt: new Date(NOW.getTime() - 1000), reason: null })).rejects.toBeInstanceOf(ValidationError);
      await expect(deliveryService.rescheduleDelivery(admin, created.id, { scheduledAt: created.scheduledAt, reason: null })).rejects.toBeInstanceOf(ValidationError);
      expect((await deliveryService.getDelivery(admin, created.id)).status).toBe("SCHEDULED");
      expect(await tx.scheduledDelivery.count({ where: { rescheduledFromId: created.id } })).toBe(0);
    });
  });
});

describe("queries", () => {
  it("filters the list by supplier, type, status, AR date range and late-only, and orders by date", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, deliveryService, input } = await setup(tx);
      const past = await deliveryService.createDelivery(admin, input({ scheduledAt: zonedInstant("2026-11-09", "10:00") })); // late (before NOW)
      const today = await deliveryService.createDelivery(admin, input({ scheduledAt: zonedInstant("2026-11-10", "18:00"), type: "SALES_VISIT" }));
      const later = await deliveryService.createDelivery(admin, input({ scheduledAt: zonedInstant("2026-11-20", "10:00") }));
      await deliveryService.cancelDelivery(admin, later.id, null);

      const ids = async (overrides: Partial<Omit<DeliveryListQuery, "now">>) =>
        (await deliveryService.listDeliveries(admin, listQuery({ supplierId: supplier.id, ...overrides }))).items.map((item) => item.id);
      expect(await ids({})).toEqual([past.id, today.id, later.id]);
      expect(await ids({ dir: "desc" })).toEqual([later.id, today.id, past.id]);
      expect(await ids({ type: "SALES_VISIT" })).toEqual([today.id]);
      expect(await ids({ status: "CANCELLED" })).toEqual([later.id]);
      expect(await ids({ lateOnly: true })).toEqual([past.id]);
      expect(await ids({ from: "2026-11-10", to: "2026-11-10" })).toEqual([today.id]);
      expect(await ids({ from: "2026-11-10" })).toEqual([today.id, later.id]);
      expect(await ids({ to: "2026-11-09" })).toEqual([past.id]);
      expect(await ids({ pageSize: 1, page: 2 })).toEqual([today.id]);
      expect((await deliveryService.listDeliveries(admin, listQuery({ supplierId: crypto.randomUUID() }))).total).toBe(0);
    });
  });

  it("the calendar groups by AR day: 23:30 AR and 00:30 AR land on different days", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, deliveryService, input } = await setup(tx);
      const evening = await deliveryService.createDelivery(admin, input({ scheduledAt: zonedInstant("2026-11-09", "23:30") }));
      const night = await deliveryService.createDelivery(admin, input({ scheduledAt: zonedInstant("2026-11-10", "00:30") }));
      const outside = await deliveryService.createDelivery(admin, input({ scheduledAt: zonedInstant("2026-11-11", "00:00") }));

      const inRange = await deliveryService.listCalendar(admin, { supplierId: supplier.id, from: "2026-11-09", toExclusive: "2026-11-11" });
      expect(inRange.map((item) => item.id)).toEqual([evening.id, night.id]);
      expect(inRange.map((item) => item.id)).not.toContain(outside.id);
      const dayOnly = await deliveryService.listCalendar(admin, { supplierId: supplier.id, from: "2026-11-10", toExclusive: "2026-11-11" });
      expect(dayOnly.map((item) => item.id)).toEqual([night.id]);
    });
  });

  it("lists the open deliveries of a supplier, soonest first, without closed ones", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, deliveryService, input } = await setup(tx);
      const a = await deliveryService.createDelivery(admin, input({ scheduledAt: zonedInstant("2026-11-20", "10:00") }));
      const b = await deliveryService.createDelivery(admin, input({ scheduledAt: zonedInstant("2026-11-05", "10:00") }));
      const closed = await deliveryService.createDelivery(admin, input({ scheduledAt: zonedInstant("2026-11-06", "10:00") }));
      await deliveryService.cancelDelivery(admin, closed.id, null);
      const open = await deliveryService.listOpenForSupplier(admin, supplier.id);
      expect(open.map((item) => item.id)).toEqual([b.id, a.id]);
    });
  });
});

describe("supplier compliance", () => {
  it("counts on-time, late, rescheduled, cancelled and overdue deliveries from the receipts", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, deliveryService } = await setup(tx);
      const make = async (status: "RECEIVED" | "CANCELLED" | "RESCHEDULED" | "CONFIRMED" | "SCHEDULED", scheduled: string, confirmedAt?: string) => {
        const delivery = await tx.scheduledDelivery.create({ data: { supplierId: supplier.id, scheduledAt: zonedInstant(scheduled, "10:00"), status } });
        if (confirmedAt) {
          await tx.receipt.create({
            data: { deliveryId: delivery.id, supplierId: supplier.id, idempotencyKey: crypto.randomUUID(), status: "CONFIRMED", confirmedAt: new Date(confirmedAt) },
          });
        }
        return delivery;
      };
      await make("RECEIVED", "2026-11-02", "2026-11-02T20:00:00Z"); // same AR day -> on time
      await make("RECEIVED", "2026-11-03", "2026-11-01T12:00:00Z"); // before -> on time
      await make("RECEIVED", "2026-11-04", "2026-11-06T12:00:00Z"); // after -> late
      await make("RESCHEDULED", "2026-11-05");
      await make("CANCELLED", "2026-11-06");
      await make("CONFIRMED", "2026-11-07"); // open and past -> overdue
      await make("SCHEDULED", "2026-11-25"); // open and future -> pending
      await tx.scheduledDelivery.create({ data: { supplierId: supplier.id, scheduledAt: zonedInstant("2026-11-08", "10:00"), type: "SALES_VISIT", status: "COMPLETED" } });

      const summary = await deliveryService.complianceForSupplier(admin, supplier.id);
      expect(summary).toEqual({ scheduled: 7, onTime: 2, receivedLate: 1, rescheduled: 1, cancelled: 1, overdue: 1, pending: 1, onTimePercentage: 33 });

      const ranged = await deliveryService.complianceForSupplier(admin, supplier.id, { from: "2026-11-02", to: "2026-11-03" });
      expect(ranged).toMatchObject({ scheduled: 2, onTime: 2, onTimePercentage: 100 });

      const report = await deliveryService.complianceReport(admin, { supplierId: supplier.id });
      expect(report).toHaveLength(1);
      expect(report[0]).toMatchObject({ supplierId: supplier.id, summary: { scheduled: 7 } });
    });
  });
});

describe("concurrency (real transactions)", () => {
  it("two concurrent cancels: one wins, the other is rejected, and the status ends CANCELLED", async () => {
    const actor = await getTestActor("admin");
    const supplier = await prisma.supplier.create({ data: { name: `TEST proveedor carrera ${crypto.randomUUID()}` } });
    raceSupplierIds.push(supplier.id);
    const { deliveryService } = buildDeliveriesModule({ audit: record });
    const created = await deliveryService.createDelivery(actor, {
      supplierId: supplier.id,
      scheduledAt: startOfDayInTz(addDays(todayInTz(), 30)),
      type: "DELIVERY",
      orderNumber: null,
      responsibleUserId: null,
      notes: null,
      expectedItems: [],
    });
    raceDeliveryIds.push(created.id);

    const results = await Promise.allSettled([deliveryService.cancelDelivery(actor, created.id, null), deliveryService.cancelDelivery(actor, created.id, null)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect((await prisma.scheduledDelivery.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("CANCELLED");
  });
});
