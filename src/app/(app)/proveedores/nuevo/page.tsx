import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { SupplierForm } from "@/modules/suppliers/ui/supplier-form";

export const metadata: Metadata = { title: "Nuevo proveedor - Farmacia Cabaleiro" };

export default async function NewSupplierPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "suppliers.write")) return <AccessDenied message="No tenés permiso para crear proveedores." />;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Nuevo proveedor</h1>
      <SupplierForm />
    </div>
  );
}
