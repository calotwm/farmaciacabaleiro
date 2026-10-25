export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="grid max-w-3xl gap-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">Este módulo estará disponible próximamente.</p>
    </div>
  );
}
