import type { PermissionKey } from "@/modules/auth/domain/permissions";

export interface SettingsSectionLink {
  href: string;
  label: string;
  /** Permission needed to see the section; every signed-in user sees the ones without it. */
  permission?: PermissionKey;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionLink[] = [
  { href: "/configuracion/general", label: "General", permission: "settings.manage" },
  { href: "/configuracion/vencimientos", label: "Vencimientos", permission: "settings.manage" },
  { href: "/configuracion/notificaciones", label: "Notificaciones" },
  { href: "/configuracion/categorias", label: "Categorías", permission: "catalog.manage" },
  { href: "/configuracion/unidades", label: "Unidades", permission: "catalog.manage" },
  { href: "/configuracion/usuarios", label: "Usuarios y roles", permission: "users.manage" },
  { href: "/configuracion/cuenta", label: "Mi cuenta" },
];

/** The sections a user may open, in display order. */
export function settingsSectionsFor(can: (key: PermissionKey) => boolean): SettingsSectionLink[] {
  return SETTINGS_SECTIONS.filter((section) => !section.permission || can(section.permission));
}
