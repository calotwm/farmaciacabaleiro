import { Cross } from "lucide-react";

/** Wordmark: the pharmacy cross in red next to a two-line name; shared by the sidebar and the mobile drawer. */
export function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <Cross className="text-primary size-6 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      <div className="leading-tight">
        <p className="text-[0.8125rem] font-semibold tracking-tight">Farmacia Cabaleiro</p>
        <p className="text-muted-foreground text-[0.6875rem] tracking-wide uppercase">Gestión de stock</p>
      </div>
    </div>
  );
}
