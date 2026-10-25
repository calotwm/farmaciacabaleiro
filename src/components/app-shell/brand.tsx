import { Pill } from "lucide-react";

/** Pharmacy mark: red rounded square + name, shared by the sidebar and the mobile drawer. */
export function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl shadow-sm" aria-hidden="true">
        <Pill className="size-5" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Farmacia</p>
        <p className="text-primary text-sm font-semibold">Cabaleiro</p>
      </div>
    </div>
  );
}
