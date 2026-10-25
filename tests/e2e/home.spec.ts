import { expect, test } from "@playwright/test";

test("home page shows the pharmacy name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Farmacia Cabaleiro" })).toBeVisible();
});
