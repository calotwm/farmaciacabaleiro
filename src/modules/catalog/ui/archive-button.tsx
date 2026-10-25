"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setProductArchivedAction } from "./product-actions";

interface ArchiveButtonProps {
  productId: string;
  productName: string;
  archived: boolean;
}

export function ArchiveButton({ productId, productName, archived }: ArchiveButtonProps) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!archived && !window.confirm(`¿Archivar "${productName}"? Dejará de aparecer en las listas por defecto.`)) return;
    startTransition(async () => {
      const result = await setProductArchivedAction(productId, !archived);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  return (
    <Button type="button" variant={archived ? "default" : "outline"} onClick={onClick} disabled={pending}>
      {archived ? "Desarchivar" : "Archivar"}
    </Button>
  );
}
