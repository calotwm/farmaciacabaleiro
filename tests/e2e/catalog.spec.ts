import { expect, test, type Page } from "@playwright/test";

const email = () => process.env.E2E_EMAIL ?? "";
const password = () => process.env.E2E_PASSWORD ?? "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Usuario o email").fill(email());
  await page.getByLabel("Contraseña").fill(password());
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("creates a product, finds it by barcode scan and archives it", async ({ page }) => {
  const suffix = Date.now().toString();
  const name = `E2E Cepillo ${suffix}`;
  const barcode = `779${suffix}`;

  await login(page);
  await page.goto("/productos/nuevo");
  await page.getByLabel("Nombre comercial").fill(name);
  await page.getByLabel("Categoría").selectOption({ label: "Higiene" });
  await page.getByLabel("Unidad", { exact: true }).selectOption({ label: "Unidad" });
  // A scanner types the code and ends with Enter: the form must not submit.
  await page.getByLabel("Código de barras").fill(barcode);
  await page.getByLabel("Código de barras").press("Enter");
  await expect(page).toHaveURL(/\/productos\/nuevo$/);
  await expect(page.getByLabel("SKU")).toBeFocused();
  await page.getByRole("button", { name: "Crear producto" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(barcode)).toBeVisible();

  // The same barcode again is rejected with a friendly message on the field.
  await page.goto("/productos/nuevo");
  await page.getByLabel("Nombre comercial").fill(`${name} duplicado`);
  await page.getByLabel("Categoría").selectOption({ label: "Higiene" });
  await page.getByLabel("Unidad", { exact: true }).selectOption({ label: "Unidad" });
  await page.getByLabel("Código de barras").fill(barcode);
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(page.getByText("Ya existe un producto con ese código de barras.").first()).toBeVisible();
  await expect(page.getByLabel("Nombre comercial")).toHaveValue(`${name} duplicado`);

  // Scanning the barcode in the list jumps straight to the product.
  await page.goto("/productos");
  await page.getByLabel("Buscar").fill(barcode);
  await page.getByLabel("Buscar").press("Enter");
  await expect(page.getByRole("heading", { name })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archivar" }).click();
  await expect(page.getByRole("button", { name: "Desarchivar" })).toBeVisible();

  await page.goto(`/productos?q=${encodeURIComponent(name)}`);
  await expect(page.getByText("No hay productos que coincidan con la búsqueda.")).toBeVisible();
  await page.goto(`/productos?q=${encodeURIComponent(name)}&status=ARCHIVED`);
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("administers categories: create, duplicate error and delete", async ({ page }) => {
  const name = `E2E Categoría ${Date.now()}`;
  await login(page);
  await page.goto("/configuracion/categorias");
  await page.getByLabel("Nueva categoría").fill(name);
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByLabel(`Nombre de ${name}`)).toBeVisible();

  await page.getByLabel("Nueva categoría").fill(name.toLowerCase());
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByText("Ya existe una categoría con ese nombre.").first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Eliminar ${name}` }).click();
  await expect(page.getByLabel(`Nombre de ${name}`)).toHaveCount(0);
});
