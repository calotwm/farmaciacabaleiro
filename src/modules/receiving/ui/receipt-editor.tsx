"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ProductPicker } from "@/modules/catalog/ui/product-picker";
import type { ProductHit } from "@/modules/catalog/ui/product-search-actions";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import { formatDate } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import type { ExpectedProductView, ReceiptIssueRecord, ReceiptLineRecord } from "../application/ports";
import {
  ISSUE_TYPE_LABELS,
  MANUAL_ISSUE_TYPES,
  type RawReceiptLine,
  compareWithExpected,
  goodQuantity,
  normalizeReceiptLines,
  proposeIssues,
} from "../domain/receipt";
import { discardReceiptAction, saveReceiptAction } from "./receipt-actions";

interface ReceiptEditorProps {
  receipt: {
    id: string;
    idempotencyKey: string;
    supplierName: string;
    /** Set when the receipt comes from a scheduled delivery (enables the partial flag). */
    deliveryId: string | null;
    deliveryLabel: string | null;
    invoiceNumber: string | null;
    notes: string | null;
    isPartial: boolean;
    lines: ReceiptLineRecord[];
    manualIssues: ReceiptIssueRecord[];
  };
  expected: ExpectedProductView[];
}

interface EditorLine extends RawReceiptLine {
  key: string;
  name: string;
  code: string;
}

interface EditorIssue {
  key: string;
  type: string;
  productId: string;
  quantity: string;
  description: string;
}

const ISSUE_TYPE_OPTIONS: SelectOption[] = MANUAL_ISSUE_TYPES.map((type) => ({ value: type, label: ISSUE_TYPE_LABELS[type] }));

const INPUT_CLASS = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm tabular-nums";

/** "2033-03-31" -> "31/03/2033" for the expiry cell of a saved line. */
const expiryText = (date: string) => formatDate(date);

function toEditorLine(line: ReceiptLineRecord): EditorLine {
  return {
    key: line.id,
    productId: line.productId,
    name: line.productName,
    code: line.productCode,
    lotNumber: line.lotNumber,
    expiry: expiryText(line.expiryDate),
    quantity: String(line.quantity),
    damagedQuantity: line.damagedQuantity === 0 ? "" : String(line.damagedQuantity),
    unitCost: line.unitCost === "0.00" ? "" : line.unitCost,
  };
}

const blankLine = (product: { id: string; name: string; code: string }): EditorLine => ({
  key: crypto.randomUUID(),
  productId: product.id,
  name: product.name,
  code: product.code,
  lotNumber: "",
  expiry: "",
  quantity: "",
  damagedQuantity: "",
  unitCost: "",
});

/** What the server receives: only the fields it validates (the names are for display). */
function serializeLines(lines: readonly EditorLine[]): string {
  return JSON.stringify(lines.map(({ productId, lotNumber, expiry, quantity, damagedQuantity, unitCost }) => ({ productId, lotNumber, expiry, quantity, damagedQuantity, unitCost })));
}

/**
 * Receipt editor: scan or search products, enter one line per lot, see what was expected against what arrived
 * (the same pure comparison the server runs on confirm), add manual issues, save the draft or confirm.
 */
