// Demo data for demos/manual testing. Only runs when SEED_DEMO=true (see prisma/seed.ts).
// Idempotent: skipped entirely when a product with a `DEMO-` code already exists.
// Everything goes through the application services, so stock invariants (lots, append-only movements,
// audit) hold exactly as they do for real usage.
import type { PrismaClient } from "../src/generated/prisma/client";
import { ADMIN_ROLE, type AuthUser } from "../src/modules/auth/domain/permissions";
import { buildCatalogModule } from "../src/modules/catalog/composition";
import { buildDeliveriesModule } from "../src/modules/deliveries/composition";
import { applyEntry } from "../src/modules/inventory/application/stock-operations";
import { createPrismaStockTx } from "../src/modules/inventory/infrastructure/prisma-stock-tx";
import { buildSuppliersModule } from "../src/modules/suppliers/composition";
import { cuitCheckDigit } from "../src/modules/suppliers/domain/cuit";
import { type CalendarDate, addDays, todayInTz, zonedInstant } from "../src/shared/domain/dates";

interface DemoLot {
  lot: string;
  /** Days from today until expiry (negative = already expired). */
  expiresIn: number;
  quantity: number;
}

interface DemoProduct {
  name: string;
  ingredient: string | null;
  concentration: string | null;
  form: string;
  content: string;
  category: "Medicamento" | "Venta libre" | "Perfumería" | "Higiene" | "Suplemento";
  unit: "Caja" | "Frasco" | "Tubo" | "Unidad";
  minStock: number;
  cost: string;
  sale: string;
  supplier: 0 | 1 | 2;
  lots: DemoLot[];
}

const SUPPLIERS = [
  { name: "Droguería del Sur S.A.", base: "3071234567", contact: "Marcela Pereyra", phone: "011 4555-0101", email: "pedidos@drogueriadelsur.example", leadTimeDays: 2 },
  { name: "Distribuidora Farmalider S.R.L.", base: "3069876543", contact: "Julián Acosta", phone: "011 4555-0202", email: "ventas@farmalider.example", leadTimeDays: 3 },
  { name: "Laboratorios Andinos S.A.", base: "3055512345", contact: "Sofía Giménez", phone: "0351 555-0303", email: "comercial@andinos.example", leadTimeDays: 5 },
];

/** Appends the CUIT check digit; bumps the serial until a valid digit exists. */
function buildCuit(base: string): string {
  let prefix = Number(base);
  for (;;) {
    const digit = cuitCheckDigit(String(prefix));
    if (digit !== null) return `${prefix}${digit}`;
    prefix += 1;
  }
}

