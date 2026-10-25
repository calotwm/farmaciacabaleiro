import { cn } from "@/shared/lib/utils";

/** Form-level feedback. Errors use role=alert, success uses role=status. */
export function FormBanner({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  const isError = !!error;
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        isError
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
      )}
    >
      {error ?? success}
    </p>
  );
}
