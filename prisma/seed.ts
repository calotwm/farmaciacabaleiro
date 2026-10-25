// Seeds reference data (demo products only when SEED_DEMO=true) and, optionally, the first admin from ADMIN_USERNAME/ADMIN_PASSWORD.
// Idempotent: safe to re-run.
import "dotenv/config";
import type { AdjustmentReasonKind } from "../src/generated/prisma/client";
import { validatePassword } from "../src/modules/auth/domain/password-policy";
import { Argon2PasswordHasher } from "../src/modules/auth/infrastructure/argon2-password-hasher";
import { createPrismaClient } from "../src/shared/infrastructure/db/create-client";
import { seedDemo } from "./seed-demo";

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
  "deliveries.write",
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

/**
 * Creates the first admin from ADMIN_USERNAME/ADMIN_PASSWORD when both are set and the username is free.
 * Never touches an existing user and never logs the password.
 */
async function bootstrapAdmin(adminRoleId: string) {
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;

  if (await prisma.user.findUnique({ where: { username } })) {
    console.log(`Admin "${username}" already exists, skipping.`);
    return;
  }
  const problems = validatePassword(password);
  if (problems.length > 0) {
    console.warn(`ADMIN_PASSWORD rejected, admin not created: ${problems.join(" ")}`);
    return;
  }
  await prisma.user.create({
    data: {
      username,
      email: `${username}@local.invalid`,
      name: process.env.ADMIN_NAME?.trim() || "Administrador",
      passwordHash: await new Argon2PasswordHasher().hash(password),
      roleId: adminRoleId,
    },
  });
  console.log(`Admin "${username}" created.`);
}

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

  await bootstrapAdmin(admin.id);

  // Opt-in demo products/stock (idempotent); never runs unless explicitly requested.
  if (process.env.SEED_DEMO === "true") await seedDemo(prisma);

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
