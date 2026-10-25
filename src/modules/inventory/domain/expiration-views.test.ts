import { describe, expect, it } from "vitest";
import { bucketFilters, expirationBuckets, resolveBucket, upcomingMonths } from "./expiration-views";

describe("expirationBuckets", () => {
  it("offers expired plus 7, 30 and the widest threshold", () => {
    expect(expirationBuckets(180).map((bucket) => bucket.id)).toEqual(["expired", "d7", "d30", "d180"]);
  });

  it("deduplicates windows when the widest threshold is small", () => {
    expect(expirationBuckets(30).map((bucket) => bucket.id)).toEqual(["expired", "d7", "d30"]);
    expect(expirationBuckets(5).map((bucket) => bucket.id)).toEqual(["expired", "d5", "d7", "d30"]);
  });
});

describe("resolveBucket", () => {
  const buckets = expirationBuckets(90);
  it("falls back to the first window for missing or unknown ids", () => {
    expect(resolveBucket(buckets, undefined).id).toBe("d7");
    expect(resolveBucket(buckets, "nope").id).toBe("d7");
    expect(resolveBucket(buckets, "expired").id).toBe("expired");
    expect(resolveBucket(buckets, "d90").days).toBe(90);
  });
});

describe("bucketFilters", () => {
  const buckets = expirationBuckets(90);
  it("maps the expired bucket to the EXPIRED status and windows to inclusive date ranges", () => {
    expect(bucketFilters(buckets[0]!, "2026-10-25")).toEqual({ status: "EXPIRED" });
    expect(bucketFilters(buckets[1]!, "2026-10-25")).toEqual({ status: "", expiryFrom: "2026-10-25", expiryTo: "2026-11-01" });
  });
});

describe("upcomingMonths", () => {
  it("starts today, then whole months, rolling over the year", () => {
    const months = upcomingMonths("2026-11-15", 3);
    expect(months.map((m) => [m.key, m.from, m.to])).toEqual([
      ["2026-11", "2026-11-15", "2026-11-30"],
      ["2026-12", "2026-12-01", "2026-12-31"],
      ["2027-01", "2027-01-01", "2027-01-31"],
    ]);
    expect(months[2]?.label).toBe("ene 2027");
  });

  it("handles leap-year February", () => {
    expect(upcomingMonths("2028-01-31", 2)[1]).toMatchObject({ key: "2028-02", to: "2028-02-29" });
  });
});
