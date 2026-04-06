import { expect, test } from "@playwright/test";

import { readRelayEnv } from "./support/relay-env";

test("public shell routes stay available after login", async ({ page }) => {
  const { RELAY_ACCESS_PASSWORD: password } = readRelayEnv();
  test.skip(!password, "RELAY_ACCESS_PASSWORD is required for protected route smoke coverage.");

  await page.goto("/login?next=%2Fmobile", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".login-page-panel")).toBeVisible();

  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/mobile", { waitUntil: "domcontentloaded" });

  await expect(page.locator("main.mobile-app")).toBeVisible();
  await expect(page.locator(".mobile-topbar")).toBeVisible();

  await page.goto("/workspace", { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/mobile", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main.mobile-app")).toBeVisible();

  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".settings-page")).toBeVisible();
  await expect(page.locator('[role="tablist"]')).toBeVisible();
});
