"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setSupplierActiveAction } from "./supplier-actions";

interface ToggleActiveButtonProps {
  supplierId: string;
  supplierName: string;
  active: boolean;
}

export function ToggleActiveButton({ supplierId, supplierName, active }: ToggleActiveButtonProps) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (active && !window.confirm(`¿Desactivar a "${supplierName}"? No se podrán programar entregas nuevas, pero el historial se conserva.`)) return;
    startTransition(async () => {
      const result = await setSupplierActiveAction(supplierId, !active);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  return (
    <Button type="button" variant={active ? "outline" : "default"} onClick={onClick} disabled={pending}>
      {active ? "Desactivar" : "Activar"}
    </Button>
  );
}
