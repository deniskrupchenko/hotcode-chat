import { test, expect } from "@playwright/test";

test.describe("HotCodeChat smoke", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/login/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
  });
});


