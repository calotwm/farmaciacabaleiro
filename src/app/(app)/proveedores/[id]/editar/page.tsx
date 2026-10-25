import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getSuppliersModule } from "@/modules/suppliers/composition";
import { SupplierForm } from "@/modules/suppliers/ui/supplier-form";
import { hasErrorCode } from "@/shared/domain/errors";
import { isUuid } from "@/shared/domain/ids";

export const metadata: Metadata = { title: "Editar proveedor - Farmacia Cabaleiro" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "suppliers.write")) return <AccessDenied message="No tenés permiso para editar proveedores." />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supplier = await getSuppliersModule()
    .supplierService.getSupplier(user, id)
    .catch((error) => {
      if (hasErrorCode(error, "NOT_FOUND")) return null;
      throw error;
    });
  if (!supplier) notFound();

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Editar proveedor</h1>
      <SupplierForm supplier={supplier} />
    </div>
  );
}
