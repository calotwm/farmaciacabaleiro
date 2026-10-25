"use client";

import { useActionState, useMemo, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import { formatDate } from "@/shared/domain/dates";
import { isDomainError } from "@/shared/domain/errors";
import { type LotState, type LotStatus, effectiveLotStatus, isUsableForExit } from "../domain/lot";
import { planExit } from "../domain/movement-rules";
import {
  MOVEMENT_TYPE_LABELS,
  type ReasonKind,
  type RegistrableMovementType,
  reasonKindFor,
  requiresReason,
} from "../domain/movement-type";
import { registerMovementAction } from "./movement-actions";

export interface FormLot {
  id: string;
  lotNumber: string;
  expiryDate: string;
  /** ISO instant (serializable across the server/client boundary). */
  receivedAt: string;
  currentQuantity: number;
  blockedQuantity: number;
  status: LotStatus;
}

interface MovementFormProps {
  product: { id: string; name: string; available: number };
  today: string;
  /** Lots with units on hand, earliest expiry first. */
  lots: FormLot[];
  reasons: Record<ReasonKind, Array<{ id: string; name: string }>>;
  suppliers: SelectOption[];
  allowedTypes: RegistrableMovementType[];
  initialType: RegistrableMovementType;
  initialLotId?: string;
}

const STATUS_TEXT: Partial<Record<LotStatus, string>> = {
  EXPIRED: "vencido",
  QUARANTINE: "cuarentena",
  BLOCKED: "bloqueado",
  DEPLETED: "agotado",
};

const BLOCK_MODES: SelectOption[] = [
  { value: "UNITS", label: "Algunas unidades" },
  { value: "QUARANTINE", label: "Todo el lote en cuarentena" },
  { value: "BLOCKED", label: "Todo el lote bloqueado" },
];
const UNBLOCK_MODES: SelectOption[] = [
  { value: "UNITS", label: "Algunas unidades" },
  { value: "LOT", label: "Todo el lote (vuelve a estar disponible)" },
];

function toLotState(lot: FormLot, productId: string): LotState {
  return { ...lot, productId, receivedAt: new Date(lot.receivedAt) };
}

function lotLabel(lot: FormLot, today: string): string {
  const status = STATUS_TEXT[effectiveLotStatus(lot, today)];
  return `${lot.lotNumber} · vence ${formatDate(lot.expiryDate)} · ${lot.currentQuantity} u.${status ? ` · ${status}` : ""}`;
}

/** The Spanish message of a domain error (what the server would answer), for the live preview. */
function previewMessage(error: unknown): string {
  if (isDomainError(error)) {
    const fieldErrors = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
    return error.userMessage ?? Object.values(fieldErrors).flat()[0] ?? "No se puede registrar esa salida.";
  }
  return "No se puede registrar esa salida.";
}

/**
 * "Nuevo movimiento": type -> quantity -> (exit) FEFO suggestion -> reason when required -> confirm.
 * The preview runs the same pure FEFO planner the server runs, but the server decides.
 */
export function MovementForm({ product, today, lots, reasons, suppliers, allowedTypes, initialType, initialLotId }: MovementFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(registerMovementAction, initialFormState);
  const [type, setType] = useState<RegistrableMovementType>(initialType);
  const [quantity, setQuantity] = useState("");
  const [lotId, setLotId] = useState(initialLotId ?? "");
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const value = (name: string) => values[name] ?? "";

  const lotStates = useMemo(() => lots.map((lot) => toLotState(lot, product.id)), [lots, product.id]);

  const exitPreview = useMemo(() => {
    if (type !== "EXIT") return null;
    const count = Number(quantity);
    if (!/^\d+$/.test(quantity.trim()) || count < 1) return null;
    try {
      const plan = planExit(lotStates, count, today, lotId || null);
      return {
        lines: plan.movements.map((movement) => {
          const lot = lots.find((candidate) => candidate.id === movement.lotId);
          return { id: movement.lotId, text: `${movement.quantity} u. del lote ${lot?.lotNumber ?? ""} (vence ${lot ? formatDate(lot.expiryDate) : ""})` };
        }),
        error: null,
      };
    } catch (error) {
      return { lines: [], error: previewMessage(error) };
    }
  }, [type, quantity, lotId, lotStates, lots, today]);

  const reasonKind = reasonKindFor(type);
  const reasonRequired = requiresReason(type);
  const needsLot = type !== "ENTRY" && type !== "EXIT";
  const lotOptions: SelectOption[] = (type === "EXIT" ? lots.filter((lot) => isUsableForExit(lot, today)) : lots).map((lot) => ({
    value: lot.id,
    label: lotLabel(lot, today),
  }));

  function changeType(next: RegistrableMovementType) {
    setType(next);
    // A lot that cannot be dispensed from must not stay selected when switching to a normal exit.
    const keep = next !== "EXIT" || lots.some((lot) => lot.id === lotId && isUsableForExit(lot, today));
    setLotId(keep ? lotId : "");
  }

  return (
    <form action={formAction} className="grid max-w-3xl gap-6" noValidate>
      <FormBanner error={state.error} />
      <input type="hidden" name="productId" value={product.id} />
      {errors.productId ? (
        <p role="alert" className="text-destructive text-sm">
          {errors.productId.join(" ")}
        </p>
      ) : null}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Tipo de movimiento</legend>
        <div className="flex flex-wrap gap-2">
          {allowedTypes.map((option) => (
            <label
              key={option}
              className="has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring/50 flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm has-[:focus-visible]:ring-[3px]"
            >
              <input
                type="radio"
                name="type"
                value={option}
                checked={type === option}
                onChange={() => changeType(option)}
                className="sr-only"
              />
              {MOVEMENT_TYPE_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      {type === "ENTRY" ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-lg font-medium">Datos del lote</legend>
          <FormField name="lotNumber" label="Número de lote" defaultValue={value("lotNumber")} errors={errors.lotNumber} required autoFocus />
          <FormField
            name="expiryDate"
            label="Vencimiento"
            defaultValue={value("expiryDate")}
            errors={errors.expiryDate}
            placeholder="DD/MM/AAAA o MM/AAAA"
            hint="Con MM/AAAA vale hasta el último día del mes."
            inputMode="numeric"
            required
          />
          <FormField name="quantity" label="Cantidad" value={quantity} onChange={(event) => setQuantity(event.target.value)} errors={errors.quantity} inputMode="numeric" required />
          <FormField name="unitCost" label="Costo unitario (ARS)" defaultValue={value("unitCost")} errors={errors.unitCost} inputMode="decimal" />
          <SelectField name="supplierId" label="Proveedor" options={suppliers} placeholder="Sin proveedor" defaultValue={value("supplierId")} errors={errors.supplierId} />
          <FormField name="invoiceNumber" label="Factura" defaultValue={value("invoiceNumber")} errors={errors.invoiceNumber} />
          <FormField name="location" label="Ubicación" defaultValue={value("location")} errors={errors.location} />
          <FormField name="notes" label="Notas" defaultValue={value("notes")} errors={errors.notes} />
        </fieldset>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="lotId"
            label={type === "EXIT" ? "Lote (opcional)" : "Lote"}
            options={lotOptions}
            placeholder={type === "EXIT" ? "Automático: el que vence primero" : "Elegí un lote"}
            value={lotId}
            onChange={(event) => setLotId(event.target.value)}
            errors={errors.lotId}
            required={needsLot}
            hint={type === "EXIT" ? "Por defecto se descuenta del lote que vence primero (FEFO)." : undefined}
          />
          {type === "BLOCK" || type === "UNBLOCK" ? (
            <SelectField
              name="mode"
              label="Qué se mueve"
              options={type === "BLOCK" ? BLOCK_MODES : UNBLOCK_MODES}
              defaultValue={value("mode") || "UNITS"}
              errors={errors.mode}
            />
          ) : null}
          <FormField
            name="quantity"
            label="Cantidad"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            errors={errors.quantity}
            inputMode="numeric"
            hint={type === "BLOCK" || type === "UNBLOCK" ? "Solo si elegís algunas unidades." : undefined}
            required={type !== "BLOCK" && type !== "UNBLOCK"}
            autoFocus={type === "EXIT"}
          />
        </div>
      )}

      {type === "EXIT" ? (
        <div role="status" aria-live="polite" className="rounded-md border p-3 text-sm">
          <p className="font-medium">Sugerencia FEFO (se aplica al confirmar)</p>
          {exitPreview === null ? (
            <p className="text-muted-foreground">Ingresá la cantidad para ver de qué lotes se descuenta. Disponible: {product.available}.</p>
          ) : exitPreview.error ? (
            <p className="text-destructive">{exitPreview.error}</p>
          ) : (
            <ul className="list-disc pl-5">
              {exitPreview.lines.map((line) => (
                <li key={line.id}>{line.text}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {reasonKind ? (
        <SelectField
          name="reasonId"
          label={reasonRequired ? "Motivo" : "Motivo (opcional)"}
          options={reasons[reasonKind].map((reason) => ({ value: reason.id, label: reason.name }))}
          placeholder="Elegí un motivo"
          defaultValue={value("reasonId")}
          errors={errors.reasonId}
          required={reasonRequired}
        />
      ) : null}
      {type !== "ENTRY" ? (
        <div className="grid gap-2">
          <Label htmlFor="reasonText">{reasonRequired ? "Detalle del motivo" : "Detalle (opcional)"}</Label>
          <Textarea id="reasonText" name="reasonText" defaultValue={value("reasonText")} aria-invalid={errors.reasonText ? true : undefined} />
          {errors.reasonText ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.reasonText.join(" ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando..." : "Registrar movimiento"}
        </Button>
        <p className="text-muted-foreground text-sm">Los movimientos no se pueden editar ni borrar: un error se corrige con otro movimiento.</p>
      </div>
    </form>
  );
}
