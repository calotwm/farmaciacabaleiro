import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { ProductForm } from "@/modules/catalog/ui/product-form";
import { readGeneralSettings } from "@/modules/settings/infrastructure/read-general-settings";
import { prisma } from "@/shared/infrastructure/db/prisma";

export const metadata: Metadata = { title: "Nuevo producto - Farmacia Cabaleiro" };

export default async function NewProductPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "products.write")) return <AccessDenied message="No tenés permiso para crear productos." />;

  const { catalogService, taxonomyService } = getCatalogModule();
  const [categories, units, suppliers, settings] = await Promise.all([
    taxonomyService.list(user, "category"),
    taxonomyService.list(user, "unit"),
    catalogService.listSupplierOptions(user),
    readGeneralSettings(prisma),
  ]);

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Nuevo producto</h1>
      <ProductForm
        defaultMinStock={settings.defaultMinStock}
        currency={settings.currency}
        categories={categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))}
        units={units.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))}
        suppliers={suppliers.map((s) => ({ value: s.id, label: s.name }))}
      />
    </div>
  );
}
