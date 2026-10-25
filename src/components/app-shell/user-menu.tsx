"use client";

import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/modules/auth/ui/auth-actions";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** `block` is the sidebar footer (avatar, name and role); the default is the compact avatar for the top bar. */
export function UserMenu({ name, roleLabel, variant = "compact" }: { name: string; roleLabel: string; variant?: "compact" | "block" }) {
  const block = variant === "block";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {block ? (
          <Button variant="ghost" className="bg-muted/60 h-auto w-full justify-start gap-3 rounded-xl p-3 text-left" aria-label={`Menú de usuario: ${name}`}>
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary-soft text-primary-soft-foreground font-semibold">{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="grid min-w-0 leading-tight">
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className="text-muted-foreground truncate text-xs font-normal">{roleLabel}</span>
            </span>
          </Button>
        ) : (
          <Button variant="ghost" className="bg-card gap-2 rounded-xl border px-2 shadow-xs" aria-label={`Menú de usuario: ${name}`}>
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary-soft text-primary-soft-foreground font-semibold">{initials(name)}</AvatarFallback>
            </Avatar>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={block ? "start" : "end"} side={block ? "top" : "bottom"} className="w-56">
        <DropdownMenuLabel className="grid gap-0.5">
          <span>{name}</span>
          <span className="text-muted-foreground text-xs font-normal">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut aria-hidden="true" />
              Cerrar sesión
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
