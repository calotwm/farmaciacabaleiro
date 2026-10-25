export interface CreatedNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  link: string | null;
}

/**
 * Hook point for external channels (Web Push plugs in here). It runs AFTER the notifications are committed,
 * never inside the alert transaction, and its failures are logged and swallowed.
 */
export interface NotificationDispatcher {
  dispatch(notifications: readonly CreatedNotification[]): Promise<void>;
}

export const noopNotificationDispatcher: NotificationDispatcher = { dispatch: async () => {} };

/** Post-commit dispatch that logs and swallows any failure (the in-app notification already exists). */
export async function dispatchSafely(
  dispatcher: NotificationDispatcher,
  notifications: readonly CreatedNotification[],
  onError: (error: unknown) => void = console.error,
): Promise<void> {
  if (notifications.length === 0) return;
  try {
    await dispatcher.dispatch(notifications);
  } catch (error) {
    onError(error);
  }
}

export interface DailyAlertsResult {
  /** AR calendar day the run evaluated. */
  day: string;
  /** New AlertEvents per rule (events that already existed are not counted). */
  events: Record<string, number>;
  /** Notifications created (events x active users). */
  notifications: number;
}
