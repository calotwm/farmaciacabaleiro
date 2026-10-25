"use client";

import { Button } from "@/components/ui/button";

/** Last-resort boundary for the signed-in app: keeps the shell and offers a retry. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="bg-card grid max-w-xl gap-3 rounded-xl border p-6">
      <h1 className="text-lg font-semibold">No se pudo cargar esta página</h1>
      <p className="text-muted-foreground text-sm">Ocurrió un error inesperado. Probá de nuevo; si persiste, avisá al administrador.</p>
      <div>
        <Button onClick={reset} variant="outline">
          Reintentar
        </Button>
      </div>
    </div>
  );
}
