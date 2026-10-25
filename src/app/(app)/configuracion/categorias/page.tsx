import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { TaxonomyAdmin } from "@/modules/catalog/ui/taxonomy-admin";

export const metadata: Metadata = { title: "Categorías - Farmacia Cabaleiro" };

export default async function CategoriesPage() {
  const user = await getCurrentUser();
  // Server-side guard: the page and every action behind it require catalog.manage.
  if (!user || !hasPermission(user, "catalog.manage")) return <AccessDenied message="No tenés permiso para administrar categorías." />;

  const categories = await getCatalogModule().taxonomyService.list(user, "category");
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Categorías</h1>
      <TaxonomyAdmin kind="category" items={categories} />
    </div>
  );
}
