// Seeds reference data only (no users, no demo products). Idempotent: safe to re-run.
import "dotenv/config";
import type { AdjustmentReasonKind } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/shared/infrastructure/db/create-client";

const prisma = createPrismaClient();

const PERMISSIONS: Record<string, string> = {
  "products.read": "View products and categories",
  "products.write": "Create and edit products",
  "products.archive": "Archive products",
  "catalog.manage": "Manage categories and units",
  "inventory.read": "View lots, stock and movements",
  "inventory.write": "Register entries, exits and adjustments",
  "inventory.writeoff": "Register write-offs and returns",
  "inventory.count": "Run physical counts and reconciliation",
  "suppliers.read": "View suppliers",
  "suppliers.write": "Create and edit suppliers",
  "deliveries.read": "View scheduled deliveries",
  "deliveries.write": "Schedule and reschedule deliveries",
  "receiving.read": "View receipts",
  "receiving.write": "Register and confirm receipts",
  "reports.read": "View reports",
  "reports.export": "Export reports",
  "audit.read": "View audit log",
  "users.manage": "Manage users and roles",
  "settings.manage": "Manage system settings",
};

const EMPLOYEE_PERMISSIONS = [
  "products.read",
  "inventory.read",
  "inventory.write",
  "inventory.count",
  "suppliers.read",
  "deliveries.read",
  "receiving.read",
  "receiving.write",
  "reports.read",
];

const CATEGORIES = ["Medicamento", "Venta libre", "Perfumería", "Higiene", "Suplemento", "Otro"];

const UNITS = ["Unidad", "Caja", "Blíster", "Frasco", "Tubo", "Sobre", "Ampolla", "ml", "g"];

const ADJUSTMENT_REASONS: Array<{ kind: AdjustmentReasonKind; name: string }> = [
  { kind: "ADJUSTMENT", name: "Error de carga" },
  { kind: "ADJUSTMENT", name: "Diferencia de inventario" },
  { kind: "ADJUSTMENT", name: "Otro ajuste" },
  { kind: "WRITE_OFF", name: "Vencimiento" },
  { kind: "WRITE_OFF", name: "Rotura" },
  { kind: "WRITE_OFF", name: "Pérdida o robo" },
  { kind: "WRITE_OFF", name: "Producto en mal estado" },
  { kind: "RETURN", name: "Devolución al proveedor" },
  { kind: "RETURN", name: "Devolución de cliente" },
];

const DEFAULT_SETTINGS: Record<string, unknown> = {
  "pharmacy.profile": { name: "Farmacia Cabaleiro", address: "", phone: "", email: "" },
  "expiry.thresholdsDays": [180, 90, 60, 30, 7],
  "stock.defaultMinStock": 0,
  "locale.currency": "ARS",
  "locale.timezone": "America/Argentina/Buenos_Aires",
};

async function main() {
  const [admin, employee] = await Promise.all(
    [
      { name: "admin", description: "Full access" },
      { name: "employee", description: "Daily operations" },
    ].map((role) =>
      prisma.role.upsert({ where: { name: role.name }, update: { description: role.description }, create: role }),
    ),
  );

  const permissions = await Promise.all(
    Object.entries(PERMISSIONS).map(([key, description]) =>
      prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } }),
    ),
  );

  const links = [
    ...permissions.map((p) => ({ roleId: admin.id, permissionId: p.id })),
    ...permissions
      .filter((p) => EMPLOYEE_PERMISSIONS.includes(p.key))
      .map((p) => ({ roleId: employee.id, permissionId: p.id })),
  ];
  await prisma.rolePermission.createMany({ data: links, skipDuplicates: true });

  for (const name of CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of UNITS) {
    await prisma.unit.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const reason of ADJUSTMENT_REASONS) {
    await prisma.adjustmentReason.upsert({
      where: { kind_name: reason },
      update: {},
      create: reason,
    });
  }
  // Existing values are kept on re-run so admin edits are never overwritten.
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as never } });
  }

  console.log(
    `Seed complete: 2 roles, ${permissions.length} permissions, ${CATEGORIES.length} categories, ` +
      `${UNITS.length} units, ${ADJUSTMENT_REASONS.length} reasons, ${Object.keys(DEFAULT_SETTINGS).length} settings`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
