import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/modules/auth/server";
import { LoginForm } from "@/modules/auth/ui/login-form";

export const metadata: Metadata = { title: "Iniciar sesión - Farmacia Cabaleiro" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");
  const { next, reset } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Iniciar sesión</h1>
        </CardTitle>
        <CardDescription>Ingresá con tu email y contraseña.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} justReset={reset === "1"} />
      </CardContent>
    </Card>
  );
}
