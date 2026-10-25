import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** Bordered section with a ruled header (title, optional count and a "see all" link). Shared by the dashboard lists. */
export function Panel({
  id,
  title,
  count,
  href,
  hrefLabel = "Ver todos",
  children,
  className,
}: {
  id: string;
  title: string;
  /** Total behind the list, shown next to the title. */
  count?: number;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("bg-card grid content-start overflow-hidden rounded-xl border", className)}>
      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <h2 id={id} className="text-sm font-semibold">
          {title}
          {count !== undefined ? <span className="text-muted-foreground ml-2 font-normal tabular-nums">{count.toLocaleString("es-AR")}</span> : null}
        </h2>
        {href ? (
          <Link href={href} className="text-primary text-xs font-medium underline-offset-4 hover:underline">
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Quiet empty/ok message inside a panel. */
export function PanelMessage({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" }) {
  return <p className={cn("px-4 py-6 text-sm", tone === "ok" ? "text-success-soft-foreground" : "text-muted-foreground")}>{children}</p>;
}
