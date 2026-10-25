"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import type { TaxonomyRecord } from "../application/ports";
import type { TaxonomyKind } from "../application/taxonomy-service";
import {
  createTaxonomyAction,
  deleteTaxonomyAction,
  renameTaxonomyAction,
  setTaxonomyActiveAction,
} from "./taxonomy-actions";

const COPY: Record<TaxonomyKind, { singular: string; noun: string; newLabel: string }> = {
  category: { singular: "categoría", noun: "Categorías", newLabel: "Nueva categoría" },
  unit: { singular: "unidad", noun: "Unidades", newLabel: "Nueva unidad" },
};

/** Surfaces a finished action as a toast (the state object changes on every submission). */
function useToastOnResult(state: FormState) {
  useEffect(() => {
    if (state.success) toast.success(state.success);
    else if (state.error && !state.fieldErrors) toast.error(state.error);
  }, [state]);
}

function CreateForm({ kind }: { kind: TaxonomyKind }) {
  const [state, formAction, pending] = useActionState(createTaxonomyAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnResult(state);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid max-w-md gap-3" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <FormBanner error={state.fieldErrors ? state.error : undefined} />
      <FormField
        name="name"
        label={COPY[kind].newLabel}
        defaultValue={state.values?.name ?? ""}
        errors={state.fieldErrors?.name}
        autoComplete="off"
      />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creando..." : "Crear"}
      </Button>
    </form>
  );
}

function RenameForm({ kind, item }: { kind: TaxonomyKind; item: TaxonomyRecord }) {
  const [state, formAction, pending] = useActionState(renameTaxonomyAction, initialFormState);
  useToastOnResult(state);
  const error = state.fieldErrors?.name?.join(" ");

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={item.id} />
      <div className="grid gap-1">
        <input
          name="name"
          aria-label={`Nombre de ${item.name}`}
          defaultValue={state.values?.name ?? item.name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `rename-${item.id}-error` : undefined}
          className="border-input h-9 w-56 rounded-md border bg-transparent px-3 text-sm"
          autoComplete="off"
        />
        {error ? (
          <p id={`rename-${item.id}-error`} role="alert" className="text-destructive text-xs">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Renombrar ${item.name}`}>
        Renombrar
      </Button>
    </form>
  );
}

function ToggleActiveForm({ kind, item }: { kind: TaxonomyKind; item: TaxonomyRecord }) {
  const [state, formAction, pending] = useActionState(setTaxonomyActiveAction, initialFormState);
  useToastOnResult(state);
  return (
    <form action={formAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="active" value={String(!item.active)} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`${item.active ? "Desactivar" : "Activar"} ${item.name}`}>
        {item.active ? "Desactivar" : "Activar"}
      </Button>
    </form>
  );
}

function DeleteForm({ kind, item }: { kind: TaxonomyKind; item: TaxonomyRecord }) {
  const [state, formAction, pending] = useActionState(deleteTaxonomyAction, initialFormState);
  useToastOnResult(state);
  const inUse = item.productCount > 0;
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={item.id} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending || inUse}
        title={inUse ? "En uso: no se puede eliminar, desactivala." : undefined}
        aria-label={`Eliminar ${item.name}`}
      >
        Eliminar
      </Button>
    </form>
  );
}

export function TaxonomyAdmin({ kind, items }: { kind: TaxonomyKind; items: TaxonomyRecord[] }) {
  return (
    <div className="grid gap-6">
      <CreateForm kind={kind} />
      <Table framed>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Productos</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground text-center">
                Todavía no hay {COPY[kind].noun.toLowerCase()}.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <RenameForm kind={kind} item={item} />
                </TableCell>
                <TableCell>
                  <Badge variant={item.active ? "secondary" : "outline"}>{item.active ? "Activa" : "Inactiva"}</Badge>
                </TableCell>
                <TableCell>{item.productCount}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <ToggleActiveForm kind={kind} item={item} />
                    <DeleteForm kind={kind} item={item} />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