const PRODUCTS: DemoProduct[] = [
  { name: "Ibuprofeno 400 mg x 20 comp.", ingredient: "Ibuprofeno", concentration: "400 mg", form: "Comprimidos recubiertos", content: "20 comprimidos", category: "Medicamento", unit: "Caja", minStock: 10, cost: "1850.00", sale: "3200.00", supplier: 0, lots: [{ lot: "IB2401", expiresIn: 4, quantity: 12 }, { lot: "IB2507", expiresIn: 320, quantity: 40 }] },
  { name: "Amoxicilina 500 mg x 16 cáps.", ingredient: "Amoxicilina", concentration: "500 mg", form: "Cápsulas", content: "16 cápsulas", category: "Medicamento", unit: "Caja", minStock: 8, cost: "4200.00", sale: "7100.00", supplier: 2, lots: [{ lot: "AM2311", expiresIn: -12, quantity: 6 }, { lot: "AM2508", expiresIn: 410, quantity: 18 }] },
  { name: "Losartán 50 mg x 30 comp.", ingredient: "Losartán potásico", concentration: "50 mg", form: "Comprimidos recubiertos", content: "30 comprimidos", category: "Medicamento", unit: "Caja", minStock: 12, cost: "3900.00", sale: "6500.00", supplier: 0, lots: [{ lot: "LO2502", expiresIn: 520, quantity: 35 }] },
  { name: "Paracetamol 1 g x 16 comp.", ingredient: "Paracetamol", concentration: "1 g", form: "Comprimidos", content: "16 comprimidos", category: "Venta libre", unit: "Caja", minStock: 20, cost: "1500.00", sale: "2600.00", supplier: 1, lots: [{ lot: "PA2410", expiresIn: 14, quantity: 15 }, { lot: "PA2509", expiresIn: 600, quantity: 60 }] },
  { name: "Omeprazol 20 mg x 28 cáps.", ingredient: "Omeprazol", concentration: "20 mg", form: "Cápsulas gastrorresistentes", content: "28 cápsulas", category: "Medicamento", unit: "Caja", minStock: 10, cost: "2800.00", sale: "4800.00", supplier: 2, lots: [{ lot: "OM2504", expiresIn: 75, quantity: 22 }] },
  { name: "Enalapril 10 mg x 30 comp.", ingredient: "Enalapril maleato", concentration: "10 mg", form: "Comprimidos", content: "30 comprimidos", category: "Medicamento", unit: "Caja", minStock: 10, cost: "2100.00", sale: "3700.00", supplier: 0, lots: [{ lot: "EN2503", expiresIn: 29, quantity: 9 }, { lot: "EN2510", expiresIn: 450, quantity: 3 }] },
  { name: "Metformina 850 mg x 60 comp.", ingredient: "Metformina clorhidrato", concentration: "850 mg", form: "Comprimidos recubiertos", content: "60 comprimidos", category: "Medicamento", unit: "Caja", minStock: 8, cost: "3300.00", sale: "5600.00", supplier: 1, lots: [{ lot: "ME2506", expiresIn: 380, quantity: 28 }] },
  { name: "Salbutamol aerosol 100 mcg", ingredient: "Salbutamol", concentration: "100 mcg/dosis", form: "Aerosol para inhalación", content: "200 dosis", category: "Medicamento", unit: "Unidad", minStock: 6, cost: "5200.00", sale: "8900.00", supplier: 2, lots: [{ lot: "SA2412", expiresIn: 6, quantity: 7 }, { lot: "SA2511", expiresIn: 540, quantity: 10 }] },
  { name: "Diclofenac gel 1 % x 60 g", ingredient: "Diclofenac dietilamina", concentration: "1 %", form: "Gel tópico", content: "60 g", category: "Venta libre", unit: "Tubo", minStock: 8, cost: "2900.00", sale: "4900.00", supplier: 1, lots: [{ lot: "DI2309", expiresIn: -45, quantity: 5 }, { lot: "DI2505", expiresIn: 260, quantity: 14 }] },
  { name: "Atorvastatina 20 mg x 30 comp.", ingredient: "Atorvastatina cálcica", concentration: "20 mg", form: "Comprimidos recubiertos", content: "30 comprimidos", category: "Medicamento", unit: "Caja", minStock: 10, cost: "4600.00", sale: "7800.00", supplier: 0, lots: [{ lot: "AT2501", expiresIn: 60, quantity: 16 }, { lot: "AT2512", expiresIn: 700, quantity: 25 }] },
  { name: "Levotiroxina 100 mcg x 50 comp.", ingredient: "Levotiroxina sódica", concentration: "100 mcg", form: "Comprimidos", content: "50 comprimidos", category: "Medicamento", unit: "Caja", minStock: 6, cost: "3100.00", sale: "5300.00", supplier: 2, lots: [{ lot: "LE2508", expiresIn: 28, quantity: 4 }] },
  { name: "Loratadina 10 mg x 10 comp.", ingredient: "Loratadina", concentration: "10 mg", form: "Comprimidos", content: "10 comprimidos", category: "Venta libre", unit: "Caja", minStock: 10, cost: "1200.00", sale: "2100.00", supplier: 1, lots: [{ lot: "LO2511", expiresIn: 88, quantity: 24 }] },
  { name: "Ranitidina 150 mg x 20 comp.", ingredient: "Ranitidina", concentration: "150 mg", form: "Comprimidos", content: "20 comprimidos", category: "Medicamento", unit: "Caja", minStock: 5, cost: "1700.00", sale: "2900.00", supplier: 0, lots: [{ lot: "RA2404", expiresIn: 11, quantity: 8 }] },
  { name: "Clonazepam 0,5 mg x 30 comp.", ingredient: "Clonazepam", concentration: "0,5 mg", form: "Comprimidos", content: "30 comprimidos", category: "Medicamento", unit: "Caja", minStock: 4, cost: "2500.00", sale: "4300.00", supplier: 2, lots: [{ lot: "CL2507", expiresIn: 230, quantity: 12 }] },
  { name: "Alcohol en gel 250 ml", ingredient: null, concentration: null, form: "Gel", content: "250 ml", category: "Higiene", unit: "Frasco", minStock: 12, cost: "1300.00", sale: "2400.00", supplier: 1, lots: [{ lot: "AG2506", expiresIn: 480, quantity: 48 }] },
  { name: "Protector solar FPS 50 x 120 ml", ingredient: null, concentration: null, form: "Emulsión", content: "120 ml", category: "Perfumería", unit: "Frasco", minStock: 6, cost: "7800.00", sale: "13500.00", supplier: 1, lots: [{ lot: "PS2509", expiresIn: 365, quantity: 20 }] },
  { name: "Vitamina C 1 g x 20 comp. efervescentes", ingredient: "Ácido ascórbico", concentration: "1 g", form: "Comprimidos efervescentes", content: "20 comprimidos", category: "Suplemento", unit: "Tubo", minStock: 10, cost: "2200.00", sale: "3800.00", supplier: 2, lots: [{ lot: "VC2510", expiresIn: 150, quantity: 30 }] },
  { name: "Ibuprofeno jarabe 100 mg/5 ml", ingredient: "Ibuprofeno", concentration: "100 mg/5 ml", form: "Suspensión oral", content: "120 ml", category: "Medicamento", unit: "Frasco", minStock: 8, cost: "2400.00", sale: "4100.00", supplier: 0, lots: [{ lot: "IJ2507", expiresIn: 200, quantity: 3 }] },
  { name: "Amlodipina 5 mg x 30 comp.", ingredient: "Amlodipina besilato", concentration: "5 mg", form: "Comprimidos", content: "30 comprimidos", category: "Medicamento", unit: "Caja", minStock: 10, cost: "2700.00", sale: "4600.00", supplier: 0, lots: [] },
];

