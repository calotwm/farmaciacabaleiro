const LABELS: Record<string, string> = { admin: "Administrador", employee: "Empleado" };

export function roleLabel(roleName: string): string {
  return LABELS[roleName] ?? roleName;
}
