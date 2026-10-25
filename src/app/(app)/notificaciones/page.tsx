import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { getAlertsModule } from "@/modules/alerts/composition";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/modules/alerts/ui/notification-actions";
import { PRIORITY_DOT, PRIORITY_LABELS } from "@/modules/alerts/ui/priority";
import { getCurrentUser } from "@/modules/auth/server";
import { DEFAULT_PAGE_SIZE, parsePage, type SearchParams } from "@/shared/application/list-query";
import { formatDateTime } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";

export const metadata: Metadata = { title: "Notificaciones - Farmacia Cabaleiro" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const page = parsePage((await searchParams).page);
  const { notifications } = getAlertsModule();
  const [{ items, total }, unread] = await Promise.all([notifications.page(user.id, page, DEFAULT_PAGE_SIZE), notifications.unreadCount(user.id)]);

  return (
    <div className="grid max-w-3xl gap-4">
      <PageHeader
        title="Notificaciones"
        description="Avisos generados por el sistema."
        actions={
          <>
            {unread > 0 ? (
              <form action={markAllNotificationsReadAction}>
                <Button type="submit" variant="outline">
                  Marcar todas como leídas ({unread})
                </Button>
              </form>
            ) : null}
          </>
        }
      />
      {items.length === 0 ? (
        <p className="text-muted-foreground">No hay notificaciones.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {items.map((item) => (
            <li key={item.id} className={cn("flex flex-wrap items-start justify-between gap-3 px-4 py-3", item.readAt && "opacity-60")}>
              <div className="grid min-w-0 gap-0.5">
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[item.priority])} />
                  <span className="sr-only">Prioridad {PRIORITY_LABELS[item.priority]}: </span>
                  {item.link ? (
                    <Link href={item.link} className="underline-offset-4 hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </span>
                <span className="text-muted-foreground text-sm">{item.body}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDateTime(item.createdAt)} · {PRIORITY_LABELS[item.priority]}
                </span>
              </div>
              {item.readAt ? null : (
                <form action={markNotificationReadAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Marcar como leída
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath="/notificaciones" params={{}} page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} />
    </div>
  );
}
