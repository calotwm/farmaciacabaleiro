import { expect, test, type Page } from "@playwright/test";

const email = () => process.env.E2E_EMAIL ?? "";
const password = () => process.env.E2E_PASSWORD ?? "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Contraseña").fill(password());
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("counts a lot, sees the difference, closes the count and finds the correction in the history", async ({ page }) => {
  const suffix = Date.now().toString();
  const name = `E2E Conteo ${suffix}`;
  const barcode = `777${suffix}`;
  const location = `E2E-UBIC-${suffix}`;

  await login(page);
  await page.goto("/productos/nuevo");
  await page.getByLabel("Nombre comercial").fill(name);
  await page.getByLabel("Código de barras").fill(barcode);
  await page.getByLabel("Categoría").selectOption({ label: "Higiene" });
  await page.getByLabel("Unidad", { exact: true }).selectOption({ label: "Unidad" });
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const productId = page.url().split("/").pop() as string;

  await page.goto(`/movimientos/nuevo?productId=${productId}&type=ENTRY`);
  await page.getByLabel("Número de lote").fill("CNT-1");
  await page.getByLabel("Vencimiento").fill("01/01/2033");
  await page.getByLabel("Cantidad").fill("10");
  await page.getByLabel("Ubicación").fill(location);
  await page.getByRole("button", { name: "Registrar movimiento" }).click();
  await expect(page.getByRole("heading", { name: "Movimientos" })).toBeVisible();

  // Open a count limited to this location (so it only holds this test's lot).
  await page.goto("/conteos");
  await page.getByLabel("Ubicación").fill(location);
  await page.getByRole("button", { name: "Abrir conteo" }).click();
  await expect(page.getByRole("heading", { name: /Conteo del/ })).toBeVisible();

  // Scanning the barcode jumps to the lot's input.
  await page.getByRole("textbox", { name: "Ir a un producto" }).fill(barcode);
  await page.getByRole("textbox", { name: "Ir a un producto" }).press("Enter");
  const counted = page.getByLabel(`Cantidad contada de ${name}, lote CNT-1`);
  await expect(counted).toBeFocused();

  await counted.fill("7");
  await expect(page.getByTestId("count-summary")).toContainText("1 de 1 lotes contados · 1 con diferencias (+0 / -3 unidades)");
  await page.getByRole("button", { name: "Guardar conteo" }).click();
  await expect(page.getByText("Conteo guardado (1 lote actualizado).").first()).toBeVisible();

  // Closing needs a reason.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cerrar conteo" }).click();
  await expect(page.getByText("Elegí un motivo o escribí el detalle: es obligatorio para cerrar el conteo.").first()).toBeVisible();

  await page.getByLabel("Motivo", { exact: true }).selectOption({ label: "Diferencia de inventario" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cerrar conteo" }).click();
  await expect(page.getByTestId("count-closed-summary")).toContainText("1 con diferencias");
  // A closed count is read-only.
  await expect(page.getByRole("button", { name: "Guardar conteo" })).toHaveCount(0);
  await expect(page.getByLabel(`Cantidad contada de ${name}, lote CNT-1`)).toHaveCount(0);

  await page.goto(`/movimientos?productId=${productId}`);
  const correction = page.getByRole("row").filter({ hasText: "Corrección por conteo (resta)" });
  await expect(correction).toContainText("-3");
  await expect(correction).toContainText("Diferencia de inventario");
  await page.goto(`/productos/${productId}`);
  await expect(page.getByTestId("stock-physical")).toContainText("7");
});
