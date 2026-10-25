import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  House,
  type LucideIcon,
  Package,
  Settings,
  Truck,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Inicio", icon: House },
  { href: "/productos", label: "Productos", icon: Package },
  { href: "/lotes", label: "Lotes", icon: Boxes },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/vencimientos", label: "Vencimientos", icon: CalendarClock },
  { href: "/proveedores", label: "Proveedores", icon: Truck },
  { href: "/entregas", label: "Entregas", icon: CalendarDays },
  { href: "/recepciones", label: "Recepciones", icon: ClipboardCheck },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
