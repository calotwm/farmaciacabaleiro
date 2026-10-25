import { cn } from "@/shared/lib/utils";

/** Loading placeholder block; the pulse only runs when the user has not asked for reduced motion. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn("bg-muted motion-safe:animate-pulse rounded-md", className)} {...props} />;
}
