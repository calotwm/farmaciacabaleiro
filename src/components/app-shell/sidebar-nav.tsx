"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Discreet nav: muted icons and labels; the active item gets graphite text and a thin red bar on its left edge. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="grid gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[0.8125rem] outline-none transition-colors focus-visible:ring-2",
              active
                ? "text-foreground bg-muted font-semibold before:bg-primary before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground font-medium",
            )}
          >
            <Icon className={cn("size-4", active && "text-primary")} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
