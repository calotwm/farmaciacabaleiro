"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setActiveAction } from "./user-actions";

export function ToggleActiveButton({
  userId,
  userName,
  active,
  isSelf,
}: {
  userId: string;
  userName: string;
  active: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setActiveAction(userId, !active);
      if (result.error) toast.error(result.error);
      else toast.success(result.success ?? "Listo.");
    });
  }

  return (
    <Button
      variant={active ? "outline" : "default"}
      size="sm"
      onClick={toggle}
      disabled={pending || (isSelf && active)}
      aria-label={`${active ? "Desactivar" : "Activar"} a ${userName}`}
      title={isSelf && active ? "No podés desactivar tu propia cuenta" : undefined}
    >
      {active ? "Desactivar" : "Activar"}
    </Button>
  );
}
