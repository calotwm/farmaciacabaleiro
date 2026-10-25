import { ADMIN_ROLE } from "@/modules/auth/domain/permissions";
import { type CalendarDate, toDbDate } from "@/shared/domain/dates";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { dispatchSafely, type NotificationDispatcher, noopNotificationDispatcher } from "@/modules/alerts/application/ports";
import type { ReceiptAlerts } from "../application/ports";

/**
 * `RECEIPT_ISSUE` alert for a confirmed receipt with issues, idempotent per receipt and day: the AlertEvent
 * unique key and the (user, alert) unique key make a repeated publication create nothing new.
 * Recipients are active users who can read receipts (admins and roles with `receiving.read`).
 */
export class PrismaReceiptAlerts implements ReceiptAlerts {
  constructor(
    private readonly db: DbClient,
    private readonly dispatcher: NotificationDispatcher = noopNotificationDispatcher,
  ) {}

  async publishIssues(receipt: { id: string; supplierName: string; issueCount: number }, today: CalendarDate): Promise<void> {
    const key = { rule: "RECEIPT_ISSUE" as const, entityType: "receipt", entityId: receipt.id, thresholdKey: "", eventDate: toDbDate(today) };
    await this.db.alertEvent.createMany({
      data: [{ ...key, payload: { receiptId: receipt.id, supplierName: receipt.supplierName, issueCount: receipt.issueCount } }],
      skipDuplicates: true,
    });
    const event = await this.db.alertEvent.findUniqueOrThrow({
      where: { rule_entityType_entityId_thresholdKey_eventDate: key },
      select: { id: true },
    });

    const recipients = await this.db.user.findMany({
      where: {
        active: true,
        OR: [{ role: { name: ADMIN_ROLE } }, { role: { permissions: { some: { permission: { key: "receiving.read" } } } } }],
      },
      select: { id: true },
    });
    const created = await this.db.notification.createManyAndReturn({
      select: { id: true, userId: true, title: true, body: true, priority: true, link: true },
      data: recipients.map((user) => ({
        userId: user.id,
        alertEventId: event.id,
        title: `Recepción con problemas: ${receipt.supplierName}`,
        body: `Se registró ${receipt.issueCount === 1 ? "1 problema" : `${receipt.issueCount} problemas`} al recibir la mercadería. Revisalo en la recepción.`,
        priority: "MEDIUM" as const,
        link: `/recepciones/${receipt.id}`,
      })),
      skipDuplicates: true,
    });
    // Only newly created notifications are returned, so a repeated publication never pushes twice.
    await dispatchSafely(this.dispatcher, created);
  }
}
