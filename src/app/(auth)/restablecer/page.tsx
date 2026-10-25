import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "@/modules/auth/ui/reset-password-form";

export const metadata: Metadata = { title: "Restablecer contraseña - Farmacia Cabaleiro" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Elegí una nueva contraseña</h1>
        </CardTitle>
        <CardDescription>El enlace vence a la hora y solo puede usarse una vez.</CardDescription>
      </CardHeader>
      <CardContent>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="grid gap-4 text-sm">
            <span role="alert" className="text-destructive">
              El enlace no es válido.
            </span>
            <Link href="/recuperar" className="underline underline-offset-4">
              Pedir un enlace nuevo
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
