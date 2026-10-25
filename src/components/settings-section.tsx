import type { ReactNode } from "react";

/** Heading block of one Configuración section (the page itself carries the single h1). */
export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="settings-section-title" className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-2xl gap-1">
          <h2 id="settings-section-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
