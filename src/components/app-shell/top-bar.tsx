"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Title of the current section (the nav item whose route matches), shown in the top bar. */
export function TopBarTitle({ firstName }: { firstName: string }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.filter((item) => isActive(pathname, item.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate text-sm font-semibold md:text-base">{current?.href === "/" ? "Panel" : (current?.label ?? "Farmacia Cabaleiro")}</p>
      <p className="text-muted-foreground hidden truncate text-xs sm:block">Hola, {firstName}</p>
    </div>
  );
}

/** Product search: a plain GET form to the products list (`?q=`). */
export function TopBarSearch() {
  return (
    <form action="/productos" role="search" className="relative hidden w-full max-w-xs sm:block lg:max-w-sm">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
      <input
        type="search"
        name="q"
        aria-label="Buscar productos"
        placeholder="Buscar productos…"
        className="bg-card placeholder:text-muted-foreground focus-visible:ring-ring/40 border-input h-9 w-full rounded-md border pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
      />
    </form>
  );
}
