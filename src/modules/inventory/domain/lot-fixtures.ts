import type { LotState } from "./lot";

/** Test helper: a lot with sensible defaults (AVAILABLE, 10 units, far-future expiry). */
export function makeLot(overrides: Partial<LotState> & { id: string }): LotState {
  return {
    productId: "product-1",
    lotNumber: overrides.id.toUpperCase(),
    expiryDate: "2030-06-30",
    receivedAt: new Date("2026-01-01T12:00:00Z"),
    currentQuantity: 10,
    blockedQuantity: 0,
    status: "AVAILABLE",
    ...overrides,
  };
}

/** Test helper: the Spanish text a failing call would show the user (userMessage or field errors). */
export function userTextOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    const { userMessage, fieldErrors } = error as { userMessage?: string; fieldErrors?: Record<string, string[]> };
    return userMessage ?? Object.values(fieldErrors ?? {}).flat().join(" ");
  }
  throw new Error("expected the call to throw");
}
