import type { ReactNode } from "react";
import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { TopBarSearch, TopBarTitle } from "./top-bar";
import { UserMenu } from "./user-menu";

/**
 * Presentational shell: sidebar (brand, nav, user block) on desktop, drawer on mobile, and a ruled top bar
 * with the section title, greeting, search and notification bell over the ivory canvas.
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
      <aside className="bg-card sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-5 border-r p-3 md:flex">
        <Brand />
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <SidebarNav />
        </div>
        <UserMenu name={userName} roleLabel={roleLabel} variant="block" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 md:px-8">
          <MobileNav />
          <TopBarTitle firstName={firstName} />
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
            <TopBarSearch />
            <div className="bg-card rounded-md border">{bell}</div>
            <div className="md:hidden">
              <UserMenu name={userName} roleLabel={roleLabel} />
            </div>
          </div>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-[88rem] flex-1 px-4 pt-6 pb-10 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
