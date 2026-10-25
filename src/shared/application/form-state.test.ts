import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConflictError, ValidationError } from "../domain/errors";
import { errorToFormState, formValues, parseForm } from "./form-state";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("form state helpers", () => {
  it("echoes submitted values on validation errors but never passwords or tokens", () => {
    const schema = z.object({ email: z.string().min(5, "corto"), password: z.string() });
    const result = parseForm(schema, form({ email: "a@b", password: "secret", resetToken: "abc" }));
    expect("state" in result && result.state.values).toEqual({ email: "a@b" });
    expect("state" in result && result.state.fieldErrors).toEqual({ email: ["corto"] });
  });

  it("formValues ignores files", () => {
    const data = form({ name: "x" });
    data.set("file", new Blob(["data"]), "f.txt");
    expect(formValues(data)).toEqual({ name: "x" });
  });

  it("collects repeated fields into arrays on request and echoes them joined", () => {
    const data = new FormData();
    data.append("days", "1");
    data.append("days", "5");
    const schema = z.object({ days: z.array(z.string()) });
    expect(parseForm(schema, data, { arrayFields: ["days"] })).toEqual({ data: { days: ["1", "5"] } });
    expect(formValues(data)).toEqual({ days: "1,5" });
  });

  it("maps field errors from validation and conflict errors", () => {
    expect(errorToFormState(new ValidationError("x", { name: ["falta"] })).fieldErrors).toEqual({ name: ["falta"] });
    const conflict = new ConflictError("dup", "Ya existe.", { barcode: ["Ya existe."] });
    expect(errorToFormState(conflict)).toEqual({ error: "Ya existe.", fieldErrors: { barcode: ["Ya existe."] } });
  });
});
