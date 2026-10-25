"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./notification-actions";
import { PRIORITY_DOT, PRIORITY_LABELS, type NotificationPriority } from "./priority";

export interface BellNotification {
  id: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationMenu({ unread, items }: { unread: number; items: BellNotification[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}>
          <Bell aria-hidden="true" />
          {unread > 0 ? (
            <span className="bg-destructive absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-[22rem] max-w-[calc(100vw-1rem)] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notificaciones</span>
          {unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <DropdownMenuItem asChild>
                <button type="submit" className="cursor-pointer text-xs font-normal underline underline-offset-4">
                  Marcar todas
                </button>
              </DropdownMenuItem>
            </form>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? <p className="text-muted-foreground px-2 py-4 text-center text-sm">No hay notificaciones.</p> : null}
        {items.map((item) => (
          <div key={item.id} className={cn("grid gap-0.5 border-b px-2 py-2 last:border-b-0", item.read && "opacity-60")}>
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", PRIORITY_DOT[item.priority])} />
              <div className="grid min-w-0 gap-0.5 text-sm">
                <span className="sr-only">Prioridad {PRIORITY_LABELS[item.priority]}</span>
                {item.link ? (
                  <DropdownMenuItem asChild>
                    <Link href={item.link} className={cn("cursor-pointer p-0 font-medium", !item.read && "font-semibold")}>
                      {item.title}
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <span className="font-medium">{item.title}</span>
                )}
                <span className="text-muted-foreground">{item.body}</span>
                <span className="text-muted-foreground text-xs">{formatDateTime(new Date(item.createdAt))}</span>
              </div>
            </div>
            {item.read ? null : (
              <form action={markNotificationReadAction} className="pl-4">
                <input type="hidden" name="id" value={item.id} />
                <DropdownMenuItem asChild>
                  <button type="submit" className="cursor-pointer p-0 text-xs underline underline-offset-4">
                    Marcar como leída
                  </button>
                </DropdownMenuItem>
              </form>
            )}
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notificaciones" className="cursor-pointer justify-center text-sm">
            Ver todas
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
