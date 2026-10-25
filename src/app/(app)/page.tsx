import { getCurrentUser } from "@/modules/auth/server";

export default async function HomePage() {
  const user = await getCurrentUser();
  return (
    <div className="grid max-w-3xl gap-2">
      <h1 className="text-3xl font-semibold">Hola, {user?.name}</h1>
      <p className="text-muted-foreground">Bienvenido al sistema de gestión de inventario de Farmacia Cabaleiro.</p>
    </div>
  );
}
