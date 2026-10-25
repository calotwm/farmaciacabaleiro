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

async function createProduct(page: Page, name: string) {
  await page.goto("/productos/nuevo");
  await page.getByLabel("Nombre comercial").fill(name);
  await page.getByLabel("Categoría").selectOption({ label: "Medicamento" });
  await page.getByLabel("Unidad", { exact: true }).selectOption({ label: "Caja" });
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return page.url().split("/").pop() as string;
}

async function enterLot(page: Page, productId: string, lotNumber: string, expiry: string, quantity: string) {
  await page.goto(`/movimientos/nuevo?productId=${productId}&type=ENTRY`);
  await page.getByLabel("Número de lote").fill(lotNumber);
  await page.getByLabel("Vencimiento").fill(expiry);
  await page.getByLabel("Cantidad").fill(quantity);
  await page.getByRole("button", { name: "Registrar movimiento" }).click();
  await expect(page.getByRole("heading", { name: "Movimientos" })).toBeVisible();
}

test("creates a product, enters two lots, registers a FEFO exit and finds it in the history", async ({ page }) => {
  const name = `E2E Ibuprofeno ${Date.now()}`;
  await login(page);
  const productId = await createProduct(page, name);

  await enterLot(page, productId, "L-TARDE", "12/2031", "10");
  await enterLot(page, productId, "L-TEMPRANO", "06/2030", "5");

  // Stock breakdown and "Usar primero" on the earliest-expiring lot.
  await page.goto(`/productos/${productId}`);
  await expect(page.getByTestId("stock-physical")).toContainText("15");
  await expect(page.getByTestId("stock-available")).toContainText("15");
  const firstRow = page.getByRole("row").filter({ hasText: "L-TEMPRANO" });
  await expect(firstRow).toContainText("Usar primero");
  await expect(firstRow).toContainText("30/06/2030");

  // Exit of 7: FEFO takes 5 from L-TEMPRANO and 2 from L-TARDE.
  await page.getByRole("link", { name: "Registrar movimiento" }).click();
  await page.getByText("Salida", { exact: true }).click();
  await page.getByLabel("Cantidad").fill("7");
  await expect(page.getByRole("status").filter({ hasText: "Sugerencia FEFO" })).toContainText("5 u. del lote L-TEMPRANO");
  await expect(page.getByRole("status").filter({ hasText: "Sugerencia FEFO" })).toContainText("2 u. del lote L-TARDE");
  await page.getByRole("button", { name: "Registrar movimiento" }).click();

  await expect(page).toHaveURL(new RegExp(`/movimientos\\?productId=${productId}`));
  const exits = page.getByRole("row").filter({ hasText: "Salida" });
  await expect(exits).toHaveCount(2);
  await expect(exits.filter({ hasText: "L-TEMPRANO" })).toContainText("-5");
  await expect(exits.filter({ hasText: "L-TARDE" })).toContainText("-2");

  // The history is immutable: no edit or delete controls.
  await expect(page.getByRole("button", { name: /editar|eliminar|borrar/i })).toHaveCount(0);

  // Stock updated, and an exit above the available stock is rejected with the available quantity.
  await page.goto(`/productos/${productId}`);
  await expect(page.getByTestId("stock-physical")).toContainText("8");
  await page.goto(`/movimientos/nuevo?productId=${productId}&type=EXIT`);
  await page.getByLabel("Cantidad").fill("20");
  await page.getByRole("button", { name: "Registrar movimiento" }).click();
  await expect(page.getByText(/Stock insuficiente: pediste 20 unidades y hay 8 unidades disponibles/).first()).toBeVisible();
});

test("scans a barcode to start a movement and lists lots with filters", async ({ page }) => {
  const suffix = Date.now().toString();
  const name = `E2E Escaneo ${suffix}`;
  const barcode = `778${suffix}`;
  await login(page);
  await page.goto("/productos/nuevo");
  await page.getByLabel("Nombre comercial").fill(name);
  await page.getByLabel("Código de barras").fill(barcode);
  await page.getByLabel("Categoría").selectOption({ label: "Higiene" });
  await page.getByLabel("Unidad", { exact: true }).selectOption({ label: "Unidad" });
  await page.getByRole("button", { name: "Crear producto" }).click();
  const productId = (await expect(page.getByRole("heading", { name })).toBeVisible(), page.url().split("/").pop() as string);
  await enterLot(page, productId, "ESC-1", "01/01/2032", "3");

  await page.goto("/movimientos/nuevo");
  await page.getByRole("textbox", { name: "Producto" }).fill(barcode);
  await page.getByRole("textbox", { name: "Producto" }).press("Enter");
  await expect(page).toHaveURL(new RegExp(`/movimientos/nuevo\\?productId=${productId}`));

  await page.goto(`/lotes?search=${barcode}`);
  const row = page.getByRole("row").filter({ hasText: "ESC-1" });
  await expect(row).toContainText("01/01/2032");
  await expect(row).toContainText("Normal");
  await page.goto(`/lotes?search=${barcode}&status=EXPIRED`);
  await expect(page.getByText("No hay lotes que coincidan con los filtros.")).toBeVisible();
});