const DELIVERIES = [
  { supplier: 0, days: -2, time: "10:00", type: "DELIVERY", items: [0, 5] },
  { supplier: 1, days: 0, time: "15:30", type: "DELIVERY", items: [3, 11] },
  { supplier: 2, days: 3, time: "11:00", type: "DELIVERY", items: [1, 7] },
  { supplier: 0, days: 6, time: "09:30", type: "SALES_VISIT", items: [] as number[] },
] as const;

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  if (await prisma.product.findFirst({ where: { code: { startsWith: "DEMO-" } }, select: { id: true } })) {
    console.log("Demo data already present (DEMO- products found), skipping.");
    return;
  }

  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const adminUser =
    (username ? await prisma.user.findUnique({ where: { username } }) : null) ??
    (await prisma.user.findFirst({ where: { role: { name: ADMIN_ROLE } }, orderBy: { createdAt: "asc" } }));
  if (!adminUser) {
    console.warn("Demo data skipped: no admin user found (set ADMIN_USERNAME/ADMIN_PASSWORD first).");
    return;
  }
  const actor: AuthUser = { id: adminUser.id, email: adminUser.email, name: adminUser.name, roleName: ADMIN_ROLE, permissions: [] };

  const [categories, units] = await Promise.all([prisma.category.findMany(), prisma.unit.findMany()]);
  const categoryId = (name: string) => categories.find((c) => c.name === name)?.id;
  const unitId = (name: string) => units.find((u) => u.name === name)?.id;

  const { supplierService } = buildSuppliersModule({ db: prisma });
  const { catalogService } = buildCatalogModule({ db: prisma });
  const { deliveryService } = buildDeliveriesModule({ db: prisma, transact: (work) => prisma.$transaction(work) });

  const suppliers = [];
  for (const s of SUPPLIERS) {
    suppliers.push(
      await supplierService.createSupplier(actor, {
        name: s.name,
        cuit: buildCuit(s.base),
        contactName: s.contact,
        phone: s.phone,
        email: s.email,
        address: null,
        visitDays: [],
        deliveryHours: "8:00 a 13:00",
        leadTimeDays: s.leadTimeDays,
        status: "ACTIVE",
        notes: "Proveedor de demostración",
      }),
    );
  }

  const today = todayInTz();
  const productIds: string[] = [];
  let lotCount = 0;
  for (const [index, p] of PRODUCTS.entries()) {
    const catId = categoryId(p.category);
    const uId = unitId(p.unit);
    if (!catId || !uId) throw new Error(`Missing category/unit for ${p.name}; run the reference seed first.`);
    const supplier = suppliers[p.supplier];
    const product = await catalogService.createProduct(actor, {
      code: `DEMO-${String(index + 1).padStart(3, "0")}`,
      commercialName: p.name,
      activeIngredient: p.ingredient,
      brand: null,
      laboratory: SUPPLIERS[p.supplier].name.replace(/ (S\.A\.|S\.R\.L\.)$/, ""),
      barcode: null,
      sku: null,
      categoryId: catId,
      presentation: p.content,
      concentration: p.concentration,
      pharmaceuticalForm: p.form,
      contentPerPackage: p.content,
      unitId: uId,
      minStock: p.minStock,
      maxStock: null,
      costPrice: p.cost,
      salePrice: p.sale,
      usualSupplierId: supplier.id,
      location: null,
      status: "ACTIVE",
      notes: null,
    });
    productIds.push(product.id);

    for (const lot of p.lots) {
      const expiryDate: CalendarDate = addDays(today, lot.expiresIn);
      // New lots cannot be entered already expired: enter those as of a date before they expired.
      const entryDay = lot.expiresIn < 0 ? addDays(expiryDate, -30) : today;
      const at = lot.expiresIn < 0 ? zonedInstant(entryDay, "09:00") : new Date();
      await prisma.$transaction(
        (tx) =>
          applyEntry(createPrismaStockTx(tx), {
            actorId: actor.id,
            entry: {
              productId: product.id,
              quantity: lot.quantity,
              lotNumber: lot.lot,
              expiryDate,
              unitCost: p.cost,
              supplierId: supplier.id,
              invoiceNumber: `A-0001-${String(1000 + index).padStart(8, "0")}`,
              location: null,
              notes: "Stock de demostración",
            },
            today: entryDay,
            at,
          }),
        { timeout: 30_000, maxWait: 10_000 },
      );
      lotCount += 1;
    }
  }

  for (const d of DELIVERIES) {
    await deliveryService.createDelivery(actor, {
      supplierId: suppliers[d.supplier].id,
      scheduledAt: zonedInstant(addDays(today, d.days), d.time),
      type: d.type,
      orderNumber: d.type === "DELIVERY" ? `PED-DEMO-${d.supplier + 1}${d.days + 2}` : null,
      responsibleUserId: null,
      notes: "Entrega de demostración",
      expectedItems: d.items.map((i) => ({ productId: productIds[i], expectedQuantity: 20 })),
    });
  }

  console.log(`Demo data loaded: ${suppliers.length} suppliers, ${PRODUCTS.length} products, ${lotCount} lots, ${DELIVERIES.length} deliveries.`);
}
