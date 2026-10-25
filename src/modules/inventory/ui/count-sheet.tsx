"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarcodeInput } from "@/components/barcode-input";
import { FormBanner } from "@/components/form-banner";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import { formatDate } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import type { CountLineView } from "../application/ports";
import { effectiveLotStatus } from "../domain/lot";
import { provisionalDifference, summarizeCount } from "../domain/stock-count";
import { closeCountAction, saveCountAction } from "./count-actions";

interface CountSheetProps {
  countId: string;
  lines: CountLineView[];
  today: string;
  reasons: SelectOption[];
  /** Closing adjusts stock, so it needs the write permission on top of the count one. */
  canClose: boolean;
}

function formatDifference(difference: number | null): string {
  if (difference === null) return "-";
  return difference > 0 ? `+${difference}` : String(difference);
}

/** What a line counts as: blank or non-numeric text is "not counted yet". */
function parseCounted(text: string | undefined): number | null {
  const trimmed = (text ?? "").trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

const inputValue = (line: CountLineView) => (line.countedQuantity === null ? "" : String(line.countedQuantity));

/** Open count: enter what is on the shelf per lot, see differences live, save, and close with a reason. */
export function CountSheet({ countId, lines, today, reasons, canClose }: CountSheetProps) {
  const [saveState, saveAction, saving] = useActionState<FormState, FormData>(saveCountAction, initialFormState);
  const [closeState, closeAction, closing] = useActionState<FormState, FormData>(closeCountAction, initialFormState);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((line) => [line.lotId, inputValue(line)])));
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    if (saveState.success) toast.success(saveState.success);
  }, [saveState]);

  const summary = useMemo(
    () => summarizeCount(lines.map((line) => ({ expectedQuantity: line.expectedQuantity, countedQuantity: parseCounted(values[line.lotId]) }))),
    [lines, values],
  );
  const dirty = lines.some((line) => (values[line.lotId] ?? "").trim() !== inputValue(line));
  const saveErrors = saveState.fieldErrors ?? {};
  const closeErrors = closeState.fieldErrors ?? {};

  function jumpTo(code: string) {
    const matches = lines.filter((line) => line.barcode === code || line.sku === code || line.productCode === code);
    if (matches.length === 0) {
      setHighlight(null);
      setScanMessage(`El código ${code} no corresponde a ningún producto de este conteo.`);
      return;
    }
    setHighlight(matches[0].productId);
    setScanMessage(`${matches[0].productName}: ${matches.length === 1 ? "1 lote" : `${matches.length} lotes`} para contar.`);
    document.getElementById(`counted-${matches[0].lotId}`)?.focus();
  }

  return (
    <div className="grid gap-8">
      <form action={saveAction} className="grid gap-4" noValidate aria-label="Cantidades contadas">
        <input type="hidden" name="countId" value={countId} />
        <FormBanner error={saveState.error} />
        <div className="max-w-xl">
          <BarcodeInput
            name="scan"
            label="Ir a un producto"
            placeholder="Escaneá el código de barras"
            hint="Con el lector, el Enter lleva el cursor al lote del producto."
            onScan={jumpTo}
          />
          {scanMessage ? (
            <p role="status" className="mt-2 text-sm">
              {scanMessage}
            </p>
          ) : null}
        </div>

        <Table>
          <caption className="sr-only">Lotes del conteo con la cantidad esperada, la contada y la diferencia</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Esperado</TableHead>
              <TableHead>Contado</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const difference = provisionalDifference(line.expectedQuantity, parseCounted(values[line.lotId]));
              const error = saveErrors[`counted:${line.lotId}`]?.join(" ");
              const expired = effectiveLotStatus({ expiryDate: line.expiryDate, status: line.lotStatus }, today) === "EXPIRED";
              return (
                <TableRow key={line.id} className={cn(highlight === line.productId && "bg-accent/50")}>
                  <TableCell className="font-medium">
                    <Link href={`/productos/${line.productId}`} className="underline-offset-4 hover:underline">
                      {line.productName}
                    </Link>
                  </TableCell>
                  <TableCell>{line.lotNumber}</TableCell>
                  <TableCell>
                    {formatDate(line.expiryDate)} {expired ? <Badge variant="outline">Vencido</Badge> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.expectedQuantity}
                    {line.currentQuantity !== line.expectedQuantity ? (
                      <span className="text-muted-foreground block text-xs">Ahora: {line.currentQuantity}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <input
                      id={`counted-${line.lotId}`}
                      name={`counted:${line.lotId}`}
                      value={values[line.lotId] ?? ""}
                      onChange={(event) => setValues((current) => ({ ...current, [line.lotId]: event.target.value }))}
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={`Cantidad contada de ${line.productName}, lote ${line.lotNumber}`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `counted-${line.lotId}-error` : undefined}
                      className="border-input h-9 w-24 rounded-md border bg-transparent px-3 text-sm tabular-nums"
                    />
                    {error ? (
                      <p id={`counted-${line.lotId}-error`} role="alert" className="text-destructive text-xs">
                        {error}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      difference !== null && difference < 0 && "text-destructive",
                      difference !== null && difference > 0 && "text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {formatDifference(difference)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? "Guardando..." : "Guardar conteo"}
          </Button>
          <p role="status" className="text-sm" data-testid="count-summary">
            {summary.counted} de {summary.total} lotes contados · {summary.withDifference} con diferencias (+{summary.unitsOver} / -
            {summary.unitsShort} unidades)
          </p>
        </div>
      </form>

      {canClose ? (
        <form
          action={closeAction}
          className="grid max-w-xl gap-4 rounded-md border p-4"
          noValidate
          aria-label="Cerrar el conteo"
          onSubmit={(event) => {
            const message = `Se ajustará el stock de los lotes con diferencias (${summary.withDifference}) y el conteo quedará cerrado. No se puede deshacer. ¿Cerrar el conteo?`;
            if (dirty || !window.confirm(message)) event.preventDefault();
          }}
        >
          <h2 className="text-lg font-medium">Cerrar el conteo</h2>
          <p className="text-muted-foreground text-sm">
            Se crean movimientos de corrección por cada diferencia. Los lotes sin contar quedan como están.
          </p>
          <FormBanner error={closeState.error} />
          <input type="hidden" name="countId" value={countId} />
          <SelectField
            name="reasonId"
            label="Motivo"
            options={reasons}
            placeholder="Elegí un motivo"
            defaultValue={closeState.values?.reasonId ?? ""}
            errors={closeErrors.reasonId}
            required
          />
          <div className="grid gap-2">
            <Label htmlFor="reasonText">Detalle del motivo</Label>
            <Textarea id="reasonText" name="reasonText" defaultValue={closeState.values?.reasonText ?? ""} />
          </div>
          {dirty ? (
            <p role="status" className="text-sm">
              Hay cantidades sin guardar: guardá el conteo antes de cerrarlo.
            </p>
          ) : null}
          <Button type="submit" disabled={closing || dirty} className="w-fit">
            {closing ? "Cerrando..." : "Cerrar conteo"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
