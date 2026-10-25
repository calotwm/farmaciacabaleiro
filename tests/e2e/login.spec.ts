import { expect, test, type Page } from "@playwright/test";

const email = () => process.env.E2E_EMAIL ?? "";
const password = () => process.env.E2E_PASSWORD ?? "";

async function login(page: Page, pass = password()) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Contraseña").fill(pass);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

test("shows a generic error for a wrong password", async ({ page }) => {
  await login(page, "wrong-password-123");
  await expect(page.locator("form").getByRole("alert")).toHaveText("Email o contraseña incorrectos");
  await expect(page).toHaveURL(/\/login/);
});

test("validates the form on the server with Spanish messages", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText("Ingresá tu email.")).toBeVisible();
});

test("signs in, shows the app shell and signs out", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Hola, E2E Admin" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Productos" })).toBeVisible();

  const session = (await page.context().cookies()).find((c) => c.name === "fc_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");

  await page.getByRole("button", { name: /Menú de usuario/ }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("admin can open the users page", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/configuracion/usuarios");
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await expect(page.getByRole("cell", { name: email() })).toBeVisible();
});

test("password recovery responds the same for any email", async ({ page }) => {
  await page.goto("/recuperar");
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Si el email está registrado");
});
