import type { ReactNode } from "react";

/** Page title block: title, one-line description and the page's primary actions, aligned on a thin rule. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b pb-4">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description ? <p className="text-muted-foreground max-w-2xl text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
