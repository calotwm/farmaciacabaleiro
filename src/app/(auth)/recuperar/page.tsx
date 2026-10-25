import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestResetForm } from "@/modules/auth/ui/request-reset-form";

export const metadata: Metadata = { title: "Recuperar contraseña - Farmacia Cabaleiro" };

export default function RecoverPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Recuperar contraseña</h1>
        </CardTitle>
        <CardDescription>Te enviamos un enlace por email para elegir una nueva contraseña.</CardDescription>
      </CardHeader>
      <CardContent>
        <RequestResetForm />
      </CardContent>
    </Card>
  );
}
