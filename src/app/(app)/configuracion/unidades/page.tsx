import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { TaxonomyAdmin } from "@/modules/catalog/ui/taxonomy-admin";

export const metadata: Metadata = { title: "Unidades - Farmacia Cabaleiro" };

export default async function UnitsPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "catalog.manage")) return <AccessDenied message="No tenés permiso para administrar unidades." />;

  const units = await getCatalogModule().taxonomyService.list(user, "unit");
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Unidades</h1>
      <TaxonomyAdmin kind="unit" items={units} />
    </div>
  );
}
