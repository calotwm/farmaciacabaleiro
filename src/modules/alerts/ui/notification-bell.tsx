import { getAlertsModule } from "../composition";
import { NotificationMenu } from "./notification-menu";

/** Header bell: unread badge and the latest 10 notifications of the current user. */
export async function NotificationBell({ userId }: { userId: string }) {
  const { notifications } = getAlertsModule();
  const [unread, latest] = await Promise.all([notifications.unreadCount(userId), notifications.latest(userId, 10)]);
  return (
    <NotificationMenu
      unread={unread}
      items={latest.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        priority: n.priority,
        link: n.link,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  );
}
