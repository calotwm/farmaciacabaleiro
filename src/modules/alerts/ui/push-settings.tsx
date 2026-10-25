"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/shared/domain/dates";
import { removePushDeviceAction, removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "./push-actions";

export interface PushDeviceView {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
  disabled: boolean;
}

type Support = "checking" | "supported" | "unsupported" | "ios-needs-install";

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function detectSupport(): Support {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-needs-install";
  const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return ok ? "supported" : "unsupported";
}

/** `publicKey` is null when the server has no VAPID configuration. */
export function PushSettings({ publicKey, devices }: { publicKey: string | null; devices: PushDeviceView[] }) {
  const [support, setSupport] = useState<Support>("checking");
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const current = detectSupport();
    setSupport(current);
    if (current !== "supported") return;
    setPermission(Notification.permission);
    // getRegistration never registers anything: it only looks for an existing worker.
    void navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setThisEndpoint(subscription?.endpoint ?? null))
      .catch(() => setThisEndpoint(null));
  }, []);

  if (!publicKey) return <p className="text-muted-foreground">Notificaciones push no configuradas en el servidor</p>;
  if (support === "checking") return null;
  if (support === "ios-needs-install") {
    return (
      <p className="text-muted-foreground">
        En iPhone y iPad las notificaciones solo funcionan con la app instalada. Abrí el menú Compartir del navegador, elegí &quot;Agregar a pantalla de
        inicio&quot; y activalas desde la app instalada.
      </p>
    );
  }
  if (support === "unsupported") return <p className="text-muted-foreground">Este navegador no admite notificaciones push.</p>;

  const enabledHere = thisEndpoint !== null && devices.some((d) => d.endpoint === thisEndpoint && !d.disabled);

  function enable() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== "granted") {
          toast.error("El permiso de notificaciones fue rechazado. Habilitalo desde la configuración del navegador.");
          return;
        }
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey as string) }));
        const json = subscription.toJSON();
        const saved = await savePushSubscriptionAction({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          userAgent: navigator.userAgent,
        });
        if (!saved.ok) {
          toast.error(saved.message);
          return;
        }
        setThisEndpoint(subscription.endpoint);
        toast.success("Notificaciones activadas en este dispositivo.");
      } catch {
        toast.error("No se pudieron activar las notificaciones en este dispositivo.");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await removePushSubscriptionAction(endpoint);
        }
        setThisEndpoint(null);
        toast.success("Notificaciones desactivadas en este dispositivo.");
      } catch {
        toast.error("No se pudieron desactivar las notificaciones.");
      }
    });
  }

  function sendTest() {
    startTransition(async () => {
      const result = await sendTestPushAction();
      if (result.ok) toast.success("Notificación de prueba enviada.");
      else toast.error(result.message);
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        {permission === "denied" ? (
          <p className="text-destructive text-sm">
            El navegador bloqueó las notificaciones para este sitio. Habilitalas desde la configuración del sitio y volvé a intentar.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {enabledHere ? (
            <Button type="button" variant="outline" onClick={disable} disabled={pending}>
              Desactivar en este dispositivo
            </Button>
          ) : (
            <Button type="button" onClick={enable} disabled={pending || permission === "denied"}>
              Activar notificaciones en este dispositivo
            </Button>
          )}
          <Button type="button" variant="outline" onClick={sendTest} disabled={pending || devices.length === 0}>
            Enviar notificación de prueba
          </Button>
        </div>
      </div>

      <section className="grid gap-2">
        <h2 className="text-lg font-medium">Dispositivos</h2>
        {devices.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay dispositivos con notificaciones activadas.</p>
        ) : (
          <ul className="grid gap-2">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate">
                    {device.userAgent ?? "Dispositivo desconocido"}
                    {device.endpoint === thisEndpoint ? " (este dispositivo)" : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Activado el {formatDateTime(new Date(device.createdAt))}
                    {device.disabled ? " · Desactivado por errores de envío" : ""}
                  </span>
                </div>
                <form action={removePushDeviceAction}>
                  <input type="hidden" name="id" value={device.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Quitar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
