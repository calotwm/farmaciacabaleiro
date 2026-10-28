import { describe, expect, it } from "vitest";
import { clientIpFrom } from "./client-ip";

describe("clientIpFrom", () => {
  it("uses X-Real-IP and ignores a client-supplied X-Forwarded-For", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1, 203.0.113.7" });
    expect(clientIpFrom(headers)).toBe("203.0.113.7");
  });

  it("returns unknown without X-Real-IP, even when X-Forwarded-For is present", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "10.0.0.1" }))).toBe("unknown");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
