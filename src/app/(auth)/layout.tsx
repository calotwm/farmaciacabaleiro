import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <p className="text-muted-foreground mb-4 text-center text-sm font-medium tracking-wide uppercase">
          Farmacia Cabaleiro
        </p>
        {children}
      </div>
    </main>
  );
}
