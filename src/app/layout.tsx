import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farmacia Cabaleiro",
  description: "Gestión de inventario de Farmacia Cabaleiro",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="bg-background text-foreground antialiased">
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
