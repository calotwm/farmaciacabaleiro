"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

export interface SettingsNavItem {
  href: string;
  label: string;
}

/** Section switcher: a vertical list on desktop, a horizontally scrollable row on small screens. */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de configuración" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 md:grid">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring relative block rounded-md px-3 py-2 text-[0.8125rem] whitespace-nowrap outline-none transition-colors focus-visible:ring-2",
                  active
                    ? "text-foreground bg-muted font-semibold before:bg-primary before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground font-medium",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