export function ReceiptEditor({ receipt, expected }: ReceiptEditorProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveReceiptAction, initialFormState);
  const [discardState, discardAction, discarding] = useActionState<FormState, FormData>(discardReceiptAction, initialFormState);
  const [lines, setLines] = useState<EditorLine[]>(() => receipt.lines.map(toEditorLine));
  const [issues, setIssues] = useState<EditorIssue[]>(() =>
    receipt.manualIssues.map((issue) => ({
      key: issue.id,
      type: issue.type,
      productId: issue.productId ?? "",
      quantity: issue.quantity === null ? "" : String(issue.quantity),
      description: issue.description ?? "",
    })),
  );
  const [invoiceNumber, setInvoiceNumber] = useState(receipt.invoiceNumber ?? "");
  const [notes, setNotes] = useState(receipt.notes ?? "");
  const [isPartial, setIsPartial] = useState(receipt.isPartial);
  const [message, setMessage] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  // Focus the lot field of a line that was just added (it exists in the DOM only after the render).
  useEffect(() => {
    if (focusKey) document.getElementById(`line-${focusKey}-lot`)?.focus();
  }, [focusKey]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of expected) map.set(item.productId, item.productName);
    for (const line of lines) map.set(line.productId, line.name);
    return map;
  }, [expected, lines]);

  const comparison = useMemo(() => {
    const valid = normalizeReceiptLines(lines).lines;
    const pendingExpected = expected.filter((item) => item.pending > 0).map((item) => ({ productId: item.productId, expectedQuantity: item.pending }));
    const rows = compareWithExpected(pendingExpected, valid);
    return { rows, proposed: proposeIssues(rows, { isPartial }), hasExpected: pendingExpected.length > 0, totalGood: valid.reduce((sum, line) => sum + goodQuantity(line), 0) };
  }, [lines, expected, isPartial]);

  function focusLine(key: string) {
    setFocusKey(null);
    // A fresh tick lets the same key be focused twice in a row.
    setTimeout(() => setFocusKey(key), 0);
  }

  function addProduct(product: ProductHit) {
    const existing = lines.find((line) => line.productId === product.id);
    if (existing) {
      setMessage(`${product.name} ya está en la lista: completá ese lote o agregá otro con "Otro lote".`);
      focusLine(existing.key);
      return;
    }
    const line = blankLine(product);
    setLines((current) => [...current, line]);
    setMessage(`${product.name} agregado: completá el lote.`);
    focusLine(line.key);
  }

  function addLot(source: { productId: string; name: string; code: string }) {
    const line = blankLine({ id: source.productId, name: source.name, code: source.code });
    setLines((current) => {
      const lastOfProduct = current.map((item) => item.productId).lastIndexOf(source.productId);
      return lastOfProduct === -1 ? [...current, line] : [...current.slice(0, lastOfProduct + 1), line, ...current.slice(lastOfProduct + 1)];
    });
    setMessage(null);
    focusLine(line.key);
  }

  const updateLine = (key: string, changes: Partial<EditorLine>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...changes } : line)));
  const updateIssue = (key: string, changes: Partial<EditorIssue>) => setIssues((current) => current.map((issue) => (issue.key === key ? { ...issue, ...changes } : issue)));

  const productOptions: SelectOption[] = [...names].map(([value, label]) => ({ value, label }));
  const unscannedExpected = expected.filter((item) => item.pending > 0 && !lines.some((line) => line.productId === item.productId));

  return (
    <div className="grid gap-8">
      <form action={formAction} className="grid gap-6" noValidate aria-label="Recepción de mercadería">
        <FormBanner error={state.error} />
        <input type="hidden" name="id" value={receipt.id} />
        <input type="hidden" name="idempotencyKey" value={receipt.idempotencyKey} />
        <input type="hidden" name="lines" value={serializeLines(lines)} />
        <input
          type="hidden"
          name="issues"
          value={JSON.stringify(issues.map(({ type, productId, quantity, description }) => ({ type, productId, quantity, description })))}
        />

        <section aria-labelledby="receipt-lines-title" className="grid gap-4">
          <h2 id="receipt-lines-title" className="text-lg font-medium">
            Productos recibidos
          </h2>
          <div className="max-w-xl">
            <ProductPicker
              label="Escanear o buscar producto"
              onSelect={addProduct}
              hint="Con el lector, el Enter agrega el producto. Si ya está en la lista, lleva el cursor a su lote."
              inputId="receipt-product-search"
              autoFocus
            />
            {message ? (
              <p role="status" className="mt-2 text-sm">
                {message}
              </p>
            ) : null}
          </div>

          {errors.lines ? (
            <ul role="alert" className="text-destructive grid gap-1 text-sm">
              {errors.lines.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          {lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no hay productos: escaneá o buscá el primero.</p>
          ) : (
            <Table>
              <caption className="sr-only">Un renglón por lote recibido</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Dañadas</TableHead>
                  <TableHead>Costo unitario</TableHead>
                  <TableHead>
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => {
                  const label = `${line.name}, línea ${index + 1}`;
                  return (
                    <TableRow key={line.key}>
                      <TableCell className="font-medium">
                        {line.name}
                        <span className="text-muted-foreground block text-xs">{line.code}</span>
                      </TableCell>
                      <TableCell>
                        <input
                          id={`line-${line.key}-lot`}
                          value={line.lotNumber}
                          onChange={(event) => updateLine(line.key, { lotNumber: event.target.value })}
                          autoComplete="off"
                          aria-label={`Lote de ${label}`}
                          className={cn(INPUT_CLASS, "w-32")}
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          value={line.expiry}
                          onChange={(event) => updateLine(line.key, { expiry: event.target.value })}
                          placeholder="DD/MM/AAAA o MM/AAAA"
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label={`Vencimiento de ${label}`}
                          className={cn(INPUT_CLASS, "w-44")}
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          value={line.quantity}
                          onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label={`Cantidad recibida de ${label}`}
                          className={cn(INPUT_CLASS, "w-24")}
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          value={line.damagedQuantity}
                          onChange={(event) => updateLine(line.key, { damagedQuantity: event.target.value })}
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label={`Unidades dañadas de ${label}`}
                          className={cn(INPUT_CLASS, "w-24")}
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          value={line.unitCost}
                          onChange={(event) => updateLine(line.key, { unitCost: event.target.value })}
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`Costo unitario de ${label}`}
                          className={cn(INPUT_CLASS, "w-28")}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => addLot(line)} aria-label={`Agregar otro lote de ${line.name}`}>
                            Otro lote
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                            aria-label={`Quitar ${label}`}
                          >
                            Quitar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <p className="text-muted-foreground text-sm">Las unidades dañadas no se ingresan al stock: quedan registradas como problema.</p>
        </section>

        <section aria-labelledby="receipt-comparison-title" className="grid gap-3">
          <h2 id="receipt-comparison-title" className="text-lg font-medium">
            {comparison.hasExpected ? "Esperado contra recibido" : "Resumen por producto"}
          </h2>
          {unscannedExpected.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Productos esperados que todavía no cargaste</p>
              <ul className="flex flex-wrap gap-2" aria-label="Productos esperados sin cargar">
                {unscannedExpected.map((item) => (
                  <li key={item.productId}>
                    <Button type="button" variant="outline" size="sm" onClick={() => addLot({ productId: item.productId, name: item.productName, code: item.productCode })}>
                      {item.productName} ({item.pending} {item.unitName.toLowerCase()})
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {comparison.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Cuando cargues productos vas a ver acá la comparación con lo esperado.</p>
          ) : (
            <Table data-testid="receipt-comparison">
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  {comparison.hasExpected ? <TableHead className="text-right">Esperado</TableHead> : null}
                  <TableHead className="text-right">Recibido</TableHead>
                  <TableHead className="text-right">Buenas</TableHead>
                  <TableHead className="text-right">Dañadas</TableHead>
                  {comparison.hasExpected ? <TableHead className="text-right">Diferencia</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.rows.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell className="font-medium">{names.get(row.productId) ?? "Producto"}</TableCell>
                    {comparison.hasExpected ? <TableCell className="text-right tabular-nums">{row.expected}</TableCell> : null}
                    <TableCell className="text-right tabular-nums">{row.received}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.good}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.damaged}</TableCell>
                    {comparison.hasExpected ? (
                      <TableCell className={cn("text-right tabular-nums", row.difference !== null && row.difference !== 0 && "text-destructive")}>
                        {row.difference === null ? "-" : row.difference > 0 ? `+${row.difference}` : row.difference}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {expected.some((item) => item.alreadyReceived > 0) ? (
            <p className="text-muted-foreground text-sm">Lo esperado ya descuenta lo recibido en recepciones anteriores de esta entrega.</p>
          ) : null}
          {comparison.proposed.length > 0 ? (
            <div role="status" aria-live="polite" className="rounded-md border p-3 text-sm" data-testid="proposed-issues">
              <p className="font-medium">Problemas que se registrarán al confirmar</p>
              <ul className="list-disc pl-5">
                {comparison.proposed.map((issue) => (
                  <li key={`${issue.type}-${issue.productId}`}>
                    {ISSUE_TYPE_LABELS[issue.type]}: {names.get(issue.productId) ?? "producto"} ({issue.quantity})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="receipt-issues-title" className="grid gap-3">
          <h2 id="receipt-issues-title" className="text-lg font-medium">
            Otros problemas
          </h2>
          {errors.issues ? (
            <ul role="alert" className="text-destructive grid gap-1 text-sm">
              {errors.issues.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {issues.map((issue, index) => (
            <div key={issue.key} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                name={`issue-type-${issue.key}`}
                label={`Tipo (problema ${index + 1})`}
                options={ISSUE_TYPE_OPTIONS}
                value={issue.type}
                onChange={(event) => updateIssue(issue.key, { type: event.target.value })}
              />
              <SelectField
                name={`issue-product-${issue.key}`}
                label="Producto (opcional)"
                options={productOptions}
                placeholder="Ninguno"
                value={issue.productId}
                onChange={(event) => updateIssue(issue.key, { productId: event.target.value })}
              />
              <FormField
                name={`issue-quantity-${issue.key}`}
                label="Cantidad (opcional)"
                value={issue.quantity}
                onChange={(event) => updateIssue(issue.key, { quantity: event.target.value })}
                inputMode="numeric"
              />
              <FormField
                name={`issue-description-${issue.key}`}
                label="Descripción"
                value={issue.description}
                onChange={(event) => updateIssue(issue.key, { description: event.target.value })}
              />
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setIssues((current) => current.filter((item) => item.key !== issue.key))}>
                Quitar problema {index + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => setIssues((current) => [...current, { key: crypto.randomUUID(), type: "OTHER", productId: "", quantity: "", description: "" }])}
          >
            Agregar problema
          </Button>
        </section>

        <section aria-labelledby="receipt-data-title" className="grid max-w-3xl gap-4">
          <h2 id="receipt-data-title" className="text-lg font-medium">
            Datos del comprobante
          </h2>
          <FormField
            name="invoiceNumber"
            label="Factura o remito"
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            errors={errors.invoiceNumber}
          />
          <div className="grid gap-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} aria-invalid={errors.notes ? true : undefined} />
            {errors.notes ? (
              <p role="alert" className="text-destructive text-sm">
                {errors.notes.join(" ")}
              </p>
            ) : null}
          </div>
          {receipt.deliveryId ? (
            <div className="grid gap-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isPartial" checked={isPartial} onChange={(event) => setIsPartial(event.target.checked)} className="size-4" />
                Recepción parcial: el resto de la entrega llega más adelante
              </label>
              <p className="text-muted-foreground text-xs">
                {isPartial ? "La entrega queda confirmada y abierta para lo que falta; no se registra faltante todavía." : "Al confirmar, la entrega queda recibida y lo que falte se registra como faltante."}
              </p>
              {errors.isPartial ? (
                <p role="alert" className="text-destructive text-sm">
                  {errors.isPartial.join(" ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" name="intent" value="confirm" disabled={pending || discarding} onClick={(event) => {
            const units = comparison.totalGood;
            const text = `Se ingresarán ${units} ${units === 1 ? "unidad" : "unidades"} al stock y la recepción quedará confirmada. No se puede deshacer. ¿Confirmar la recepción?`;
            if (!window.confirm(text)) event.preventDefault();
          }}>
            {pending ? "Procesando..." : "Confirmar recepción"}
          </Button>
          <Button type="submit" name="intent" value="save" variant="outline" disabled={pending || discarding}>
            Guardar borrador
          </Button>
        </div>
      </form>

      <form
        action={discardAction}
        className="grid max-w-xl gap-2"
        aria-label="Descartar el borrador"
        onSubmit={(event) => {
          if (!window.confirm("¿Descartar este borrador? Se pierden los datos cargados.")) event.preventDefault();
        }}
      >
        <FormBanner error={discardState.error} />
        <input type="hidden" name="id" value={receipt.id} />
        <Button type="submit" variant="outline" className="w-fit" disabled={pending || discarding}>
          Descartar borrador
        </Button>
      </form>
    </div>
  );
}
