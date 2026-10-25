import { Skeleton } from "@/components/ui/skeleton";

/** Shown while any section of the app streams in. */
export default function Loading() {
  return (
    <div className="grid gap-5" role="status" aria-label="Cargando">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-72 w-full" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
