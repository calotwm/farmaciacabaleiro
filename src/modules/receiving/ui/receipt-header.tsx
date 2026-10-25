import type { ReceiptRecord } from "../application/ports";
import { ReceiptIssuesBadge, ReceiptStatusBadge } from "./receipt-badges";

/** Status and issue badges of a receipt page header. */
export function ReceiptBadgesFor({ receipt }: { receipt: ReceiptRecord }) {
  return (
    <>
      <ReceiptStatusBadge status={receipt.status} isPartial={receipt.isPartial} />
      <ReceiptIssuesBadge count={receipt.issues.length} />
    </>
  );
}
