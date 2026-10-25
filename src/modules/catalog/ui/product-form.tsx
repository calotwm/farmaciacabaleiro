"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { BarcodeInput } from "@/components/barcode-input";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import type { ProductRecord } from "../application/ports";
import { createProductAction, updateProductAction } from "./product-actions";

interface ProductFormProps {
  categories: SelectOption[];
  units: SelectOption[];
  suppliers: SelectOption[];
  /** Present when editing. */
  product?: ProductRecord;
}

function defaultsFrom(product?: ProductRecord): Record<string, string> {
  if (!product) return { status: "ACTIVE", minStock: "0", costPrice: "0.00" };
  return {
    code: product.code,
    commercialName: product.commercialName,
    activeIngredient: product.activeIngredient ?? "",
    brand: product.brand ?? "",
    laboratory: product.laboratory ?? "",
    barcode: product.barcode ?? "",
    sku: product.sku ?? "",
    categoryId: product.categoryId,
    presentation: product.presentation ?? "",
    concentration: product.concentration ?? "",
    pharmaceuticalForm: product.pharmaceuticalForm ?? "",
    contentPerPackage: product.contentPerPackage ?? "",
    unitId: product.unitId,
    minStock: String(product.minStock),
    maxStock: product.maxStock === null ? "" : String(product.maxStock),
    costPrice: product.costPrice,
    salePrice: product.salePrice ?? "",
    usualSupplierId: product.usualSupplierId ?? "",
    location: product.location ?? "",
    status: product.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    notes: product.notes ?? "",
  };
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: "ACTIVE", label: "Activo" },
  { value: "INACTIVE", label: "Inactivo" },
];

export function ProductForm({ categories, units, suppliers, product }: ProductFormProps) {
  const isEdit = !!product;
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateProductAction : createProductAction,
    initialFormState,
  );
  const skuRef = useRef<HTMLInputElement>(null);
  const defaults = { ...defaultsFrom(product), ...state.values };
  const errors = state.fieldErrors ?? {};

  function field(name: string) {
    return { name, defaultValue: defaults[name] ?? "", errors: errors[name] };
  }

  return (
    <form action={formAction} className="grid max-w-4xl gap-6" noValidate>
      <FormBanner error={state.error} />
      {isEdit ? <input type="hidden" name="id" value={product.id} /> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-medium">Datos generales</legend>
        <FormField {...field("commercialName")} label="Nombre comercial" required autoFocus />
        <FormField {...field("code")} label="Código interno" hint="Si lo dejás vacío se genera uno automático." />
        <BarcodeInput
          {...field("barcode")}
          label="Código de barras"
          hint="Podés escanearlo: el Enter del lector no envía el formulario."
          onScan={() => skuRef.current?.focus()}
        />
        <FormField {...field("sku")} label="SKU" ref={skuRef} />
        <SelectField {...field("categoryId")} label="Categoría" options={categories} placeholder="Elegí una categoría" required />
        <SelectField {...field("unitId")} label="Unidad" options={units} placeholder="Elegí una unidad" required />
        <FormField {...field("brand")} label="Marca" />
        <FormField {...field("laboratory")} label="Laboratorio" />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-medium">Datos farmacológicos (opcionales)</legend>
        <FormField {...field("activeIngredient")} label="Principio activo" />
        <FormField {...field("pharmaceuticalForm")} label="Forma farmacéutica" hint="Por ejemplo: comprimido, jarabe, crema." />
        <FormField {...field("concentration")} label="Concentración" hint="Por ejemplo: 500 mg." />
        <FormField {...field("presentation")} label="Presentación" />
        <FormField {...field("contentPerPackage")} label="Contenido por envase" />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-medium">Stock y precios</legend>
        <FormField {...field("minStock")} label="Stock mínimo" inputMode="numeric" />
        <FormField {...field("maxStock")} label="Stock máximo" inputMode="numeric" />
        <FormField {...field("costPrice")} label="Precio de costo (ARS)" inputMode="decimal" />
        <FormField {...field("salePrice")} label="Precio de venta (ARS)" inputMode="decimal" />
        <SelectField {...field("usualSupplierId")} label="Proveedor habitual" options={suppliers} placeholder="Sin proveedor" />
        <FormField {...field("location")} label="Ubicación" hint="Estante, góndola o depósito." />
        <SelectField {...field("status")} label="Estado" options={STATUS_OPTIONS} />
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" defaultValue={defaults.notes ?? ""} aria-invalid={errors.notes ? true : undefined} />
        {errors.notes ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.notes.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear producto"}
        </Button>
        <Button asChild variant="outline">
          <Link href={isEdit ? `/productos/${product.id}` : "/productos"}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
