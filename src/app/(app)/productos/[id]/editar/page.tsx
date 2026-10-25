import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { ProductForm } from "@/modules/catalog/ui/product-form";
import { hasErrorCode } from "@/shared/domain/errors";

export const metadata: Metadata = { title: "Editar producto - Farmacia Cabaleiro" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "products.write")) return <AccessDenied message="No tenés permiso para editar productos." />;

  const { id } = await params;
  const { catalogService, taxonomyService } = getCatalogModule();
  const product = await catalogService.getProduct(user, id).catch((error) => {
    if (hasErrorCode(error, "NOT_FOUND")) return null;
    throw error;
  });
  if (!product || product.status === "ARCHIVED") notFound();

  const [categories, units, suppliers] = await Promise.all([
    taxonomyService.list(user, "category"),
    taxonomyService.list(user, "unit"),
    catalogService.listSupplierOptions(user),
  ]);
  // Keep the product's current category/unit selectable even if they were deactivated since.
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  if (product.usualSupplierId && !supplierOptions.some((s) => s.value === product.usualSupplierId)) {
    supplierOptions.push({ value: product.usualSupplierId, label: product.usualSupplierName ?? "Proveedor inactivo" });
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Editar producto</h1>
      <ProductForm
        product={product}
        categories={categories.filter((c) => c.active || c.id === product.categoryId).map((c) => ({ value: c.id, label: c.name }))}
        units={units.filter((u) => u.active || u.id === product.unitId).map((u) => ({ value: u.id, label: u.name }))}
        suppliers={supplierOptions}
      />
    </div>
  );
}
