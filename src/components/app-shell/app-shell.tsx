import type { ReactNode } from "react";
import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { TopBarSearch, TopBarTitle } from "./top-bar";
import { UserMenu } from "./user-menu";

/**
 * Presentational shell: white sidebar (brand, nav, user block) on desktop, drawer on mobile, and a top bar
 * with the section title, greeting, search and notification bell over a soft gray canvas.
 */
export function AppShell({
  userName,
  roleLabel,
  bell,
  children,
}: {
  userName: string;
  roleLabel: string;
  /** Notification bell (server-rendered by the layout). */
  bell?: ReactNode;
  children: ReactNode;
}) {
  const firstName = userName.trim().split(/\s+/)[0] ?? userName;
  return (
    <div className="flex min-h-screen">
      <aside className="bg-card sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r p-4 md:flex">
        <Brand />
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <SidebarNav />
        </div>
        <UserMenu name={userName} roleLabel={roleLabel} variant="block" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 sticky top-0 z-20 flex h-16 items-center gap-3 px-4 backdrop-blur md:px-8">
          <MobileNav />
          <TopBarTitle firstName={firstName} />
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
            <TopBarSearch />
            <div className="bg-card rounded-xl border shadow-xs">{bell}</div>
            <div className="md:hidden">
              <UserMenu name={userName} roleLabel={roleLabel} />
            </div>
          </div>
        </header>
        <main id="contenido" className="flex-1 px-4 pt-2 pb-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
