import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/shared/domain/dates";
import { formatMoney } from "@/shared/domain/money";
import type { ProductRecord } from "../application/ports";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd>{children || "-"}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
      </CardContent>
    </Card>
  );
}

/** Presentational: read-only product data grouped like the form. */
export function ProductDetail({ product, currency }: { product: ProductRecord; currency?: string }) {
  return (
    <div className="grid gap-4">
      <Section title="Datos generales">
        <Row label="Código interno">{product.code}</Row>
        <Row label="Código de barras">{product.barcode}</Row>
        <Row label="SKU">{product.sku}</Row>
        <Row label="Categoría">{product.categoryName}</Row>
        <Row label="Unidad">{product.unitName}</Row>
        <Row label="Marca">{product.brand}</Row>
        <Row label="Laboratorio">{product.laboratory}</Row>
      </Section>
      <Section title="Datos farmacológicos">
        <Row label="Principio activo">{product.activeIngredient}</Row>
        <Row label="Forma farmacéutica">{product.pharmaceuticalForm}</Row>
        <Row label="Concentración">{product.concentration}</Row>
        <Row label="Presentación">{product.presentation}</Row>
        <Row label="Contenido por envase">{product.contentPerPackage}</Row>
      </Section>
      <Section title="Stock y precios">
        <Row label="Stock mínimo">{product.minStock}</Row>
        <Row label="Stock máximo">{product.maxStock}</Row>
        <Row label="Precio de costo">{formatMoney(product.costPrice, { currency })}</Row>
        <Row label="Precio de venta">{product.salePrice ? formatMoney(product.salePrice, { currency }) : null}</Row>
        <Row label="Proveedor habitual">{product.usualSupplierName}</Row>
        <Row label="Ubicación">{product.location}</Row>
      </Section>
      {product.notes ? (
        <Section title="Notas">
          <Row label="Observaciones">{product.notes}</Row>
        </Section>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Creado el {formatDateTime(product.createdAt)} · Última modificación {formatDateTime(product.updatedAt)}
      </p>
    </div>
  );
}
