import { expect, test } from "@playwright/test";

test("unauthenticated visitors are redirected from home to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByText("Farmacia Cabaleiro", { exact: true })).toBeVisible();
});

test("protected routes keep the requested path for after login", async ({ page }) => {
  await page.goto("/productos");
  await expect(page).toHaveURL(/\/login\?next=%2Fproductos$/);
});
