import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class names and skips falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("lets later Tailwind classes override earlier conflicting ones", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
