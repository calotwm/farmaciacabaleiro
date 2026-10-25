import type { ReactNode } from "react";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

/** Presentational shell: sidebar on desktop, drawer on mobile, user menu in the header. */
export function AppShell({ userName, roleLabel, children }: { userName: string; roleLabel: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="bg-card hidden w-64 shrink-0 border-r p-4 md:block">
        <p className="mb-6 px-3 text-lg font-semibold">Farmacia Cabaleiro</p>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card flex h-14 items-center justify-between gap-2 border-b px-4">
          <MobileNav />
          <div className="ml-auto">
            <UserMenu name={userName} roleLabel={roleLabel} />
          </div>
        </header>
        <main id="contenido" className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
