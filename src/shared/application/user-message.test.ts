import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "../domain/errors";
import { toUserMessage, UNKNOWN_ERROR_MESSAGE } from "./user-message";

describe("toUserMessage", () => {
  it("maps domain errors to Spanish messages", () => {
    expect(toUserMessage(new ForbiddenError("users.manage"))).toMatch(/permiso/);
    expect(toUserMessage(new NotFoundError("product"))).toMatch(/No se encontró/);
    expect(toUserMessage(new ValidationError())).toMatch(/Revisá/);
  });

  it("never leaks internals of unknown errors", () => {
    expect(toUserMessage(new Error("connection string postgres://secret"))).toBe(UNKNOWN_ERROR_MESSAGE);
    expect(toUserMessage("boom")).toBe(UNKNOWN_ERROR_MESSAGE);
  });
});
