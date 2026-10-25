export function AccessDenied({ message = "No tenés permiso para ver esta sección." }: { message?: string }) {
  return (
    <div className="grid max-w-3xl gap-2">
      <h1 className="text-2xl font-semibold">Acceso denegado</h1>
      <p role="alert" className="text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
