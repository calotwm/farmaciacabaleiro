import { describe, expect, it } from "vitest";
import { settingsSectionsFor } from "./sections";

describe("settingsSectionsFor", () => {
  it("shows every section to an administrator, in order", () => {
    expect(settingsSectionsFor(() => true).map((section) => section.label)).toEqual([
      "General",
      "Vencimientos",
      "Notificaciones",
      "Categorías",
      "Unidades",
      "Usuarios y roles",
      "Mi cuenta",
    ]);
  });

  it("leaves only the sections without a permission for a user with none", () => {
    expect(settingsSectionsFor(() => false).map((section) => section.href)).toEqual(["/configuracion/notificaciones", "/configuracion/cuenta"]);
  });

  it("filters by the single permission each section needs", () => {
    const hrefs = settingsSectionsFor((key) => key === "catalog.manage").map((section) => section.href);
    expect(hrefs).toContain("/configuracion/categorias");
    expect(hrefs).not.toContain("/configuracion/usuarios");
  });
});
