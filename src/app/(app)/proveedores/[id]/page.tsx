import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getDeliveriesModule } from "@/modules/deliveries/composition";
import { ComplianceCard } from "@/modules/deliveries/ui/compliance-views";
import { OpenDeliveriesCard } from "@/modules/deliveries/ui/open-deliveries-card";
import { getSuppliersModule } from "@/modules/suppliers/composition";
import { SupplierDetail } from "@/modules/suppliers/ui/supplier-detail";
import { SupplierProducts } from "@/modules/suppliers/ui/supplier-products";
import { SupplierStatusBadge } from "@/modules/suppliers/ui/supplier-status-badge";
import { ToggleActiveButton } from "@/modules/suppliers/ui/toggle-active-button";
import { hasErrorCode } from "@/shared/domain/errors";
import { isUuid } from "@/shared/domain/ids";

export const metadata: Metadata = { title: "Proveedor - Farmacia Cabaleiro" };

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "suppliers.read")) return <AccessDenied message="No tenés permiso para ver los proveedores." />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supplierService } = getSuppliersModule();
  const supplier = await supplierService.getSupplier(user, id).catch((error) => {
    if (hasErrorCode(error, "NOT_FOUND")) return null;
    throw error;
  });
  if (!supplier) notFound();

  const products = await supplierService.listProducts(user, supplier.id);
  const canWrite = hasPermission(user, "suppliers.write");
  const canReadDeliveries = hasPermission(user, "deliveries.read");
  const now = new Date();
  const { deliveryService } = getDeliveriesModule();
  const [openDeliveries, compliance] = canReadDeliveries
    ? await Promise.all([deliveryService.listOpenForSupplier(user, supplier.id), deliveryService.complianceForSupplier(user, supplier.id)])
    : [null, null];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{supplier.name}</h1>
          <SupplierStatusBadge status={supplier.status} />
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/proveedores/${supplier.id}/editar`}>Editar</Link>
            </Button>
            <ToggleActiveButton supplierId={supplier.id} supplierName={supplier.name} active={supplier.status === "ACTIVE"} />
          </div>
        ) : null}
      </div>
      <SupplierDetail supplier={supplier} />
      <SupplierProducts supplierId={supplier.id} products={products} canEdit={canWrite} canLinkProducts={hasPermission(user, "products.read")} />
      {openDeliveries ? (
        <OpenDeliveriesCard supplierId={supplier.id} deliveries={openDeliveries} now={now} canSchedule={hasPermission(user, "deliveries.write") && supplier.status === "ACTIVE"} />
      ) : null}
      {compliance ? <ComplianceCard summary={compliance} supplierId={supplier.id} /> : null}
      <Placeholder title="Recepciones recientes" text="Las últimas recepciones de mercadería de este proveedor se mostrarán acá." />
    </div>
  );
}
