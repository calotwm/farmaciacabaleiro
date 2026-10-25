import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { SettingsSection } from "@/components/settings-section";
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
    <SettingsSection title="Categorías" description="Clasifican los productos del catálogo.">
      <TaxonomyAdmin kind="category" items={categories} />
    </SettingsSection>
  );
}
